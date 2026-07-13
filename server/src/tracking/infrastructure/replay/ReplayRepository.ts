import db from '../../../config/database';
import { DomainEvent } from '../../domain/events/DomainEvent';

export interface ReplayOptions {
  aggregateId?: string;
  aggregateType?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * ReplayRepository — infrastructure helper to query history logs for replay rebuilds.
 *
 * RFC-007 Phase 7F Specification
 */
export class ReplayRepository {
  /**
   * Loads outbox events according to criteria.
   */
  public async getEventsForReplay(options: ReplayOptions): Promise<DomainEvent[]> {
    let query = `SELECT * FROM outbox_events WHERE 1=1`;
    const params: any[] = [];

    if (options.aggregateId) {
      query += ` AND aggregate_id = ?`;
      params.push(options.aggregateId);
    }
    if (options.aggregateType) {
      query += ` AND aggregate_type = ?`;
      params.push(options.aggregateType);
    }
    if (options.startDate) {
      query += ` AND occurred_at >= ?`;
      params.push(options.startDate.toISOString());
    }
    if (options.endDate) {
      query += ` AND occurred_at <= ?`;
      params.push(options.endDate.toISOString());
    }

    query += ` ORDER BY id ASC`; // Ensure absolute timestamp sequence order

    try {
      const [rows] = await db.execute(query, params);
      return this.mapToDomainEvents(rows as any[]);
    } catch (err: any) {
      console.error('[ReplayRepository.getEventsForReplay] Error:', err.message);
      throw err;
    }
  }

  /**
   * Loads dead letter queue events to be re-run.
   */
  public async getDlqEvents(): Promise<DomainEvent[]> {
    const query = `SELECT * FROM dead_letter_events ORDER BY id ASC`;
    try {
      const [rows] = await db.execute(query);
      return (rows as any[]).map((row) => {
        let payloadObj: any = {};
        try {
          payloadObj = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        } catch {
          payloadObj = {};
        }

        const domainEvent: DomainEvent = {
          eventId: row.event_id,
          eventType: row.event_type,
          eventVersion: 1,
          occurredAt: row.failed_at instanceof Date ? row.failed_at : new Date(row.failed_at),
          correlationId: 'dlq-replay-corr',
          causationId: row.event_id,
          payload: payloadObj
        };

        // Private metadata for processing
        (domainEvent as any)._metadata = {
          dbId: row.id,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          retryCount: row.retry_count || 0,
          isDlqEvent: true
        };

        return domainEvent;
      });
    } catch (err: any) {
      console.error('[ReplayRepository.getDlqEvents] Error:', err.message);
      throw err;
    }
  }

  private mapToDomainEvents(rows: any[]): DomainEvent[] {
    return rows.map((row) => {
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
        aggregateId: row.aggregate_id,
        retryCount: row.retry_count || 0
      };

      return domainEvent;
    });
  }
}
