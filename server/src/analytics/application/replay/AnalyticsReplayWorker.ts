import { DomainEvent } from '../../../tracking/domain/events/DomainEvent';
import { AnalyticsEventDispatcher } from '../../worker/AnalyticsEventDispatcher';
import { AnalyticsReplayProgressTracker } from './AnalyticsReplayProgressTracker';
import { AnalyticsMetricsService } from '../metrics/AnalyticsMetricsService';
import db from '../../../config/database';

/**
 * AnalyticsReplayWorker — chunked execution of historical analytics event streams.
 * RFC-010 Specification
 */
export class AnalyticsReplayWorker {
  constructor(
    private readonly dispatcher: AnalyticsEventDispatcher,
    private readonly tracker: AnalyticsReplayProgressTracker
  ) {}

  public async executeReplay(events: DomainEvent[], onComplete: () => void): Promise<void> {
    if (events.length === 0) {
      this.tracker.complete();
      onComplete();
      return;
    }

    this.tracker.start(events.length);
    let index = 0;
    const chunkSize = 20;

    const processNextChunk = async (): Promise<void> => {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        const limit = Math.min(index + chunkSize, events.length);
        for (let i = index; i < limit; i++) {
          await this.dispatcher.dispatch(events[i], conn);
          AnalyticsMetricsService.replayCount++;
        }

        await conn.commit();
        const done = limit - index;
        index = limit;
        this.tracker.increment(done);

        if (index < events.length) {
          setTimeout(() => {
            processNextChunk().catch(err => {
              this.tracker.fail(err.message);
              console.error('🚨 [AnalyticsReplayWorker] Chunk failure:', err.message);
            });
          }, 5);
        } else {
          console.log(`✨ [AnalyticsReplayWorker] Replay complete. Events processed: ${events.length}`);
          this.tracker.complete();
          onComplete();
        }
      } catch (err: any) {
        await conn.rollback();
        this.tracker.fail(err.message);
        console.error('🚨 [AnalyticsReplayWorker] Replay chunk rollback:', err.message);
      } finally {
        conn.release();
      }
    };

    await processNextChunk();
  }
}
