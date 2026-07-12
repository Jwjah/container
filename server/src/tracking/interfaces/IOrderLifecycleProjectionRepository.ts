import { OrderLifecycleProjection } from '../domain/entities/OrderLifecycleProjection';

/**
 * IOrderLifecycleProjectionRepository — persistence contract for the Projection Root.
 *
 * RFC-007 §41 — Repository Contracts
 *
 * All implementations (SQLite, MySQL) must satisfy this interface identically.
 * No service may depend on a concrete implementation.
 *
 * Optimistic locking is enforced in `update()` via the `version` field.
 */
export interface IOrderLifecycleProjectionRepository {
  /**
   * Persist a newly created projection.
   * Returns the saved projection (with DB-assigned timestamps).
   */
  create(
    projection: OrderLifecycleProjection,
    connection?: any,
  ): Promise<OrderLifecycleProjection>;

  /**
   * Load a projection by its primary key (orderId).
   * Returns null if the projection does not exist yet.
   */
  findByOrderId(
    orderId: number,
    connection?: any,
  ): Promise<OrderLifecycleProjection | null>;

  /**
   * Load a projection by the customer-facing order hash.
   * Returns null if not found.
   */
  findByOrderHash(
    orderHash: string,
    connection?: any,
  ): Promise<OrderLifecycleProjection | null>;

  /**
   * Load a projection with a row-level write lock (FOR UPDATE on MySQL).
   * On SQLite, returns the row without a lock (SQLite uses DB-level locking).
   * Used exclusively inside transactions before update.
   */
  findByOrderIdForUpdate(
    orderId: number,
    connection?: any,
  ): Promise<OrderLifecycleProjection | null>;

  /**
   * Persist changes to an existing projection.
   *
   * Implements optimistic locking:
   *   UPDATE ... WHERE order_id = ? AND version = ?
   *
   * If affectedRows === 0, throws a concurrency conflict error.
   * Callers must handle this error and retry.
   */
  update(
    projection: OrderLifecycleProjection,
    connection?: any,
  ): Promise<void>;

  /**
   * Returns true if a projection exists for this orderId.
   */
  exists(orderId: number, connection?: any): Promise<boolean>;

  /**
   * Delete all projection rows. Used exclusively during rebuild/replay.
   * Must be called within a transaction controlled by the rebuilder.
   */
  deleteAll(connection?: any): Promise<void>;

  /**
   * Returns the total number of projection rows.
   * Used by the rebuilder for post-replay verification.
   */
  count(connection?: any): Promise<number>;
}
