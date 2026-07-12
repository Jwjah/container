import { IOrderLifecycleProjectionRepository } from '../../interfaces/IOrderLifecycleProjectionRepository';
import { OrderLifecycleProjection } from '../../domain/entities/OrderLifecycleProjection';
import { LifecycleState } from '../../domain/enums/LifecycleState';
import db from '../../../config/database';

/**
 * ProjectionConcurrencyError — thrown when an optimistic lock conflict is detected.
 * Callers must catch this and retry the event processing transaction.
 *
 * RFC-007 §21 — Optimistic Concurrency
 */
export class ProjectionConcurrencyError extends Error {
  constructor(orderId: number) {
    super(
      `Optimistic lock conflict on projection for orderId=${orderId}. ` +
      `Another worker updated this row concurrently. Retry required.`,
    );
    this.name = 'ProjectionConcurrencyError';
  }
}

/**
 * ProjectionNotFoundError — thrown when a required projection row does not exist.
 */
export class ProjectionNotFoundError extends Error {
  constructor(orderId: number) {
    super(`OrderLifecycleProjection not found for orderId=${orderId}`);
    this.name = 'ProjectionNotFoundError';
  }
}

/**
 * SqlOrderLifecycleProjectionRepository — production persistence adapter.
 *
 * RFC-007 §35 / §41 / §46
 *
 * Rules enforced here:
 *  - Zero business logic (lifecycle computation lives in LifecycleStateMapper).
 *  - Optimistic locking on every `update()` call (WHERE version = ?).
 *  - If UPDATE affectedRows === 0 → throws ProjectionConcurrencyError.
 *  - All methods accept an optional `connection` for transaction propagation.
 *  - Raw DB errors are converted to application-safe errors before re-throwing.
 *
 * Compatible with both SQLite (better-sqlite3 adapter) and MySQL (mysql2 pool).
 */
export class SqlOrderLifecycleProjectionRepository
  implements IOrderLifecycleProjectionRepository
{
  // ────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────────────────

  /** Convert a raw DB row into a domain entity. */
  private toEntity(row: any): OrderLifecycleProjection {
    return new OrderLifecycleProjection(
      row.order_id,
      row.order_hash,
      row.student_id,
      row.shop_id,
      row.shop_name,
      row.delivery_type as 'pickup' | 'hostel',
      row.hostel_address ?? null,
      typeof row.total_price === 'string'
        ? parseFloat(row.total_price)
        : row.total_price,
      row.payment_status,
      row.invoice_number ?? null,
      row.print_job_id ?? null,
      row.print_status ?? null,
      row.fulfillment_id ?? null,
      row.fulfillment_status ?? null,
      row.assigned_agent_id ?? null,
      row.agent_name ?? null,
      row.agent_phone ?? null,
      row.current_state as LifecycleState,
      row.last_processed_version,
      new Date(row.last_processed_occurred_at),
      row.version,
      new Date(row.created_at),
      new Date(row.updated_at),
    );
  }

  /** Serialize a Date for storage — ISO string works for both SQLite TEXT and MySQL TIMESTAMP. */
  private toDb(date: Date): string {
    return date.toISOString();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // IOrderLifecycleProjectionRepository
  // ────────────────────────────────────────────────────────────────────────────

  public async create(
    p: OrderLifecycleProjection,
    connection?: any,
  ): Promise<OrderLifecycleProjection> {
    const executor = connection || db;

    try {
      await executor.execute(
        `INSERT INTO order_lifecycle_projections (
          order_id, order_hash, student_id, shop_id, shop_name,
          delivery_type, hostel_address, total_price,
          current_state, payment_status, invoice_number,
          print_job_id, print_status,
          fulfillment_id, fulfillment_status,
          assigned_agent_id, agent_name, agent_phone,
          last_processed_version, last_processed_occurred_at,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.orderId,
          p.orderHash,
          p.studentId,
          p.shopId,
          p.shopName,
          p.deliveryType,
          p.hostelAddress,
          p.totalPrice,
          p.currentState,
          p.paymentStatus,
          p.invoiceNumber,
          p.printJobId,
          p.printStatus,
          p.fulfillmentId,
          p.fulfillmentStatus,
          p.assignedAgentId,
          p.agentName,
          p.agentPhone,
          p.lastProcessedVersion,
          this.toDb(p.lastProcessedOccurredAt),
          p.version,
          this.toDb(p.createdAt),
          this.toDb(p.updatedAt),
        ],
      );
      return p;
    } catch (err: any) {
      throw this.wrapError(err, 'create');
    }
  }

  public async findByOrderId(
    orderId: number,
    connection?: any,
  ): Promise<OrderLifecycleProjection | null> {
    const executor = connection || db;
    try {
      const [rows] = await executor.execute(
        'SELECT * FROM order_lifecycle_projections WHERE order_id = ?',
        [orderId],
      );
      const list = rows as any[];
      return list.length > 0 ? this.toEntity(list[0]) : null;
    } catch (err: any) {
      throw this.wrapError(err, 'findByOrderId');
    }
  }

  public async findByOrderHash(
    orderHash: string,
    connection?: any,
  ): Promise<OrderLifecycleProjection | null> {
    const executor = connection || db;
    try {
      const [rows] = await executor.execute(
        'SELECT * FROM order_lifecycle_projections WHERE order_hash = ?',
        [orderHash],
      );
      const list = rows as any[];
      return list.length > 0 ? this.toEntity(list[0]) : null;
    } catch (err: any) {
      throw this.wrapError(err, 'findByOrderHash');
    }
  }

  public async findByOrderIdForUpdate(
    orderId: number,
    connection?: any,
  ): Promise<OrderLifecycleProjection | null> {
    const executor = connection || db;
    // MySQL: SELECT ... FOR UPDATE acquires a row-level write lock.
    // SQLite: DB-level locking (BEGIN IMMEDIATE) already prevents races;
    //         FOR UPDATE is silently stripped by the SQLite adapter translate().
    const isMySql = !process.env.DB_MODE || process.env.DB_MODE === 'mysql';
    const forUpdate = isMySql ? ' FOR UPDATE' : '';
    try {
      const [rows] = await executor.execute(
        `SELECT * FROM order_lifecycle_projections WHERE order_id = ?${forUpdate}`,
        [orderId],
      );
      const list = rows as any[];
      return list.length > 0 ? this.toEntity(list[0]) : null;
    } catch (err: any) {
      throw this.wrapError(err, 'findByOrderIdForUpdate');
    }
  }

  /**
   * Persist changes to an existing projection using optimistic locking.
   *
   * UPDATE ... WHERE order_id = ? AND version = ?
   *
   * If affectedRows === 0 the row was modified concurrently →
   *   throws ProjectionConcurrencyError (caller must retry).
   *
   * The caller is responsible for incrementing `projection.version`
   * before calling this method.
   *
   * RFC-007 §21
   */
  public async update(
    p: OrderLifecycleProjection,
    connection?: any,
  ): Promise<void> {
    const executor = connection || db;

    try {
      const [result] = await executor.execute(
        `UPDATE order_lifecycle_projections SET
          shop_name                  = ?,
          hostel_address             = ?,
          total_price                = ?,
          current_state              = ?,
          payment_status             = ?,
          invoice_number             = ?,
          print_job_id               = ?,
          print_status               = ?,
          fulfillment_id             = ?,
          fulfillment_status         = ?,
          assigned_agent_id          = ?,
          agent_name                 = ?,
          agent_phone                = ?,
          last_processed_version     = ?,
          last_processed_occurred_at = ?,
          version                    = ?,
          updated_at                 = ?
        WHERE order_id = ? AND version = ?`,
        [
          p.shopName,
          p.hostelAddress,
          p.totalPrice,
          p.currentState,
          p.paymentStatus,
          p.invoiceNumber,
          p.printJobId,
          p.printStatus,
          p.fulfillmentId,
          p.fulfillmentStatus,
          p.assignedAgentId,
          p.agentName,
          p.agentPhone,
          p.lastProcessedVersion,
          this.toDb(p.lastProcessedOccurredAt),
          p.version,          // new version (already incremented by caller)
          this.toDb(p.updatedAt),
          p.orderId,
          p.version - 1,     // expected previous version (optimistic lock guard)
        ],
      );

      const affected: number =
        (result as any).affectedRows ?? (result as any).changes ?? 0;

      if (affected === 0) {
        throw new ProjectionConcurrencyError(p.orderId);
      }
    } catch (err: any) {
      if (err instanceof ProjectionConcurrencyError) throw err;
      throw this.wrapError(err, 'update');
    }
  }

  public async exists(orderId: number, connection?: any): Promise<boolean> {
    const executor = connection || db;
    try {
      const [rows] = await executor.execute(
        'SELECT 1 AS cnt FROM order_lifecycle_projections WHERE order_id = ? LIMIT 1',
        [orderId],
      );
      return (rows as any[]).length > 0;
    } catch (err: any) {
      throw this.wrapError(err, 'exists');
    }
  }

  public async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      await executor.execute('DELETE FROM order_lifecycle_projections');
    } catch (err: any) {
      throw this.wrapError(err, 'deleteAll');
    }
  }

  public async count(connection?: any): Promise<number> {
    const executor = connection || db;
    try {
      const [rows] = await executor.execute(
        'SELECT COUNT(*) AS cnt FROM order_lifecycle_projections',
      );
      const row = (rows as any[])[0];
      return row ? Number(row.cnt ?? row['COUNT(*)'] ?? 0) : 0;
    } catch (err: any) {
      throw this.wrapError(err, 'count');
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Error wrapping — never leak raw DB errors
  // ────────────────────────────────────────────────────────────────────────────

  private wrapError(err: any, method: string): Error {
    const msg = err?.message ?? String(err);
    const wrapped = new Error(
      `[SqlOrderLifecycleProjectionRepository.${method}] Database error: ${msg}`,
    );
    wrapped.name = 'ProjectionRepositoryError';
    return wrapped;
  }
}
