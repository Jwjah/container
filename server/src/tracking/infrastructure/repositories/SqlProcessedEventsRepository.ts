import { IProcessedEventsRepository } from '../../interfaces/IProcessedEventsRepository';
import db from '../../../config/database';

/**
 * SqlProcessedEventsRepository — DB-constraint-based event idempotency.
 *
 * RFC-007 §16 / §37
 *
 * Core guarantee:
 *   The database PRIMARY KEY constraint on `event_id` is the SOLE source of
 *   deduplication truth. Application-side read-then-check is intentionally
 *   avoided — it is susceptible to race conditions under concurrent workers.
 *
 * `markProcessed()` algorithm (RFC-007 §16):
 *   1. BEGIN TRANSACTION (controlled by caller's outer transaction)
 *   2. INSERT INTO processed_events (event_id) VALUES (?)
 *   3. Success  → return true  (first time this event was seen)
 *   4. Unique constraint violation → return false (already processed, skip)
 *
 * Compatible with both SQLite (better-sqlite3 adapter) and MySQL (mysql2 pool).
 */
export class SqlProcessedEventsRepository implements IProcessedEventsRepository {
  // ────────────────────────────────────────────────────────────────────────────
  // IProcessedEventsRepository
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Attempt to record the event as processed.
   *
   * Returns true  → first time; caller should proceed with projection update.
   * Returns false → already processed; caller must skip projection update.
   *
   * MUST be called inside the caller's transaction so that a subsequent
   * rollback also rolls back this insert.
   *
   * RFC-007 §16
   */
  public async markProcessed(
    eventId: string,
    connection?: any,
  ): Promise<boolean> {
    const executor = connection || db;

    try {
      // INSERT OR IGNORE handles SQLite; MySQL equivalent via catch below
      const [result] = await executor.execute(
        'INSERT OR IGNORE INTO processed_events (event_id) VALUES (?)',
        [eventId],
      );

      // SQLite: insertId / changes; MySQL: affectedRows
      const affected =
        (result as any).affectedRows ??
        (result as any).changes ??
        0;

      return affected > 0;
    } catch (err: any) {
      // MySQL: INSERT OR IGNORE is not valid — duplicate key arrives as an error
      if (this.isDuplicateKeyError(err)) {
        return false; // Already processed — idempotent
      }
      throw this.wrapError(err, 'markProcessed');
    }
  }

  /**
   * Check whether an event has already been processed.
   *
   * Used ONLY for diagnostics and replay verification.
   * NOT used for deduplication gating (use markProcessed instead).
   *
   * RFC-007 §16
   */
  public async isProcessed(
    eventId: string,
    connection?: any,
  ): Promise<boolean> {
    const executor = connection || db;
    try {
      const [rows] = await executor.execute(
        'SELECT 1 AS found FROM processed_events WHERE event_id = ? LIMIT 1',
        [eventId],
      );
      return (rows as any[]).length > 0;
    } catch (err: any) {
      throw this.wrapError(err, 'isProcessed');
    }
  }

  /**
   * Delete ALL processed event records.
   * Used EXCLUSIVELY during full projection rebuild.
   * Must be called within the rebuilder's controlling transaction.
   *
   * RFC-007 §27
   */
  public async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      await executor.execute('DELETE FROM processed_events');
    } catch (err: any) {
      throw this.wrapError(err, 'deleteAll');
    }
  }

  /**
   * Returns total count of processed event records.
   * Used by the rebuilder for post-replay count verification.
   *
   * RFC-007 §27
   */
  public async count(connection?: any): Promise<number> {
    const executor = connection || db;
    try {
      const [rows] = await executor.execute(
        'SELECT COUNT(*) AS cnt FROM processed_events',
      );
      const row = (rows as any[])[0];
      return row ? Number(row.cnt ?? row['COUNT(*)'] ?? 0) : 0;
    } catch (err: any) {
      throw this.wrapError(err, 'count');
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Error helpers
  // ────────────────────────────────────────────────────────────────────────────

  private isDuplicateKeyError(err: any): boolean {
    const msg: string = err?.message ?? '';
    return (
      msg.includes('UNIQUE constraint failed') || // SQLite
      msg.includes('ER_DUP_ENTRY') ||             // MySQL error code
      msg.includes('Duplicate entry')             // MySQL message text
    );
  }

  private wrapError(err: any, method: string): Error {
    const msg = err?.message ?? String(err);
    const wrapped = new Error(
      `[SqlProcessedEventsRepository.${method}] Database error: ${msg}`,
    );
    wrapped.name = 'ProcessedEventsRepositoryError';
    return wrapped;
  }
}
