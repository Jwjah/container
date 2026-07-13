import { IProjectionEventSource } from '../../application/events/IProjectionEventSource';
import { DomainEvent } from '../../domain/events/DomainEvent';
import db from '../../../config/database';

/**
 * OutboxProjectionEventSource — database-backed event source using outbox_events.
 *
 * RFC-007 Phase 7D Specification
 */
export class OutboxProjectionEventSource implements IProjectionEventSource {
  /**
   * Poll eligible events: PENDING, FAILED with retries left, or PROCESSING with expired leases.
   */
  public async poll(batchSize: number): Promise<DomainEvent[]> {
    const isMySQL = process.env.DB_MODE === 'mysql';
    const expiredTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minute lease expiry
    const expiredTimeStr = expiredTime.toISOString();

    // Select pending events, failed events with retries remaining (< 5), or stale processing events
    const selectQuery = isMySQL
      ? `SELECT * FROM outbox_events 
         WHERE status = 'PENDING' 
            OR (status = 'FAILED' AND retry_count < 5)
            OR (status = 'PROCESSING' AND processing_started_at < ?)
         ORDER BY id ASC 
         LIMIT ?`
      : `SELECT * FROM outbox_events 
         WHERE status = 'PENDING' 
            OR (status = 'FAILED' AND retry_count < 5)
            OR (status = 'PROCESSING' AND processing_started_at < ?)
         ORDER BY id ASC 
         LIMIT ?`;

    try {
      const [rows] = await db.execute(selectQuery, [expiredTimeStr, batchSize]);
      return (rows as any[]).map((row) => {
        let payloadObj: any = {};
        try {
          payloadObj = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        } catch (e) {
          payloadObj = {};
        }

        const occurredDate = row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at);

        const domainEvent: DomainEvent = {
          eventId: row.event_id,
          eventType: row.event_type,
          eventVersion: row.event_version || 1,
          occurredAt: occurredDate,
          correlationId: row.correlation_id || '',
          causationId: payloadObj.causationId || row.event_id,
          payload: payloadObj
        };

        // Attach private metadata for physical db updates
        (domainEvent as any)._metadata = {
          dbId: row.id,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          retryCount: row.retry_count || 0
        };

        return domainEvent;
      });
    } catch (err: any) {
      console.error('[OutboxProjectionEventSource.poll] Error:', err.message);
      return [];
    }
  }

  /**
   * Acquire a lease on a batch of events.
   * If leasing fails (due to concurrent worker acquisition), the event is filtered out of the batch.
   */
  public async lease(events: DomainEvent[], leaseDurationMs: number, workerId: string): Promise<void> {
    const expiredTime = new Date(Date.now() - leaseDurationMs);
    const expiredTimeStr = expiredTime.toISOString();
    const nowStr = new Date().toISOString();

    const updateQuery = `
      UPDATE outbox_events 
      SET status = 'PROCESSING', 
          worker_id = ?, 
          processing_started_at = ?, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? 
        AND (status = 'PENDING' OR status = 'FAILED' OR (status = 'PROCESSING' AND processing_started_at < ?))
    `;

    const successfulEvents: DomainEvent[] = [];

    for (const event of events) {
      const metadata = (event as any)._metadata;
      if (!metadata) continue;

      try {
        const [result] = await db.execute(updateQuery, [
          workerId,
          nowStr,
          metadata.dbId,
          expiredTimeStr
        ]);

        const affected = (result as any).affectedRows ?? (result as any).changes ?? 0;
        if (affected > 0) {
          successfulEvents.push(event);
        }
      } catch (err: any) {
        console.warn(`[OutboxProjectionEventSource.lease] Failed to lease event ${event.eventId}:`, err.message);
      }
    }

    // Mutate the array in place to only include successfully leased events
    events.length = 0;
    events.push(...successfulEvents);
  }

  /**
   * Release lease on events, reverting them back to PENDING/FAILED.
   */
  public async release(events: DomainEvent[]): Promise<void> {
    const updateQuery = `
      UPDATE outbox_events 
      SET status = CASE WHEN retry_count > 0 THEN 'FAILED' ELSE 'PENDING' END,
          worker_id = NULL,
          processing_started_at = NULL,
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;

    for (const event of events) {
      const metadata = (event as any)._metadata;
      if (!metadata) continue;

      try {
        await db.execute(updateQuery, [metadata.dbId]);
      } catch (err: any) {
        console.error(`[OutboxProjectionEventSource.release] Failed to release event ${event.eventId}:`, err.message);
      }
    }
  }

  /**
   * Acknowledge successfully processed events (status = PROCESSED).
   */
  public async acknowledge(events: DomainEvent[]): Promise<void> {
    const updateQuery = `
      UPDATE outbox_events 
      SET status = 'PROCESSED',
          worker_id = NULL,
          processing_started_at = NULL,
          processed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;

    for (const event of events) {
      const metadata = (event as any)._metadata;
      if (!metadata) continue;

      try {
        await db.execute(updateQuery, [metadata.dbId]);
      } catch (err: any) {
        console.error(`[OutboxProjectionEventSource.acknowledge] Failed to ack event ${event.eventId}:`, err.message);
      }
    }
  }

  /**
   * Record a transient processing failure.
   */
  public async markFailed(event: DomainEvent, error: string, maxRetries: number): Promise<void> {
    const metadata = (event as any)._metadata;
    if (!metadata) return;

    const newRetryCount = metadata.retryCount + 1;
    const isFailedPermanently = newRetryCount >= maxRetries;

    const updateQuery = `
      UPDATE outbox_events 
      SET status = ?, 
          retry_count = ?, 
          error_log = ?, 
          worker_id = NULL,
          processing_started_at = NULL,
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;

    try {
      const status = isFailedPermanently ? 'FAILED' : 'PENDING'; // Keep as PENDING for retry, or FAILED if maxed
      await db.execute(updateQuery, [
        status,
        newRetryCount,
        error.substring(0, 500),
        metadata.dbId
      ]);
    } catch (err: any) {
      console.error(`[OutboxProjectionEventSource.markFailed] Failed for event ${event.eventId}:`, err.message);
    }
  }

  /**
   * Move event to DLQ and remove/mark failed permanently in outbox.
   */
  public async markDeadLetter(event: DomainEvent, error: string): Promise<void> {
    const metadata = (event as any)._metadata;
    if (!metadata) return;

    const insertDlqQuery = `
      INSERT INTO dead_letter_events (
        event_id, aggregate_id, aggregate_type, event_type, payload, error_message, retry_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const deleteOutboxQuery = `
      DELETE FROM outbox_events WHERE id = ?
    `;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Write to DLQ table
      await conn.execute(insertDlqQuery, [
        event.eventId,
        metadata.aggregateId,
        metadata.aggregateType,
        event.eventType,
        JSON.stringify(event.payload),
        error,
        metadata.retryCount
      ]);

      // 2. Remove from outbox so it is never polled again
      await conn.execute(deleteOutboxQuery, [metadata.dbId]);

      await conn.commit();
    } catch (err: any) {
      await conn.rollback();
      console.error(`[OutboxProjectionEventSource.markDeadLetter] Transaction failed for event ${event.eventId}:`, err.message);
    } finally {
      conn.release();
    }
  }

  /**
   * Retrieve total pending/failed lag.
   */
  public async peekLag(): Promise<number> {
    const query = `
      SELECT COUNT(*) AS lag 
      FROM outbox_events 
      WHERE status = 'PENDING' 
         OR (status = 'FAILED' AND retry_count < 5)
    `;
    try {
      const [rows] = await db.execute(query);
      const row = (rows as any[])[0];
      return row ? Number(row.lag ?? row['COUNT(*)'] ?? 0) : 0;
    } catch (err: any) {
      console.error('[OutboxProjectionEventSource.peekLag] Error:', err.message);
      return 0;
    }
  }
}
