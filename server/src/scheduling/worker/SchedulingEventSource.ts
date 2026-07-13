import { DomainEvent } from '../../tracking/domain/events/DomainEvent';
import db from '../../config/database';

/**
 * SchedulingEventSource — manages database polling and processed tracking for the scheduling worker.
 *
 * RFC-008 Part 5 Specification
 */
export class SchedulingEventSource {
  /**
   * Polls events from outbox that have not been processed by the scheduling context.
   */
  public async poll(batchSize: number): Promise<DomainEvent[]> {
    const query = `
      SELECT o.* 
      FROM outbox_events o
      LEFT JOIN scheduling_processed_events s ON o.event_id = s.event_id
      WHERE s.event_id IS NULL
      ORDER BY o.id ASC 
      LIMIT ?
    `;

    try {
      const [rows] = await db.execute(query, [batchSize]);
      return (rows as any[]).map(row => {
        let payloadObj: any = {};
        try {
          payloadObj = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        } catch {
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

        (domainEvent as any)._metadata = {
          dbId: row.id,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id
        };

        return domainEvent;
      });
    } catch (err: any) {
      console.error('[SchedulingEventSource.poll] Error:', err.message);
      return [];
    }
  }

  /**
   * Writes the processed marker inside the transaction boundary.
   */
  public async acknowledge(event: DomainEvent, connection: any): Promise<void> {
    const query = 'INSERT INTO scheduling_processed_events (event_id) VALUES (?)';
    await connection.execute(query, [event.eventId]);
  }

  /**
   * Peeks lag queue size.
   */
  public async peekLag(): Promise<number> {
    const query = `
      SELECT COUNT(*) AS lag 
      FROM outbox_events o
      LEFT JOIN scheduling_processed_events s ON o.event_id = s.event_id
      WHERE s.event_id IS NULL
    `;
    try {
      const [rows] = await db.execute(query);
      return Number((rows as any[])[0]?.lag ?? 0);
    } catch (err: any) {
      console.error('[SchedulingEventSource.peekLag] Error:', err.message);
      return 0;
    }
  }
}
export const globalSchedulingEventSource = new SchedulingEventSource();
