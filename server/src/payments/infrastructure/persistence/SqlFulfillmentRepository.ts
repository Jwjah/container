import { IFulfillmentRepository } from '../../interfaces/IFulfillmentRepository';
import { Fulfillment } from '../../domain/entities/Fulfillment';
import { FulfillmentStatus } from '../../domain/enums/FulfillmentStatus';
import { FulfillmentMode } from '../../domain/enums/FulfillmentMode';
import { FulfillmentFailureReason } from '../../domain/enums/FulfillmentFailureReason';
import db from '../../../config/database';

export class SqlFulfillmentRepository implements IFulfillmentRepository {
  private toEntity(row: any): Fulfillment {
    return new Fulfillment(
      row.id,
      row.order_id,
      row.print_job_id,
      row.shop_id,
      row.student_id,
      row.status as FulfillmentStatus,
      row.mode as FulfillmentMode,
      row.assigned_agent_id,
      row.otp_hash,
      row.otp_expires_at ? new Date(row.otp_expires_at) : null,
      row.otp_attempts,
      row.delivery_attempts,
      row.proof_of_delivery_reference,
      row.failure_reason as FulfillmentFailureReason | null,
      row.estimated_delivery_at ? new Date(row.estimated_delivery_at) : null,
      row.actual_delivery_at ? new Date(row.actual_delivery_at) : null,
      row.otp_verified_at ? new Date(row.otp_verified_at) : null,
      row.version,
      new Date(row.created_at),
      new Date(row.updated_at)
    );
  }

  public async create(f: Fulfillment, connection?: any): Promise<Fulfillment> {
    const executor = connection || db;
    const otpExpiresStr = f.otpExpiresAt ? f.otpExpiresAt.toISOString() : null;
    const estimatedStr = f.estimatedDeliveryAt ? f.estimatedDeliveryAt.toISOString() : null;
    const actualStr = f.actualDeliveryAt ? f.actualDeliveryAt.toISOString() : null;
    const otpVerifiedStr = f.otpVerifiedAt ? f.otpVerifiedAt.toISOString() : null;

    const [result] = await executor.execute(
      `INSERT INTO fulfillments (
        order_id, print_job_id, shop_id, student_id, status, mode, 
        assigned_agent_id, otp_hash, otp_expires_at, otp_attempts, 
        delivery_attempts, proof_of_delivery_reference, failure_reason, 
        estimated_delivery_at, actual_delivery_at, otp_verified_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        f.orderId,
        f.printJobId,
        f.shopId,
        f.studentId,
        f.status,
        f.mode,
        f.assignedAgentId,
        f.otpHash,
        otpExpiresStr,
        f.otpAttempts,
        f.deliveryAttempts,
        f.proofOfDeliveryReference,
        f.failureReason,
        estimatedStr,
        actualStr,
        otpVerifiedStr,
        f.version
      ]
    );

    const insertedId = result.insertId || result.lastID;
    return new Fulfillment(
      insertedId,
      f.orderId,
      f.printJobId,
      f.shopId,
      f.studentId,
      f.status,
      f.mode,
      f.assignedAgentId,
      f.otpHash,
      f.otpExpiresAt,
      f.otpAttempts,
      f.deliveryAttempts,
      f.proofOfDeliveryReference,
      f.failureReason,
      f.estimatedDeliveryAt,
      f.actualDeliveryAt,
      f.otpVerifiedAt,
      f.version,
      new Date(),
      new Date()
    );
  }

  public async findById(id: number, connection?: any): Promise<Fulfillment | null> {
    const executor = connection || db;
    const [rows] = await executor.execute('SELECT * FROM fulfillments WHERE id = ?', [id]);
    if (!rows || rows.length === 0) {
      return null;
    }
    return this.toEntity(rows[0]);
  }

  public async findByOrderId(orderId: number, connection?: any): Promise<Fulfillment | null> {
    const executor = connection || db;
    const [rows] = await executor.execute('SELECT * FROM fulfillments WHERE order_id = ?', [orderId]);
    if (!rows || rows.length === 0) {
      return null;
    }
    return this.toEntity(rows[0]);
  }

  public async findByPrintJobId(printJobId: number, connection?: any): Promise<Fulfillment | null> {
    const executor = connection || db;
    const [rows] = await executor.execute('SELECT * FROM fulfillments WHERE print_job_id = ?', [printJobId]);
    if (!rows || rows.length === 0) {
      return null;
    }
    return this.toEntity(rows[0]);
  }

  public async findByIdForUpdate(id: number, connection?: any): Promise<Fulfillment | null> {
    const executor = connection || db;
    const isSQLite = process.env.DB_MODE === 'sqlite' || process.env.DB_HOST === 'mysql9.serv00.com' || !process.env.DB_HOST;
    const sql = isSQLite
      ? 'SELECT * FROM fulfillments WHERE id = ?'
      : 'SELECT * FROM fulfillments WHERE id = ? FOR UPDATE';

    const [rows] = await executor.execute(sql, [id]);
    if (!rows || rows.length === 0) {
      return null;
    }
    return this.toEntity(rows[0]);
  }

  public async update(f: Fulfillment, connection?: any): Promise<void> {
    const executor = connection || db;
    const otpExpiresStr = f.otpExpiresAt ? f.otpExpiresAt.toISOString() : null;
    const estimatedStr = f.estimatedDeliveryAt ? f.estimatedDeliveryAt.toISOString() : null;
    const actualStr = f.actualDeliveryAt ? f.actualDeliveryAt.toISOString() : null;
    const otpVerifiedStr = f.otpVerifiedAt ? f.otpVerifiedAt.toISOString() : null;

    const nextVersion = f.version + 1;

    const [result] = await executor.execute(
      `UPDATE fulfillments SET 
        status = ?, 
        assigned_agent_id = ?, 
        otp_hash = ?, 
        otp_expires_at = ?, 
        otp_attempts = ?, 
        delivery_attempts = ?, 
        proof_of_delivery_reference = ?, 
        failure_reason = ?, 
        estimated_delivery_at = ?, 
        actual_delivery_at = ?, 
        otp_verified_at = ?, 
        version = ?, 
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND version = ?`,
      [
        f.status,
        f.assignedAgentId,
        f.otpHash,
        otpExpiresStr,
        f.otpAttempts,
        f.deliveryAttempts,
        f.proofOfDeliveryReference,
        f.failureReason,
        estimatedStr,
        actualStr,
        otpVerifiedStr,
        nextVersion,
        f.id,
        f.version
      ]
    );

    if (result.affectedRows === 0) {
      throw new Error(`Concurrency update failure: Fulfillment #${f.id} was updated by another process or does not exist`);
    }

    f.version = nextVersion;
  }
}
