import { DomainEvent } from '../../../tracking/domain/events/DomainEvent';
import { SchedulingEventDispatcher } from '../events/SchedulingEventDispatcher';
import { ReplayProgressTracker } from './ReplayProgressTracker';
import db from '../../../config/database';

/**
 * SchedulingReplayWorker — handles async sequential reprocessing of event logs in non-blocking chunks.
 *
 * RFC-008 Part 10 Specification
 */
export class SchedulingReplayWorker {
  constructor(
    private readonly dispatcher: SchedulingEventDispatcher,
    private readonly tracker: ReplayProgressTracker
  ) {}

  /**
   * Replays an array of DomainEvents sequentially in non-blocking chunks.
   */
  public async executeReplay(events: DomainEvent[], onComplete?: () => void): Promise<void> {
    if (events.length === 0) {
      this.tracker.start(0);
      this.tracker.update(0);
      if (onComplete) onComplete();
      return;
    }

    this.tracker.start(events.length);
    let index = 0;
    const chunkSize = 20;

    const processNextChunk = async () => {
      const limit = Math.min(index + chunkSize, events.length);
      
      for (; index < limit; index++) {
        const event = events[index];
        const conn = await db.getConnection();
        try {
          await conn.beginTransaction();

          // Dispatch event to context handlers
          await this.dispatcher.dispatch(event, conn);

          // Write processed marker to prevent active worker from picking it up
          await conn.execute('INSERT OR IGNORE INTO scheduling_processed_events (event_id) VALUES (?)', [event.eventId]);

          await conn.commit();
        } catch (err: any) {
          await conn.rollback();
          // Log error and continue or fail depending on strictness. Here we continue to allow full projection rebuilds.
          console.error(`[ReplayWorker] Error processing event ${event.eventId} during replay:`, err.message);
        } finally {
          conn.release();
        }
      }

      this.tracker.update(index);

      if (index < events.length) {
        // Yield execution to node event loop before next chunk
        setTimeout(processNextChunk, 0);
      } else {
        console.log(`✨ [ReplayWorker] Replay rebuild completed. Total events processed: ${events.length}`);
        if (onComplete) onComplete();
      }
    };

    // Trigger first chunk
    processNextChunk();
  }
}
