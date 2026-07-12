import { IPaymentService } from './IPaymentService';
import { IPaymentRepository } from '../../interfaces/IPaymentRepository';
import { IPaymentGateway } from '../../interfaces/IPaymentGateway';
import { IWebhookEventRepository } from '../../interfaces/IWebhookEventRepository';
import { CreatePaymentDTO } from '../dtos/CreatePaymentDTO';
import { PaymentResponseDTO } from '../dtos/PaymentResponseDTO';
import { VerifyPaymentDTO } from '../dtos/VerifyPaymentDTO';
import { VerifyPaymentResponseDTO } from '../dtos/VerifyPaymentResponseDTO';
import { Payment } from '../../domain/entities/Payment';
import { WebhookEvent } from '../../domain/entities/WebhookEvent';
import { PaymentStatus } from '../../domain/enums/PaymentStatus';
import { Currency } from '../../domain/enums/Currency';
import { VerificationSource } from '../../domain/enums/VerificationSource';
import { WebhookProcessingStatus } from '../../domain/enums/WebhookProcessingStatus';
import { PaymentValidationError, PaymentRepositoryError, ProviderApiError } from '../../domain/errors/PaymentErrors';
import { PaymentStateMachine } from '../../domain/transitions/PaymentStateMachine';
import { PaymentValidator } from '../../domain/validation/PaymentValidator';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';
import { randomUUID } from 'crypto';
import crypto from 'crypto';

// Import database wrapper for transactions and direct queries
import db from '../../../config/database';

export class PaymentService implements IPaymentService {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly paymentGateway: IPaymentGateway,
    private readonly webhookEventRepository?: IWebhookEventRepository
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

  private async capturePaymentInternal(
    payment: Payment,
    gatewayPaymentId: string,
    gatewaySignature: string | null,
    source: VerificationSource,
    rawProviderPayload: any,
    conn: any,
    correlationStr: string
  ): Promise<void> {
    // 1. Double Spend Prevention: Check if gatewayPaymentId is already used by ANOTHER session
    const existingByPaymentId = await this.paymentRepository.findByGatewayPaymentId(gatewayPaymentId, conn);
    if (existingByPaymentId && existingByPaymentId.uuid !== payment.uuid) {
      throw new PaymentValidationError('Double spend protection: Gateway payment ID is already associated with another session');
    }

    // 2. State Machine check (Skip check if we are doing explicit dispute reconciliation on a FAILED status)
    if (payment.status !== PaymentStatus.FAILED) {
      PaymentStateMachine.verifyTransition(payment.status, PaymentStatus.CAPTURED);
    } else {
      console.warn(`[${correlationStr}] [PaymentService] Dispute Reconciliation: payment was FAILED locally, but confirmed CAPTURED by webhook. Bypassing state machine rules.`);
    }

    // 3. Update entity fields
    payment.status = PaymentStatus.CAPTURED;
    payment.gatewayPaymentId = gatewayPaymentId;
    if (gatewaySignature) {
      payment.gatewaySignature = gatewaySignature;
    }
    payment.verificationMethod = source;
    payment.verifiedAt = new Date();
    payment.capturedAt = new Date();
    payment.providerMetadata = {
      ...(payment.providerMetadata || {}),
      completeWebhookPayload: rawProviderPayload || null
    };

    console.log(`[${correlationStr}] [PaymentService] Updating payment to CAPTURED atomically.`);
    await this.paymentRepository.update(payment, conn);
  }

  public async verifyPayment(
    dto: VerifyPaymentDTO,
    studentId: number,
    correlationId?: CorrelationId
  ): Promise<VerifyPaymentResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const correlationStr = cid.value;

    console.log(`[${correlationStr}] [PaymentService] Verifying payment for session UUID: ${dto.paymentUuid}`);

    if (!dto.gatewayPaymentId || !dto.gatewayOrderId || !dto.signature) {
      throw new PaymentValidationError('Missing required verification parameters: signature, payment ID, and order ID are required');
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Retrieve payment with a row-level lock
      const payment = await this.paymentRepository.findByUuidForUpdate(dto.paymentUuid, conn);
      if (!payment) {
        throw new PaymentValidationError('Payment session not found');
      }

      // Ownership Check: Verify authenticated student owns the payment
      if (payment.studentId !== studentId) {
        throw new PaymentValidationError('Access Denied: You do not own this payment session');
      }

      // Stored Gateway Order match Check
      if (payment.gatewayOrderId !== dto.gatewayOrderId) {
        throw new PaymentValidationError('Mismatched gateway order ID. Session does not match the provider order.');
      }

      // Idempotency Check: Already CAPTURED
      if (payment.status === PaymentStatus.CAPTURED) {
        if (payment.gatewayPaymentId === dto.gatewayPaymentId) {
          console.log(`[${correlationStr}] [PaymentService] Payment already verified. Returning successful status (Idempotency).`);
          await conn.commit();
          return {
            uuid: payment.uuid,
            paymentReference: payment.paymentReference,
            status: payment.status,
            verifiedAt: payment.verifiedAt || null
          };
        } else {
          throw new PaymentValidationError('Replay Protection: This payment session has already been captured with a different payment ID');
        }
      }

      // Verifiable state check
      if (payment.status !== PaymentStatus.INITIATED && payment.status !== PaymentStatus.PENDING_VERIFICATION) {
        throw new PaymentValidationError(`Payment session cannot be verified in its current state: ${payment.status}`);
      }

      // Verify gateway checkout signature
      const isValidSignature = await this.paymentGateway.verifyPaymentSignature(
        dto.gatewayOrderId,
        dto.gatewayPaymentId,
        dto.signature
      );

      if (!isValidSignature) {
        console.warn(`[${correlationStr}] [PaymentService] Signature verification failed. Retaining recoverable state in DB.`);
        await conn.rollback();
        throw new PaymentValidationError('Gateway payment signature verification failed');
      }

      // Shared verification flow update:
      await this.capturePaymentInternal(
        payment,
        dto.gatewayPaymentId,
        dto.signature,
        VerificationSource.CHECKOUT_CLIENT,
        dto.rawProviderPayload || null,
        conn,
        correlationStr
      );

      await conn.commit();

      return {
        uuid: payment.uuid,
        paymentReference: payment.paymentReference,
        status: payment.status,
        verifiedAt: payment.verifiedAt || null
      };

    } catch (err: any) {
      await conn.rollback();
      console.error(`[${correlationStr}] [PaymentService] Payment verification failed:`, err);
      if (err instanceof PaymentValidationError || err instanceof PaymentRepositoryError) {
        throw err;
      }
      throw new PaymentRepositoryError('Payment verification transaction failed', err);
    } finally {
      conn.release();
    }
  }

  public async processWebhook(
    payload: any,
    headers: any,
    signature: string,
    rawPayload: string | Buffer,
    correlationId?: CorrelationId
  ): Promise<string | null> {
    const cid = correlationId || CorrelationId.create();
    const correlationStr = cid.value;

    console.log(`[${correlationStr}] [PaymentService] Processing webhook event`);

    if (!this.webhookEventRepository) {
      throw new Error('Webhook repository not configured');
    }

    const payloadStr = Buffer.isBuffer(rawPayload) ? rawPayload.toString('utf8') : rawPayload;
    const hash = crypto.createHash('sha256').update(payloadStr).digest('hex');

    // 1. Webhook Signature Verification
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'dummy_webhook_secret';
    const isSignatureValid = await this.paymentGateway.verifyWebhookSignature(rawPayload, signature, secret);

    if (!isSignatureValid) {
      throw new PaymentValidationError('Webhook verification failed: Invalid webhook signature');
    }

    const eventId = payload.id;
    const eventType = payload.event;
    
    // We only support payment.captured and payment.failed. Ignore unknown events safely.
    if (eventType !== 'payment.captured' && eventType !== 'payment.failed') {
      console.log(`[${correlationStr}] [PaymentService] Ignoring unsupported webhook event: ${eventType}`);
      return null;
    }

    const normalized = await this.paymentGateway.parseWebhookEvent(payload);

    // Persist/update the audit event log OUTSIDE of the core payment transaction
    let webhookEvent: WebhookEvent | null = null;
    const prepConn = await db.getConnection();
    try {
      await prepConn.beginTransaction();

      const existingEvent = await this.webhookEventRepository.findByEventId(eventId, prepConn);
      if (existingEvent) {
        if (existingEvent.processingStatus === WebhookProcessingStatus.PROCESSED) {
          console.log(`[${correlationStr}] [PaymentService] Webhook event ${eventId} already processed successfully (Idempotency No-Op).`);
          await prepConn.commit();
          // Event was processed successfully. Retrieve corresponding payment to return UUID for finalization.
          if (existingEvent.paymentUuid) {
            return existingEvent.paymentUuid;
          }
          return null;
        }
        existingEvent.processingStatus = WebhookProcessingStatus.VALIDATED;
        webhookEvent = await this.webhookEventRepository.update(existingEvent, prepConn);
      } else {
        const newEvent: WebhookEvent = {
          eventId,
          eventType,
          payload: payloadStr,
          headers: JSON.stringify(headers),
          signature,
          payloadHash: hash,
          processingStatus: WebhookProcessingStatus.VALIDATED,
          gatewayOrderId: normalized.gatewayOrderId || null,
          gatewayPaymentId: normalized.gatewayPaymentId || null
        };
        webhookEvent = await this.webhookEventRepository.create(newEvent, prepConn);
      }

      await prepConn.commit();
    } catch (err) {
      await prepConn.rollback();
      throw err;
    } finally {
      prepConn.release();
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Find payment record by gateway order ID using row lock
      if (!normalized.gatewayOrderId) {
        if (webhookEvent) {
          webhookEvent.processingStatus = WebhookProcessingStatus.IGNORED;
          await this.webhookEventRepository.update(webhookEvent, conn);
        }
        await conn.commit();
        console.log(`[${correlationStr}] [PaymentService] Webhook event ignored: Missing gatewayOrderId`);
        return null;
      }

      const payment = await this.paymentRepository.findByGatewayOrderIdForUpdate(normalized.gatewayOrderId, conn);
      if (!payment) {
        if (webhookEvent) {
          webhookEvent.processingStatus = WebhookProcessingStatus.IGNORED;
          await this.webhookEventRepository.update(webhookEvent, conn);
        }
        await conn.commit();
        console.warn(`[${correlationStr}] [PaymentService] Webhook payment reconciliation ignored: No local payment matches gateway order ID: ${normalized.gatewayOrderId}`);
        return null;
      }

      // Link payment records to webhook event auditing info
      if (webhookEvent) {
        webhookEvent.paymentUuid = payment.uuid;
        webhookEvent.paymentReference = payment.paymentReference;
      }

      // Verification Check: Check amount and currency matching
      if (payment.amount !== normalized.amount || payment.currency !== normalized.currency) {
        throw new PaymentValidationError(
          `Dispute Resolution Mismatch: Webhook amount/currency (${normalized.amount} ${normalized.currency}) does not match local payment (${payment.amount} ${payment.currency})`
        );
      }

      // State processing routing
      if (normalized.status === PaymentStatus.CAPTURED) {
        if (payment.status === PaymentStatus.CAPTURED) {
          // Idempotency: Already captured
          if (payment.gatewayPaymentId === normalized.gatewayPaymentId) {
            console.log(`[${correlationStr}] [PaymentService] Webhook lands after client verify. Payment already CAPTURED.`);
            if (webhookEvent) {
              webhookEvent.processingStatus = WebhookProcessingStatus.PROCESSED;
              webhookEvent.processedAt = new Date();
              await this.webhookEventRepository.update(webhookEvent, conn);
            }
            await conn.commit();
            return payment.uuid;
          } else {
            // Mismatched payment ID conflict. Webhook is the authoritative source!
            console.warn(`[${correlationStr}] [PaymentService] Authoritative reconciliation overwrite: Overriding local gateway payment ID ${payment.gatewayPaymentId} with webhook ID ${normalized.gatewayPaymentId}`);
            payment.gatewayPaymentId = normalized.gatewayPaymentId || payment.gatewayPaymentId;
            payment.providerMetadata = {
              ...(payment.providerMetadata || {}),
              authoritativeWebhookOverwritten: true,
              originalGatewayPaymentId: payment.gatewayPaymentId
            };
            await this.paymentRepository.update(payment, conn);
          }
        } else {
          // Perform verification update (allows FAILED -> CAPTURED dispute resolution via capturePaymentInternal override)
          await this.capturePaymentInternal(
            payment,
            normalized.gatewayPaymentId!,
            signature,
            VerificationSource.WEBHOOK,
            payload,
            conn,
            correlationStr
          );
        }
      } else if (normalized.status === PaymentStatus.FAILED) {
        // Never regress payment state: ignore failed status changes if already CAPTURED
        if (payment.status === PaymentStatus.CAPTURED) {
          console.log(`[${correlationStr}] [PaymentService] Ignoring failed webhook event because payment is already CAPTURED.`);
          if (webhookEvent) {
            webhookEvent.processingStatus = WebhookProcessingStatus.IGNORED;
            await this.webhookEventRepository.update(webhookEvent, conn);
          }
          await conn.commit();
          return null;
        }

        // Apply failure transition
        PaymentStateMachine.verifyTransition(payment.status, PaymentStatus.FAILED);
        payment.status = PaymentStatus.FAILED;
        payment.errorCode = normalized.errorCode || 'WEBHOOK_FAILURE_EVENT';
        payment.errorMessage = normalized.errorMessage || 'Razorpay webhook payment failed event received';
        payment.failedAt = new Date();
        payment.providerMetadata = {
          ...(payment.providerMetadata || {}),
          webhookFailureDetails: payload
        };
        await this.paymentRepository.update(payment, conn);
      }

      // TODO: Direct fetch call check (Future reconciliation audit against Razorpay APIs)

      if (webhookEvent) {
        webhookEvent.processingStatus = WebhookProcessingStatus.PROCESSED;
        webhookEvent.processedAt = new Date();
        await this.webhookEventRepository.update(webhookEvent, conn);
      }

      await conn.commit();
      console.log(`[${correlationStr}] [PaymentService] Webhook processing completed successfully`);
      return payment.status === PaymentStatus.CAPTURED ? payment.uuid : null;

    } catch (err: any) {
      await conn.rollback();
      console.error(`[${correlationStr}] [PaymentService] Error caught processing webhook event:`, err);

      // Distinguish transient processing infrastructure errors from permanent business logic errors
      const isTransient = err.code === 'SQLITE_BUSY' || err.message.includes('locked') || err.message.includes('timeout') || err.message.includes('ETIMEDOUT');

      if (isTransient) {
        throw err;
      } else {
        // Permanent failures (validation failure, double spend logic conflict, amount mismatch):
        // Update DB log status to FAILED and return success (200) to halt gateway retries
        try {
          const freshConn = await db.getConnection();
          try {
            await freshConn.beginTransaction();
            if (webhookEvent && webhookEvent.id) {
              webhookEvent.processingStatus = WebhookProcessingStatus.FAILED;
              webhookEvent.errorMessage = err.message || 'Permanent business validation error';
              await this.webhookEventRepository.update(webhookEvent, freshConn);
            }
            await freshConn.commit();
          } catch (updateErr) {
            await freshConn.rollback();
          } finally {
            freshConn.release();
          }
        } catch (dbErr) {
          // ignore double failure
        }
        return null;
      }
    } finally {
      conn.release();
    }
  }
}
