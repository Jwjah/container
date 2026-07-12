import { ITimelineEventRepository } from '../../interfaces/ITimelineEventRepository';
import { TimelineEvent } from '../../domain/entities/TimelineEvent';
import { LifecycleState } from '../../domain/enums/LifecycleState';
import { ActorType } from '../../domain/enums/ActorType';
import db from '../../../config/database';

/**
 * SqlTimelineEventRepository — append-only persistence for lifecycle history.
 *
 * RFC-007 §36 / §41
 *
 * Invariants:
 *  - NO `update()` method exists — timeline rows are permanently immutable.
 *  - `append()` is the ONLY write operation.
 *  - `deleteByOrderId()` and `deleteAll()` exist solely for projection rebuild.
 *  - Timeline ordering: occurredAt ASC, then eventId ASC (stable under replay).
 *  - Raw DB errors are converted to application-safe errors.
 *
 * Compatible with both SQLite (better-sqlite3 adapter) and MySQL (mysql2 pool).
 */
export class SqlTimelineEventRepository implements ITimelineEventRepository {
  // ────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────────────────

  private toEntity(row: any): TimelineEvent {
    let metadata: Record<string, unknown> | null = null;
    if (row.metadata) {
      try {
        metadata =
          typeof row.metadata === 'string'
            ? JSON.parse(row.metadata)
            : row.metadata;
      } catch {
        metadata = null;
      }
    }

    return new TimelineEvent(
      row.id,
      row.order_id,
      row.event_id,
      row.event_type,
      row.state as LifecycleState,
      row.title,
      row.description,
      new Date(row.occurred_at),
      row.actor_type as ActorType,
      row.actor_id ?? null,
      metadata,
      row.correlation_id,
      row.causation_id,
    );
  }

  private toDb(date: Date): string {
    return date.toISOString();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ITimelineEventRepository
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Append a new immutable timeline entry.
   *
   * The UNIQUE constraint on (order_id, event_id) prevents duplicate timeline
   * rows if the same event is somehow processed twice (secondary idempotency;
   * primary is processed_events table). On conflict we silently return the
   * original event — the processed_events table is the authoritative gate.
   */
  public async append(
    event: TimelineEvent,
    connection?: any,
  ): Promise<TimelineEvent> {
    const executor = connection || db;

    const metadataJson =
      event.metadata !== null ? JSON.stringify(event.metadata) : null;

    try {
      const [result] = await executor.execute(
        `INSERT OR IGNORE INTO order_lifecycle_timeline_events (
          order_id, event_id, event_type, state,
          title, description, occurred_at,
          actor_type, actor_id, metadata,
          correlation_id, causation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.orderId,
          event.eventId,
          event.eventType,
          event.state,
          event.title,
          event.description,
          this.toDb(event.occurredAt),
          event.actorType,
          event.actorId,
          metadataJson,
          event.correlationId,
          event.causationId,
        ],
      );

      const insertedId =
        (result as any).insertId ??
        (result as any).lastInsertRowid ??
        null;

      // Return a new instance with the DB-assigned id
      return new TimelineEvent(
        insertedId,
        event.orderId,
        event.eventId,
        event.eventType,
        event.state,
        event.title,
        event.description,
        event.occurredAt,
        event.actorType,
        event.actorId,
        event.metadata,
        event.correlationId,
        event.causationId,
      );
    } catch (err: any) {
      // MySQL doesn't support INSERT OR IGNORE — use INSERT IGNORE equivalent
      // The DB adapter translates accordingly; handle any residual dup-key quietly
      if (this.isDuplicateKeyError(err)) {
        return event; // Already exists — idempotent
      }
      throw this.wrapError(err, 'append');
    }
  }

  /**
   * Load all timeline events for an order in deterministic order.
   *
   * RFC-007 §18 — Timeline Ordering:
   *   Primary   → occurred_at ASC
   *   Secondary → event_id ASC   (lexicographic UUID tie-break, stable across replay)
   */
  public async findByOrderId(
    orderId: number,
    connection?: any,
  ): Promise<TimelineEvent[]> {
    const executor = connection || db;
    try {
      const [rows] = await executor.execute(
        `SELECT * FROM order_lifecycle_timeline_events
         WHERE order_id = ?
         ORDER BY occurred_at ASC, event_id ASC`,
        [orderId],
      );
      return (rows as any[]).map((r) => this.toEntity(r));
    } catch (err: any) {
      throw this.wrapError(err, 'findByOrderId');
    }
  }

  public async findByEventId(
    eventId: string,
    connection?: any,
  ): Promise<TimelineEvent | null> {
    const executor = connection || db;
    try {
      const [rows] = await executor.execute(
        'SELECT * FROM order_lifecycle_timeline_events WHERE event_id = ? LIMIT 1',
        [eventId],
      );
      const list = rows as any[];
      return list.length > 0 ? this.toEntity(list[0]) : null;
    } catch (err: any) {
      throw this.wrapError(err, 'findByEventId');
    }
  }

  public async deleteByOrderId(
    orderId: number,
    connection?: any,
  ): Promise<void> {
    const executor = connection || db;
    try {
      await executor.execute(
        'DELETE FROM order_lifecycle_timeline_events WHERE order_id = ?',
        [orderId],
      );
    } catch (err: any) {
      throw this.wrapError(err, 'deleteByOrderId');
    }
  }

  public async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      await executor.execute('DELETE FROM order_lifecycle_timeline_events');
    } catch (err: any) {
      throw this.wrapError(err, 'deleteAll');
    }
  }

  public async count(connection?: any): Promise<number> {
    const executor = connection || db;
    try {
      const [rows] = await executor.execute(
        'SELECT COUNT(*) AS cnt FROM order_lifecycle_timeline_events',
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
      msg.includes('ER_DUP_ENTRY') ||             // MySQL
      msg.includes('Duplicate entry')             // MySQL message text
    );
  }

  private wrapError(err: any, method: string): Error {
    const msg = err?.message ?? String(err);
    const wrapped = new Error(
      `[SqlTimelineEventRepository.${method}] Database error: ${msg}`,
    );
    wrapped.name = 'TimelineRepositoryError';
    return wrapped;
  }
}
