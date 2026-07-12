/**
 * IProcessedEventsRepository — idempotency deduplication table contract.
 *
 * RFC-007 §16 / §37 — Event Idempotency
 *
 * This table provides exactly-once projection semantics over at-least-once delivery.
 *
 * Contract Invariants:
 *  - `markProcessed()` relies on the DB unique constraint on event_id.
 *  - If a duplicate key violation occurs, returns false (already processed).
 *  - Application-side read-then-write checks are NEVER used (race-condition risk).
 *  - Only the DB unique constraint is the source of truth for deduplication.
 */
export interface IProcessedEventsRepository {
  /**
   * Attempt to record the event as processed.
   *
   * Algorithm (per RFC-007 §16):
   *  1. INSERT INTO processed_events (event_id) VALUES (?)
   *  2. On success  → returns true  (first time this event was seen)
   *  3. On unique constraint violation → returns false (duplicate, skip processing)
   *
   * Must be called at the START of a transaction, before any projection changes.
   */
  markProcessed(eventId: string, connection?: any): Promise<boolean>;

  /**
   * Check whether an event has already been recorded.
   * Used for diagnostics and replay verification only — NOT for deduplication gating.
   */
  isProcessed(eventId: string, connection?: any): Promise<boolean>;

  /**
   * Delete ALL processed event records.
   * Used exclusively during full projection rebuild.
   */
  deleteAll(connection?: any): Promise<void>;

  /**
   * Returns the total count of processed event records.
   * Used by the rebuilder for post-replay count verification.
   */
  count(connection?: any): Promise<number>;
}
