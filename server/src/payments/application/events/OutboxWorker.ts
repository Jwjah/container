import { IOutboxRepository } from '../../interfaces/IOutboxRepository';
import { EventDispatcher } from './EventDispatcher';
import { OutboxEventStatus } from '../../domain/enums/OutboxEventStatus';
import db from '../../../config/database';
import crypto from 'crypto';

export class OutboxWorker {
  private readonly workerId: string;
  private isRunning: boolean = false;
  private pollTimeout: NodeJS.Timeout | null = null;
  private recoveryTimeout: NodeJS.Timeout | null = null;
  private readonly STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly outboxRepository: IOutboxRepository,
    private readonly eventDispatcher: EventDispatcher
  ) {
    this.workerId = `worker-${crypto.randomUUID()}`;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[OutboxWorker] Started Outbox Worker instance ID: ${this.workerId}`);
    this.poll();
    this.recoverStale();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.pollTimeout) clearTimeout(this.pollTimeout);
    if (this.recoveryTimeout) clearTimeout(this.recoveryTimeout);
    console.log(`[OutboxWorker] Stopped Outbox Worker instance ID: ${this.workerId}`);
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // 1. Claim Batch Transaction (Claim lock)
      const conn = await db.getConnection();
      let claimedEvents: any[] = [];
      try {
        await conn.beginTransaction();
        
        // Select pending events and immediately update status to PROCESSING, worker_id, and processing_started_at
        claimedEvents = await this.outboxRepository.claimBatch(10, this.workerId, conn);
        
        await conn.commit();
      } catch (err: any) {
        await conn.rollback();
        console.error(`[OutboxWorker] Transaction rollback during event claim: ${err.message}`);
      } finally {
        conn.release();
      }

      // 2. Dispatch claimed events
      for (const event of claimedEvents) {
        try {
          console.log(`[OutboxWorker] Processing event ID: ${event.eventId}, type: ${event.eventType}`);
          await this.eventDispatcher.dispatch(event);
          
          // Successful processing
          event.status = OutboxEventStatus.PROCESSED;
          event.processedAt = new Date();
          await this.outboxRepository.update(event);
          console.log(`[OutboxWorker] Successfully processed event ID: ${event.eventId}`);
        } catch (dispatchErr: any) {
          console.error(`[OutboxWorker] Dispatch failed for event ID: ${event.eventId}. Error: ${dispatchErr.message}`);
          event.retryCount += 1;
          event.errorLog = dispatchErr.message;
          // Revert back to PENDING for retry, or set to FAILED if retry limit reached
          event.status = event.retryCount >= 5 ? OutboxEventStatus.FAILED : OutboxEventStatus.PENDING;
          await this.outboxRepository.update(event);
        }
      }
    } catch (e: any) {
      console.error('[OutboxWorker] Error during polling cycle:', e.message);
    }

    // Schedule next poll interval (e.g. 2 seconds)
    if (this.isRunning) {
      this.pollTimeout = setTimeout(() => this.poll(), 2000);
    }
  }

  private async recoverStale(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const recoveredCount = await this.outboxRepository.recoverStaleEvents(this.STALE_TIMEOUT_MS, conn);
        if (recoveredCount > 0) {
          console.log(`[OutboxWorker] Successfully recovered ${recoveredCount} stale PROCESSING events.`);
        }
        await conn.commit();
      } catch (err: any) {
        await conn.rollback();
        console.error(`[OutboxWorker] Error recovering stale events: ${err.message}`);
      } finally {
        conn.release();
      }
    } catch (e: any) {
      console.error('[OutboxWorker] Error during stale recovery cycle:', e.message);
    }

    // Run stale recovery check every 1 minute
    if (this.isRunning) {
      this.recoveryTimeout = setTimeout(() => this.recoverStale(), 60000);
    }
  }
}
