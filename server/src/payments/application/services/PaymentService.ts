import { IPaymentService } from './IPaymentService';
import { IPaymentRepository } from '../../interfaces/IPaymentRepository';
import { IPaymentGateway } from '../../interfaces/IPaymentGateway';
import { CreatePaymentDTO } from '../dtos/CreatePaymentDTO';
import { PaymentResponseDTO } from '../dtos/PaymentResponseDTO';
import { Payment } from '../../domain/entities/Payment';
import { PaymentStatus } from '../../domain/enums/PaymentStatus';
import { Currency } from '../../domain/enums/Currency';
import { PaymentValidationError, PaymentRepositoryError, ProviderApiError } from '../../domain/errors/PaymentErrors';
import { PaymentStateMachine } from '../../domain/transitions/PaymentStateMachine';
import { PaymentValidator } from '../../domain/validation/PaymentValidator';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';
import { randomUUID } from 'crypto';

// Import database wrapper for transactions and direct queries
import db from '../../../config/database';

export class PaymentService implements IPaymentService {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly paymentGateway: IPaymentGateway
  ) {}

  public async initiatePayment(dto: CreatePaymentDTO, correlationId?: CorrelationId): Promise<PaymentResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const correlationStr = cid.value;

    console.log(`[${correlationStr}] [PaymentService] Initiating payment for order #${dto.orderId}`);

    // 1. Fetch the Order from DB to perform security checks (never trust client amounts/states)
    const [orders]: any = await db.execute('SELECT * FROM orders WHERE id = ?', [dto.orderId]);
    if (!orders || orders.length === 0) {
      throw new PaymentValidationError('Order not found');
    }
    const order = orders[0];

    // Security Check: Verify authenticated student owns the order
    if (order.student_id !== dto.studentId) {
      throw new PaymentValidationError('Access Denied: You do not own this order');
    }

    // Security Check: Verify order is in payable state ('pending')
    if (order.status !== 'pending') {
      throw new PaymentValidationError(`Order is not in a payable state. Current state: ${order.status}`);
    }

    // Security Check: Compute price server-side in minor currency units (paise)
    const computedAmount = Math.round(parseFloat(order.total_price) * 100);

    // 2. Validate creation parameters against domain constraints
    PaymentValidator.validateCreatePayment({
      orderId: dto.orderId,
      studentId: dto.studentId,
      amount: computedAmount,
      currency: Currency.INR,
      paymentMethod: dto.paymentMethod,
      gateway: dto.gateway,
      idempotencyKey: dto.idempotencyKey
    });

    // 3. Prevent duplicate active payments & support idempotency
    const activePayment = await this.paymentRepository.findActiveByOrderId(dto.orderId);
    
    if (activePayment) {
      // Idempotency: Check if the request matches the current active payment
      if (activePayment.idempotencyKey === dto.idempotencyKey) {
        console.log(`[${correlationStr}] [PaymentService] Active session found matching idempotency key: ${dto.idempotencyKey}`);
        
        if (activePayment.gatewayOrderId) {
          return this.mapToResponseDTO(activePayment);
        }
        
        // If it was created locally but failed to initiate at Razorpay, retry gateway order setup
        return this.createGatewayOrder(activePayment, correlationStr);
      }

      // Check if the lock can be cleared (Stale CREATED recovery strategy)
      const createdAtTime = activePayment.createdAt ? activePayment.createdAt.getTime() : Date.now();
      const ageInMs = Date.now() - createdAtTime;
      const isStale = activePayment.status === PaymentStatus.CREATED && ageInMs > 5 * 60 * 1000; // > 5 minutes

      if (isStale) {
        console.log(`[${correlationStr}] [PaymentService] Stale CREATED payment session (ID: ${activePayment.id}) detected. Performing recovery cleanup.`);
        
        // Mark stale record as FAILED
        activePayment.status = PaymentStatus.FAILED;
        activePayment.errorCode = 'STALE_INITIATION_CLEANUP';
        activePayment.errorMessage = 'Stale payment session cleaned up during new initiation request';
        activePayment.failedAt = new Date();

        const conn = await db.getConnection();
        try {
          await conn.beginTransaction();
          await this.paymentRepository.update(activePayment, conn);
          await conn.commit();
        } catch (err: any) {
          await conn.rollback();
          throw new PaymentRepositoryError('Failed to transition stale payment session to failed state', err);
        } finally {
          conn.release();
        }
      } else {
        // Block duplicate active sessions with different keys
        throw new PaymentValidationError('An active payment session is already in progress for this order');
      }
    }

    // Double check: if payment key is used globally but order was failed, reject or handle
    const existingByKey = await this.paymentRepository.findByIdempotencyKey(dto.idempotencyKey);
    if (existingByKey) {
      if (existingByKey.gatewayOrderId) {
        return this.mapToResponseDTO(existingByKey);
      }
      return this.createGatewayOrder(existingByKey, correlationStr);
    }

    // 4. Create the local payment record
    const paymentReference = this.generatePaymentReference();
    const uuid = randomUUID();

    const payment: Payment = {
      uuid,
      paymentReference,
      orderId: dto.orderId,
      studentId: dto.studentId,
      amount: computedAmount,
      currency: Currency.INR,
      status: PaymentStatus.CREATED,
      paymentMethod: dto.paymentMethod,
      gateway: dto.gateway,
      idempotencyKey: dto.idempotencyKey,
      verifiedAt: null,
      failedAt: null,
      providerMetadata: null
    };

    console.log(`[${correlationStr}] [PaymentService] Inserting initial CREATED payment record in database`);
    
    const conn = await db.getConnection();
    let savedPayment: Payment;
    try {
      await conn.beginTransaction();
      savedPayment = await this.paymentRepository.create(payment, conn);
      await conn.commit();
    } catch (err: any) {
      await conn.rollback();
      throw new PaymentRepositoryError('Failed to insert initial payment record', err);
    } finally {
      conn.release();
    }

    // 5. Connect to external provider to create Razorpay Order
    return this.createGatewayOrder(savedPayment, correlationStr);
  }

  private async createGatewayOrder(payment: Payment, correlationStr: string): Promise<PaymentResponseDTO> {
    try {
      console.log(`[${correlationStr}] [PaymentService] Creating Razorpay order for ref ${payment.paymentReference}`);
      const session = await this.paymentGateway.createSession(payment);

      // Verify the transition from CREATED to INITIATED
      PaymentStateMachine.verifyTransition(payment.status, PaymentStatus.INITIATED);
      
      payment.status = PaymentStatus.INITIATED;
      payment.gatewayOrderId = session.gatewayOrderId;
      payment.providerMetadata = {
        ...(payment.providerMetadata || {}),
        ...session.providerRawResponse
      };

      console.log(`[${correlationStr}] [PaymentService] Order created at gateway. Updating status to INITIATED in database`);
      
      const conn = await db.getConnection();
      let updatedPayment: Payment;
      try {
        await conn.beginTransaction();
        updatedPayment = await this.paymentRepository.update(payment, conn);
        await conn.commit();
      } catch (err: any) {
        await conn.rollback();
        throw new PaymentRepositoryError('Failed to save updated payment status', err);
      } finally {
        conn.release();
      }

      return this.mapToResponseDTO(updatedPayment);
    } catch (err: any) {
      console.error(`[${correlationStr}] [PaymentService] Gateway order creation failed. Rolling back to FAILED locally:`, err);
      
      try {
        PaymentStateMachine.verifyTransition(payment.status, PaymentStatus.FAILED);
        payment.status = PaymentStatus.FAILED;
        payment.errorCode = err.errorCode || err.code || 'GATEWAY_ERROR';
        payment.errorMessage = err.message || 'Failed to create order on payment gateway';
        payment.failedAt = new Date();

        const conn = await db.getConnection();
        try {
          await conn.beginTransaction();
          await this.paymentRepository.update(payment, conn);
          await conn.commit();
        } catch (e) {
          await conn.rollback();
        } finally {
          conn.release();
        }
      } catch (stateErr) {
        // Safe check: ignore transition issues here to ensure original error is reported
      }

      if (err instanceof ProviderApiError) {
        throw err;
      }
      throw new ProviderApiError(payment.gateway, err.message || 'Order creation failed', err);
    }
  }

  private generatePaymentReference(): string {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomSuffix = '';
    for (let i = 0; i < 4; i++) {
      randomSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return `CP-PAY-${yyyy}${mm}${dd}-${randomSuffix}`;
  }

  private mapToResponseDTO(payment: Payment): PaymentResponseDTO {
    return {
      uuid: payment.uuid,
      paymentReference: payment.paymentReference,
      orderId: payment.orderId,
      studentId: payment.studentId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      gateway: payment.gateway,
      gatewayOrderId: payment.gatewayOrderId || null,
      gatewayPaymentId: payment.gatewayPaymentId || null,
      errorCode: payment.errorCode || null,
      errorMessage: payment.errorMessage || null,
      verifiedAt: payment.verifiedAt || null,
      failedAt: payment.failedAt || null,
      createdAt: payment.createdAt
    };
  }
}
