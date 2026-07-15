import { NotificationEventSource } from './NotificationEventSource';
import { NotificationEventDispatcher } from './NotificationEventDispatcher';
import { DomainEvent } from '../../tracking/domain/events/DomainEvent';
import db from '../../config/database';

/**
 * NotificationEventWorker — coordinates background outbox polling, transactional delivery commits, and retries.
 *
 * RFC-009 Specification
 */
export class NotificationEventWorker {
  private isRunning = false;
  private timer: any = null;
  public processedEventCount = 0;
  private readonly retryLimits = new Map<string, number>();

  constructor(
    private readonly source: NotificationEventSource,
    private readonly dispatcher: NotificationEventDispatcher,
    private readonly pollIntervalMs: number = 200,
    private readonly batchSize: number = 10
  ) {}

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🚀 [NotificationEventWorker] Background polling worker started');
    this.tick();
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('🛑 [NotificationEventWorker] Background polling worker stopped');
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
        console.error('🚨 [NotificationEventWorker] Tick processing error:', err.message);
        if (this.isRunning) {
          this.timer = setTimeout(() => this.tick(), this.pollIntervalMs * 2); // simple backoff
        }
      });
  }

  private async processBatch(): Promise<void> {
    const events = await this.source.poll(this.batchSize);
    if (events.length === 0) return;

    for (const event of events) {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        // Dispatch handler
        await this.dispatcher.dispatch(event, conn);

        // Acknowledge processed marker
        await this.source.acknowledge(event, conn);

        await conn.commit();
        this.processedEventCount++;
      } catch (err: any) {
        await conn.rollback();
        console.warn(`⚠️ [NotificationEventWorker] Failed to process event ${event.eventId}: ${err.message}`);
        await this.handleFailure(event, err);
      } finally {
        conn.release();
      }
    }
  }

  private async handleFailure(event: DomainEvent, error: any): Promise<void> {
    const retries = this.retryLimits.get(event.eventId) || 0;

    if (retries >= 2) {
      // 3 strikes: move to DLQ dead letter box
      console.error(`🚨 [NotificationEventWorker] Event ${event.eventId} exceeded retries. Moving to Dead Letter Queue (DLQ).`);
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        
        // Write to DLQ table
        const query = `
          INSERT INTO dead_letter_events (
            event_id, aggregate_id, aggregate_type, event_type, payload, error_message
          ) VALUES (?, ?, ?, ?, ?, ?)
        `;
        await conn.execute(query, [
          event.eventId,
          event.payload.orderId || event.payload.shopId || 'unknown',
          'NotificationEvent',
          event.eventType,
          JSON.stringify(event.payload),
          error.message
        ]);

        // Acknowledge in inbox processed markers to remove from pending stream
        await this.source.acknowledge(event, conn);

        await conn.commit();
      } catch (dlqErr: any) {
        await conn.rollback();
        console.error('🚨 [NotificationEventWorker] Failed to write event to DLQ:', dlqErr.message);
      } finally {
        conn.release();
      }
    } else {
      this.retryLimits.set(event.eventId, retries + 1);
      // Wait a moment before allowing the event to poll again
      console.log(`🔄 [NotificationEventWorker] Event ${event.eventId} marked for retry (${retries + 1}/3)`);
    }
  }
}
