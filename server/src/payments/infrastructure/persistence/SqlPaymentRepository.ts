import { IPaymentRepository } from '../../interfaces/IPaymentRepository';
import { Payment } from '../../domain/entities/Payment';
import { Currency } from '../../domain/enums/Currency';
import { PaymentStatus } from '../../domain/enums/PaymentStatus';
import { PaymentMethod } from '../../domain/enums/PaymentMethod';
import { PaymentGatewayProvider } from '../../domain/enums/PaymentGatewayProvider';
import { PaymentRepositoryError } from '../../domain/errors/PaymentErrors';

// Import the db module dynamically or via require/import since it is CommonJS
import db from '../../../config/database';

export class SqlPaymentRepository implements IPaymentRepository {
  
  public async create(payment: Payment, connection?: any): Promise<Payment> {
    const runner = connection || db;
    const query = `
      INSERT INTO payments (
        uuid, payment_reference, order_id, student_id, amount, currency, 
        status, payment_method, gateway, idempotency_key, 
        gateway_order_id, gateway_payment_id, gateway_signature, verification_method,
        error_code, error_message, provider_metadata, verified_at, captured_at, failed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      const [result]: any = await runner.execute(query, this.toRow(payment));
      return {
        ...payment,
        id: result.insertId
      };
    } catch (err: any) {
      throw new PaymentRepositoryError('Failed to execute insert query for payment', err);
    }
  }

  public async update(payment: Payment, connection?: any): Promise<Payment> {
    if (!payment.id) {
      throw new PaymentRepositoryError('Cannot update payment without a valid persistence ID');
    }
    const runner = connection || db;
    const query = `
      UPDATE payments SET
        status = ?,
        gateway_order_id = ?,
        gateway_payment_id = ?,
        gateway_signature = ?,
        verification_method = ?,
        error_code = ?,
        error_message = ?,
        provider_metadata = ?,
        verified_at = ?,
        captured_at = ?,
        failed_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const params = [
      payment.status,
      payment.gatewayOrderId || null,
      payment.gatewayPaymentId || null,
      payment.gatewaySignature || null,
      payment.verificationMethod || null,
      payment.errorCode || null,
      payment.errorMessage || null,
      payment.providerMetadata ? JSON.stringify(payment.providerMetadata) : null,
      payment.verifiedAt ? payment.verifiedAt.toISOString().replace('T', ' ').substring(0, 19) : null,
      payment.capturedAt ? payment.capturedAt.toISOString().replace('T', ' ').substring(0, 19) : null,
      payment.failedAt ? payment.failedAt.toISOString().replace('T', ' ').substring(0, 19) : null,
      payment.id
    ];

    try {
      await runner.execute(query, params);
      return payment;
    } catch (err: any) {
      throw new PaymentRepositoryError(`Failed to update payment with ID: ${payment.id}`, err);
    }
  }

  public async findById(id: number, connection?: any): Promise<Payment | null> {
    const runner = connection || db;
    const query = 'SELECT * FROM payments WHERE id = ?';
    try {
      const [rows]: any = await runner.execute(query, [id]);
      if (!rows || rows.length === 0) return null;
      return this.toEntity(rows[0]);
    } catch (err: any) {
      throw new PaymentRepositoryError(`Failed to find payment by ID: ${id}`, err);
    }
  }

  public async findByUuid(uuid: string, connection?: any): Promise<Payment | null> {
    const runner = connection || db;
    const query = 'SELECT * FROM payments WHERE uuid = ?';
    try {
      const [rows]: any = await runner.execute(query, [uuid]);
      if (!rows || rows.length === 0) return null;
      return this.toEntity(rows[0]);
    } catch (err: any) {
      throw new PaymentRepositoryError(`Failed to find payment by UUID: ${uuid}`, err);
    }
  }

  public async findByUuidForUpdate(uuid: string, connection?: any): Promise<Payment | null> {
    const runner = connection || db;
    const isMySQL = process.env.DB_MODE === 'mysql';
    const query = isMySQL
      ? 'SELECT * FROM payments WHERE uuid = ? FOR UPDATE'
      : 'SELECT * FROM payments WHERE uuid = ?';
    try {
      const [rows]: any = await runner.execute(query, [uuid]);
      if (!rows || rows.length === 0) return null;
      return this.toEntity(rows[0]);
    } catch (err: any) {
      throw new PaymentRepositoryError(`Failed to lock payment by UUID: ${uuid}`, err);
    }
  }

  public async findByReference(reference: string, connection?: any): Promise<Payment | null> {
    const runner = connection || db;
    const query = 'SELECT * FROM payments WHERE payment_reference = ?';
    try {
      const [rows]: any = await runner.execute(query, [reference]);
      if (!rows || rows.length === 0) return null;
      return this.toEntity(rows[0]);
    } catch (err: any) {
      throw new PaymentRepositoryError(`Failed to find payment by reference: ${reference}`, err);
    }
  }

  public async findByGatewayOrderId(gatewayOrderId: string, connection?: any): Promise<Payment | null> {
    const runner = connection || db;
    const query = 'SELECT * FROM payments WHERE gateway_order_id = ?';
    try {
      const [rows]: any = await runner.execute(query, [gatewayOrderId]);
      if (!rows || rows.length === 0) return null;
      return this.toEntity(rows[0]);
    } catch (err: any) {
      throw new PaymentRepositoryError(`Failed to find payment by gateway order ID: ${gatewayOrderId}`, err);
    }
  }

  public async findByGatewayOrderIdForUpdate(gatewayOrderId: string, connection?: any): Promise<Payment | null> {
    const runner = connection || db;
    const isMySQL = process.env.DB_MODE === 'mysql';
    const query = isMySQL
      ? 'SELECT * FROM payments WHERE gateway_order_id = ? FOR UPDATE'
      : 'SELECT * FROM payments WHERE gateway_order_id = ?';
    try {
      const [rows]: any = await runner.execute(query, [gatewayOrderId]);
      if (!rows || rows.length === 0) return null;
      return this.toEntity(rows[0]);
    } catch (err: any) {
      throw new PaymentRepositoryError(`Failed to lock payment by gateway order ID: ${gatewayOrderId}`, err);
    }
  }

  public async findByGatewayPaymentId(gatewayPaymentId: string, connection?: any): Promise<Payment | null> {
    const runner = connection || db;
    const query = 'SELECT * FROM payments WHERE gateway_payment_id = ?';
    try {
      const [rows]: any = await runner.execute(query, [gatewayPaymentId]);
      if (!rows || rows.length === 0) return null;
      return this.toEntity(rows[0]);
    } catch (err: any) {
      throw new PaymentRepositoryError(`Failed to find payment by gateway payment ID: ${gatewayPaymentId}`, err);
    }
  }

  public async findByIdempotencyKey(idempotencyKey: string, connection?: any): Promise<Payment | null> {
    const runner = connection || db;
    const query = 'SELECT * FROM payments WHERE idempotency_key = ?';
    try {
      const [rows]: any = await runner.execute(query, [idempotencyKey]);
      if (!rows || rows.length === 0) return null;
      return this.toEntity(rows[0]);
    } catch (err: any) {
      throw new PaymentRepositoryError(`Failed to find payment by idempotency key: ${idempotencyKey}`, err);
    }
  }

  public async findActiveByOrderId(orderId: number, connection?: any): Promise<Payment | null> {
    const runner = connection || db;
    // Active states exclude terminal states (FAILED, VOIDED, REFUNDED)
    const query = `
      SELECT * FROM payments 
      WHERE order_id = ? 
        AND status NOT IN (?, ?, ?)
    `;
    try {
      const [rows]: any = await runner.execute(query, [
        orderId, 
        PaymentStatus.FAILED, 
        PaymentStatus.VOIDED, 
        PaymentStatus.REFUNDED
      ]);
      if (!rows || rows.length === 0) return null;
      return this.toEntity(rows[0]);
    } catch (err: any) {
      throw new PaymentRepositoryError(`Failed to find active payment for order ID: ${orderId}`, err);
    }
  }

  private toRow(payment: Payment): any[] {
    return [
      payment.uuid,
      payment.paymentReference,
      payment.orderId,
      payment.studentId,
      payment.amount,
      payment.currency,
      payment.status,
      payment.paymentMethod,
      payment.gateway,
      payment.idempotencyKey,
      payment.gatewayOrderId || null,
      payment.gatewayPaymentId || null,
      payment.gatewaySignature || null,
      payment.verificationMethod || null,
      payment.errorCode || null,
      payment.errorMessage || null,
      payment.providerMetadata ? JSON.stringify(payment.providerMetadata) : null,
      payment.verifiedAt ? payment.verifiedAt.toISOString().replace('T', ' ').substring(0, 19) : null,
      payment.capturedAt ? payment.capturedAt.toISOString().replace('T', ' ').substring(0, 19) : null,
      payment.failedAt ? payment.failedAt.toISOString().replace('T', ' ').substring(0, 19) : null
    ];
  }

  private toEntity(row: any): Payment {
    let parsedMetadata = null;
    if (row.provider_metadata) {
      try {
        parsedMetadata = typeof row.provider_metadata === 'string' 
          ? JSON.parse(row.provider_metadata) 
          : row.provider_metadata;
      } catch (e) {
        parsedMetadata = row.provider_metadata;
      }
    }

    return {
      id: row.id,
      uuid: row.uuid,
      paymentReference: row.payment_reference,
      orderId: row.order_id,
      studentId: row.student_id,
      amount: row.amount,
      currency: row.currency as Currency,
      status: row.status as PaymentStatus,
      paymentMethod: row.payment_method as PaymentMethod,
      gateway: row.gateway as PaymentGatewayProvider,
      idempotencyKey: row.idempotency_key,
      gatewayOrderId: row.gateway_order_id,
      gatewayPaymentId: row.gateway_payment_id,
      gatewaySignature: row.gateway_signature,
      verificationMethod: row.verification_method,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      providerMetadata: parsedMetadata,
      verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
      capturedAt: row.captured_at ? new Date(row.captured_at) : null,
      failedAt: row.failed_at ? new Date(row.failed_at) : null,
      createdAt: row.created_at ? new Date(row.created_at) : undefined,
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined
    };
  }
}
