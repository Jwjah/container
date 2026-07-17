import { AnalyticsEventSource } from './AnalyticsEventSource';
import { AnalyticsEventDispatcher } from './AnalyticsEventDispatcher';
import { DomainEvent } from '../../tracking/domain/events/DomainEvent';
import { AnalyticsMetricsService } from '../application/metrics/AnalyticsMetricsService';
import db from '../../config/database';

/**
 * AnalyticsWorker — coordinates background outbox polling, transactional processing, and DLQ.
 * RFC-010 Specification
 */
export class AnalyticsWorker {
  private isRunning = false;
  private timer: any = null;
  public processedEventCount = 0;
  private readonly retryLimits = new Map<string, number>();

  constructor(
    private readonly source: AnalyticsEventSource,
    private readonly dispatcher: AnalyticsEventDispatcher,
    private readonly pollIntervalMs: number = 200,
    private readonly batchSize: number = 10
  ) {}

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🚀 [AnalyticsWorker] Background worker started');
    this.tick();
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('🛑 [AnalyticsWorker] Background worker stopped');
  }

  private tick(): void {
    if (!this.isRunning) return;

    this.processBatch()
      .then(() => {
        if (this.isRunning) {
          this.timer = setTimeout(() => this.tick(), this.pollIntervalMs);
        }
      })
      .catch(err => {
        console.error('🚨 [AnalyticsWorker] Tick error:', err.message);
        if (this.isRunning) {
          this.timer = setTimeout(() => this.tick(), this.pollIntervalMs * 2);
        }
      });
  }

  private async processBatch(): Promise<void> {
    const start = Date.now();
    const events = await this.source.poll(this.batchSize);
    if (events.length === 0) return;

    for (const event of events) {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await this.dispatcher.dispatch(event, conn);
        await this.source.acknowledge(event, conn);
        await conn.commit();
        this.processedEventCount++;
        AnalyticsMetricsService.lastProcessedEventId = event.eventId;
        AnalyticsMetricsService.processingDurationMs = Date.now() - start;
      } catch (err: any) {
        await conn.rollback();
        console.warn(`⚠️ [AnalyticsWorker] Failed to process ${event.eventId}: ${err.message}`);
        await this.handleFailure(event, err);
      } finally {
        conn.release();
      }
    }
  }

  private async handleFailure(event: DomainEvent, error: any): Promise<void> {
    const retries = this.retryLimits.get(event.eventId) || 0;
    if (retries >= 2) {
      console.error(`🚨 [AnalyticsWorker] Event ${event.eventId} exceeded retries → DLQ`);
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute(
          `INSERT INTO dead_letter_events
             (event_id, aggregate_id, aggregate_type, event_type, payload, error_message, retry_count)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            event.eventId,
            event.payload.orderId || event.payload.shopId || 'unknown',
            'AnalyticsEvent',
            event.eventType,
            JSON.stringify(event.payload),
            error.message,
            5
          ]
        );
        await this.source.acknowledge(event, conn);
        await conn.commit();
      } catch (dlqErr: any) {
        await conn.rollback();
        console.error('🚨 [AnalyticsWorker] DLQ write failed:', dlqErr.message);
      } finally {
        conn.release();
      }
    } else {
      this.retryLimits.set(event.eventId, retries + 1);
    }
  }
}
