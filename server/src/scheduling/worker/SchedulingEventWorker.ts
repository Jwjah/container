import { SchedulingEventDispatcher } from '../application/events/SchedulingEventDispatcher';
import { SchedulingEventSource } from './SchedulingEventSource';
import { DomainEvent } from '../../tracking/domain/events/DomainEvent';
import crypto from 'crypto';
import db from '../../config/database';

/**
 * SchedulingEventWorker — runs background event loop, coordinates transactions, retry policies, and DLQ routing.
 *
 * RFC-008 Part 5 Specification
 */
export class SchedulingEventWorker {
  public readonly workerId: string;
  private isRunning: boolean = false;
  private isProcessing: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private eventCount: number = 0;

  constructor(
    private readonly source: SchedulingEventSource,
    private readonly dispatcher: SchedulingEventDispatcher,
    private readonly pollIntervalMs: number = 100,
    private readonly batchSize: number = 10
  ) {
    this.workerId = `sched-worker-${crypto.randomUUID()}`;
  }

  public get processedEventCount(): number {
    return this.eventCount;
  }

  public get runningStatus(): boolean {
    return this.isRunning;
  }

  /**
   * Starts the background processing loop.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`🚀 [SchedulingEventWorker] Started background worker ID: ${this.workerId}`);
    this.tick();
  }

  /**
   * Graceful shutdown of worker loop, finishing active transactions.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log(`🛑 [SchedulingEventWorker] Initiating graceful shutdown for worker ID: ${this.workerId}...`);
    
    // Wait for current loop cycle to complete
    while (this.isProcessing) {
      await new Promise(r => setTimeout(r, 50));
    }
    console.log(`✅ [SchedulingEventWorker] Worker ID: ${this.workerId} cleanly shut down.`);
  }

  private tick(): void {
    if (!this.isRunning) return;

    this.timer = setTimeout(async () => {
      this.isProcessing = true;
      try {
        const events = await this.source.poll(this.batchSize);
        if (events.length > 0) {
          for (const event of events) {
            await this.processWithRetry(event);
          }
        }
      } catch (err: any) {
        console.error(`[SchedulingEventWorker] Error in worker tick:`, err.message);
      } finally {
        this.isProcessing = false;
        this.tick();
      }
    }, this.pollIntervalMs);
  }

  private async processWithRetry(event: DomainEvent): Promise<void> {
    const maxRetries = 2;
    let retries = 0;

    while (retries <= maxRetries) {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        // 1. Dispatch event to matching handler
        const wasHandled = await this.dispatcher.dispatch(event, conn);

        // 2. Mark event as processed (even if not handled, to skip it in future polls)
        await this.source.acknowledge(event, conn);

        await conn.commit();
        if (wasHandled) {
          this.eventCount++;
          console.log(`[WorkerLoop] Processed event "${event.eventType}" (id=${event.eventId}, orderId=${event.payload?.orderId})`);
        }
        return; // Success, exit retry loop
      } catch (err: any) {
        await conn.rollback();

        // Check for concurrency or unique constraint violations (indicates duplicate concurrent handling)
        const isDuplicate = err.message.includes('UNIQUE constraint failed') || err.message.includes('Duplicate entry');
        if (isDuplicate) {
          console.warn(`[WorkerLoop] Duplicate event processing skipped for event ID: ${event.eventId}`);
          return;
        }

        retries++;
        if (retries > maxRetries) {
          // Send to DLQ
          await this.sendToDLQ(event, err.message);
          return;
        }

        // Wait before retry (transient error backoff)
        const backoffMs = retries * 200;
        await new Promise(r => setTimeout(r, backoffMs));
      } finally {
        conn.release();
      }
    }
  }

  private async sendToDLQ(event: DomainEvent, errorMessage: string): Promise<void> {
    console.error(`🚨 [DeadLetterService] Moving event ID "${event.eventId}" (type: ${event.eventType}) to DLQ. Error: ${errorMessage}`);
    
    const query = `
      INSERT INTO dead_letter_events (
        event_id, aggregate_id, aggregate_type, event_type, payload, error_message, retry_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const meta = (event as any)._metadata || {};
    const aggId = String(meta.aggregateId || event.payload?.orderId || 'unknown');
    const aggType = String(meta.aggregateType || 'Order');
    const payloadStr = JSON.stringify(event.payload);

    try {
      await db.execute(query, [
        event.eventId,
        aggId,
        aggType,
        event.eventType,
        payloadStr,
        errorMessage,
        2
      ]);

      // Acknowledge in processed list to prevent infinite loop reprocessing
      const conn = await db.getConnection();
      try {
        await this.source.acknowledge(event, conn);
      } finally {
        conn.release();
      }
    } catch (err: any) {
      console.error('[SchedulingEventWorker.sendToDLQ] Failed to write DLQ entry:', err.message);
    }
  }
}
