import { DomainEvent } from '../../../tracking/domain/events/DomainEvent';
import { NotificationEventDispatcher } from '../../worker/NotificationEventDispatcher';
import { ReplayProgressTracker } from './ReplayProgressTracker';
import { NotificationMetricsService } from '../metrics/NotificationMetricsService';
import db from '../../../config/database';

/**
 * NotificationReplayWorker — handles chunked execution of historical event streams.
 *
 * RFC-009 Specification
 */
export class NotificationReplayWorker {
  constructor(
    private readonly dispatcher: NotificationEventDispatcher,
    private readonly tracker: ReplayProgressTracker
  ) {}

  /**
   * Processes historical events stream asynchronously in batches.
   */
  public async executeReplay(events: DomainEvent[], onComplete: () => void): Promise<void> {
    if (events.length === 0) {
      this.tracker.complete();
      onComplete();
      return;
    }

    this.tracker.start(events.length);
    let index = 0;
    const chunkSize = 20;

    const processNextChunk = async () => {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        const limit = Math.min(index + chunkSize, events.length);
        for (let i = index; i < limit; i++) {
          const event = events[i];
          // Dispatch event to rebuild notifications projection state
          await this.dispatcher.dispatch(event, conn);
          NotificationMetricsService.replayEventsProcessedCount++;
        }

        await conn.commit();
        const processedThisChunk = limit - index;
        index = limit;
        this.tracker.increment(processedThisChunk);

        if (index < events.length) {
          // Yield execution thread
          setTimeout(() => {
            processNextChunk().catch(err => {
              this.tracker.fail(err.message);
              console.error('🚨 [NotificationReplayWorker] Chunk failure:', err.message);
            });
          }, 5);
        } else {
          console.log(`✨ [NotificationReplayWorker] Replay rebuild completed. Total events processed: ${events.length}`);
          this.tracker.complete();
          onComplete();
        }
      } catch (err: any) {
        await conn.rollback();
        this.tracker.fail(err.message);
        console.error('🚨 [NotificationReplayWorker] Replay chunk rollback:', err.message);
      } finally {
        conn.release();
      }
    };

    // Run first chunk
    await processNextChunk();
  }
}
