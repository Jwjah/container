import { DomainEvent } from '../../tracking/domain/events/DomainEvent';
import db from '../../config/database';

/**
 * NotificationEventSource — queries pending log events using inbox processed constraints.
 *
 * RFC-009 Specification
 */
export class NotificationEventSource {
  public async poll(batchSize: number): Promise<DomainEvent[]> {
    const query = `
      SELECT o.* FROM outbox_events o
      LEFT JOIN processed_notification_events p ON o.event_id = p.event_id
      WHERE p.event_id IS NULL
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
        return {
          eventId: row.event_id,
          eventType: row.event_type,
          eventVersion: row.event_version || 1,
          occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at),
          correlationId: row.correlation_id || '',
          causationId: payloadObj.causationId || row.event_id,
          payload: payloadObj
        };
      });
    } catch (err: any) {
      console.error('[NotificationEventSource.poll] Error:', err.message);
      throw err;
    }
  }

  public async acknowledge(event: DomainEvent, connection?: any): Promise<void> {
    const executor = connection || db;
    const query = 'INSERT INTO processed_notification_events (event_id) VALUES (?)';
    try {
      await executor.execute(query, [event.eventId]);
    } catch (err: any) {
      // Ignore if already marked processed
      if (!err.message.includes('UNIQUE') && !err.message.includes('Duplicate')) {
        console.error('[NotificationEventSource.acknowledge] Error:', err.message);
        throw err;
      }
    }
  }

  public async peekLag(): Promise<number> {
    const query = `
      SELECT COUNT(*) AS lag FROM outbox_events o
      LEFT JOIN processed_notification_events p ON o.event_id = p.event_id
      WHERE p.event_id IS NULL
    `;
    try {
      const [rows] = await db.execute(query);
      return Number((rows as any[])[0]?.lag ?? 0);
    } catch (err: any) {
      console.error('[NotificationEventSource.peekLag] Error:', err.message);
      return 0;
    }
  }
}
