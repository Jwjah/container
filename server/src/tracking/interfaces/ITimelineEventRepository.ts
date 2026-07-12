import { TimelineEvent } from '../domain/entities/TimelineEvent';

/**
 * ITimelineEventRepository — persistence contract for immutable timeline events.
 *
 * RFC-007 §41 — Repository Contracts
 *
 * Invariants enforced by this contract:
 *  - Timeline rows are NEVER updated (no `update()` method exists).
 *  - Timeline rows are NEVER individually deleted.
 *  - `deleteByOrderId()` and `deleteAll()` exist only for projection rebuild.
 */
export interface ITimelineEventRepository {
  /**
   * Append a new immutable timeline entry.
   * Returns the persisted event with its DB-assigned `id`.
   */
  append(event: TimelineEvent, connection?: any): Promise<TimelineEvent>;

  /**
   * Load the full chronological timeline for an order.
   * Ordering: occurredAt ASC, then eventId ASC (deterministic tie-breaking).
   */
  findByOrderId(
    orderId: number,
    connection?: any,
  ): Promise<TimelineEvent[]>;

  /**
   * Check whether a timeline entry for a given outbox eventId already exists.
   * Used as a secondary idempotency check (primary is processed_events table).
   */
  findByEventId(
    eventId: string,
    connection?: any,
  ): Promise<TimelineEvent | null>;

  /**
   * Delete all timeline entries for a single order.
   * Used only when a projection is deleted during rebuild.
   */
  deleteByOrderId(orderId: number, connection?: any): Promise<void>;

  /**
   * Delete ALL timeline entries across all orders.
   * Used exclusively during full projection rebuild.
   */
  deleteAll(connection?: any): Promise<void>;

  /**
   * Returns the total number of timeline rows.
   * Used by the rebuilder for post-replay count verification.
   */
  count(connection?: any): Promise<number>;
}
