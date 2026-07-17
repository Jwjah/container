import { IOutboxRepository } from '../../interfaces/IOutboxRepository';
import { OutboxEvent } from '../../domain/entities/OutboxEvent';
import { OutboxEventStatus } from '../../domain/enums/OutboxEventStatus';
import db from '../../../config/database';

export class SqlOutboxRepository implements IOutboxRepository {
  private toEntity(row: any): OutboxEvent {
    return new OutboxEvent(
      row.id,
      row.event_id,
      row.event_type,
      row.aggregate_type,
      row.aggregate_id,
      row.payload,
      row.status as OutboxEventStatus,
      row.retry_count,
      row.error_log,
      row.correlation_id,
      row.event_version,
      new Date(row.occurred_at),
      row.worker_id,
      row.processing_started_at ? new Date(row.processing_started_at) : null,
      row.processed_at ? new Date(row.processed_at) : null,
      new Date(row.created_at),
      new Date(row.updated_at)
    );
  }

  public async create(event: OutboxEvent, connection?: any): Promise<OutboxEvent> {
    const executor = connection || db;
    const occurredAtStr = event.occurredAt.toISOString().slice(0, 19).replace('T', ' ');

    const [result] = await executor.execute(
      `INSERT INTO outbox_events (
        event_id, event_type, aggregate_type, aggregate_id, payload, 
        status, retry_count, error_log, correlation_id, event_version, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.eventId,
        event.eventType,
        event.aggregateType,
        event.aggregateId,
        event.payload,
        event.status,
        event.retryCount,
        event.errorLog,
        event.correlationId,
        event.eventVersion,
        occurredAtStr
      ]
    );

    const insertedId = result.insertId || result.lastID;
    return new OutboxEvent(
      insertedId,
      event.eventId,
      event.eventType,
      event.aggregateType,
      event.aggregateId,
      event.payload,
      event.status,
      event.retryCount,
      event.errorLog,
      event.correlationId,
      event.eventVersion,
      event.occurredAt,
      null,
      null,
      null,
      new Date(),
      new Date()
    );
  }

  public async claimBatch(limit: number, workerId: string, connection?: any): Promise<OutboxEvent[]> {
    const executor = connection || db;
    const isMySQL = process.env.DB_MODE === 'mysql';
    const selectQuery = isMySQL
      ? "SELECT * FROM outbox_events WHERE status = 'PENDING' LIMIT ? FOR UPDATE"
      : "SELECT * FROM outbox_events WHERE status = 'PENDING' LIMIT ?";

    const [rows] = await executor.execute(selectQuery, [limit]);
    if (!rows || rows.length === 0) {
      return [];
    }

    const claimedEvents: OutboxEvent[] = [];
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    for (const row of rows) {
      await executor.execute(
        "UPDATE outbox_events SET status = 'PROCESSING', worker_id = ?, processing_started_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [workerId, nowStr, row.id]
      );
      
      const event = this.toEntity(row);
      event.status = OutboxEventStatus.PROCESSING;
      event.workerId = workerId;
      event.processingStartedAt = new Date(nowStr);
      claimedEvents.push(event);
    }

    return claimedEvents;
  }

  public async update(event: OutboxEvent, connection?: any): Promise<OutboxEvent> {
    const executor = connection || db;
    const startedStr = event.processingStartedAt ? event.processingStartedAt.toISOString().slice(0, 19).replace('T', ' ') : null;
    const processedStr = event.processedAt ? event.processedAt.toISOString().slice(0, 19).replace('T', ' ') : null;

    await executor.execute(
      `UPDATE outbox_events SET 
        status = ?, 
        retry_count = ?, 
        error_log = ?, 
        worker_id = ?, 
        processing_started_at = ?, 
        processed_at = ?, 
        updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
        event.status,
        event.retryCount,
        event.errorLog,
        event.workerId,
        startedStr,
        processedStr,
        event.id
      ]
    );

    return event;
  }

  public async recoverStaleEvents(timeoutMs: number, connection?: any): Promise<number> {
    const executor = connection || db;
    const cutoffTime = new Date(Date.now() - timeoutMs).toISOString().slice(0, 19).replace('T', ' ');

    const [result] = await executor.execute(
      `UPDATE outbox_events 
       SET status = CASE WHEN retry_count + 1 >= 5 THEN 'FAILED' ELSE 'PENDING' END,
           retry_count = retry_count + 1,
           error_log = 'Stale processing timeout recovery',
           worker_id = NULL,
           processing_started_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE status = 'PROCESSING' AND processing_started_at < ?`,
      [cutoffTime]
    );

    return result.affectedRows || result.changes || 0;
  }
}
