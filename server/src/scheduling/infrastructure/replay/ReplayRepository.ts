import { DomainEvent } from '../../../tracking/domain/events/DomainEvent';
import db from '../../../config/database';

export class ReplayRepository {
  public async getEvents(options?: {
    startDate?: Date;
    endDate?: Date;
    aggregateId?: string;
  }): Promise<DomainEvent[]> {
    let query = 'SELECT * FROM outbox_events WHERE 1=1';
    const params: any[] = [];

    if (options?.startDate) {
      query += ' AND occurred_at >= ?';
      params.push(options.startDate.toISOString());
    }
    if (options?.endDate) {
      query += ' AND occurred_at <= ?';
      params.push(options.endDate.toISOString());
    }
    if (options?.aggregateId) {
      query += ' AND aggregate_id = ?';
      params.push(options.aggregateId);
    }

    query += ' ORDER BY id ASC';

    try {
      const [rows] = await db.execute(query, params);
      return (rows as any[]).map(row => {
        let payloadObj: any = {};
        try {
          payloadObj = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        } catch {
          payloadObj = {};
        }

        const occurredDate = row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at);

        return {
          eventId: row.event_id,
          eventType: row.event_type,
          eventVersion: row.event_version || 1,
          occurredAt: occurredDate,
          correlationId: row.correlation_id || '',
          causationId: payloadObj.causationId || row.event_id,
          payload: payloadObj
        };
      });
    } catch (err: any) {
      console.error('[ReplayRepository.getEvents] Error:', err.message);
      throw err;
    }
  }

  /**
   * Reset the projection state tables.
   */
  public async resetSchedulingTables(): Promise<void> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM scheduling_print_queue');
      await conn.execute('DELETE FROM scheduling_processed_events');
      
      // Reset inventory quantity levels to initial test capacities (A4: 5000, Ink: 100%)
      await conn.execute('UPDATE scheduling_inventory SET quantity = 5000 WHERE type = \'paper\'');
      await conn.execute('UPDATE scheduling_inventory SET quantity = 100 WHERE type = \'ink\'');

      await conn.commit();
    } catch (err: any) {
      await conn.rollback();
      console.error('[ReplayRepository.resetSchedulingTables] Failed:', err.message);
      throw err;
    } finally {
      conn.release();
    }
  }
}
export const globalReplayRepository = new ReplayRepository();
