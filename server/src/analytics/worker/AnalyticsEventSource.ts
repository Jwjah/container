import { DomainEvent } from '../../tracking/domain/events/DomainEvent';
import db from '../../config/database';

/**
 * AnalyticsEventSource — polls outbox_events for unprocessed analytics events using inbox constraint.
 * RFC-010 Specification
 */
export class AnalyticsEventSource {
  private _lastProcessedEventId: string | null = null;

  public get lastProcessedEventId(): string | null {
    return this._lastProcessedEventId;
  }

  public async poll(batchSize: number): Promise<DomainEvent[]> {
    const query = `
      SELECT o.* FROM outbox_events o
      LEFT JOIN analytics_events_processed p ON o.event_id = p.event_id
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
      console.error('[AnalyticsEventSource.poll] Error:', err.message);
      throw err;
    }
  }

  public async acknowledge(event: DomainEvent, connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      await executor.execute(
        'INSERT INTO analytics_events_processed (event_id) VALUES (?)',
        [event.eventId]
      );
      this._lastProcessedEventId = event.eventId;
    } catch (err: any) {
      if (!err.message.includes('UNIQUE') && !err.message.includes('Duplicate')) {
        throw err;
      }
    }
  }

  public async peekLag(): Promise<number> {
    const [rows] = await db.execute(`
      SELECT COUNT(*) AS lag FROM outbox_events o
      LEFT JOIN analytics_events_processed p ON o.event_id = p.event_id
      WHERE p.event_id IS NULL
    `);
    return Number((rows as any[])[0]?.lag ?? 0);
  }
}
