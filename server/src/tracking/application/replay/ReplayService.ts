import { ReplayRepository, ReplayOptions } from '../../infrastructure/replay/ReplayRepository';
import { ReplayProgressTracker, ReplayProgress } from './ReplayProgressTracker';
import { ReplayWorker } from './ReplayWorker';
import { ProjectionWorker } from '../../worker/ProjectionWorker';
import { SqlOrderLifecycleProjectionRepository } from '../../infrastructure/repositories/SqlOrderLifecycleProjectionRepository';
import { SqlTimelineEventRepository } from '../../infrastructure/repositories/SqlTimelineEventRepository';
import { SqlProcessedEventsRepository } from '../../infrastructure/repositories/SqlProcessedEventsRepository';
import { ProjectionEventDispatcher } from '../dispatcher/ProjectionEventDispatcher';
import db from '../../../config/database';

/**
 * ReplayService — orchestrates complete lifecycle reset and replay processes.
 *
 * RFC-007 Phase 7F Specification
 */
export class ReplayService {
  private readonly tracker = new ReplayProgressTracker();
  private readonly replayWorker: ReplayWorker;

  constructor(
    private readonly replayRepo: ReplayRepository,
    private readonly projRepo: SqlOrderLifecycleProjectionRepository,
    private readonly timelineRepo: SqlTimelineEventRepository,
    private readonly processedEventsRepo: SqlProcessedEventsRepository,
    dispatcher: ProjectionEventDispatcher,
    private readonly worker?: ProjectionWorker
  ) {
    this.replayWorker = new ReplayWorker(dispatcher, this.tracker);
  }

  /**
   * Triggers the complete replay rebuilding lifecycle:
   * 1. Stops the projection worker.
   * 2. Clears projection state tables (optional).
   * 3. Loads event log sequence.
   * 4. Dispatches events in chunks.
   * 5. Resumes projection worker on completion.
   */
  public async triggerReplay(
    options: ReplayOptions & { reset?: boolean; replayDlq?: boolean }
  ): Promise<ReplayProgress> {
    // 1. Stop background worker if active
    let wasRunning = false;
    if (this.worker && this.worker.getState() === 'RUNNING') {
      wasRunning = true;
      await this.worker.stop();
    }

    try {
      // 2. Perform optional tables reset
      if (options.reset) {
        await this.resetProjections({ aggregateId: options.aggregateId });
      }

      // 3. Load target event stream
      const events = options.replayDlq
        ? await this.replayRepo.getDlqEvents()
        : await this.replayRepo.getEventsForReplay(options);

      // Start asynchronous replay in background (non-blocking)
      // This allows the caller to get an immediate status response while replay runs.
      this.replayWorker.executeReplay(events).finally(async () => {
        // 5. Resume background worker if it was running previously
        if (wasRunning && this.worker) {
          await this.worker.start();
        }
      });

      return this.tracker.getProgress();
    } catch (err: any) {
      // Resume worker on fatal setup failure
      if (wasRunning && this.worker) {
        await this.worker.start();
      }
      throw err;
    }
  }

  public pauseReplay(): ReplayProgress {
    this.replayWorker.pause();
    return this.tracker.getProgress();
  }

  public resumeReplay(): ReplayProgress {
    this.replayWorker.resume();
    return this.tracker.getProgress();
  }

  public cancelReplay(): ReplayProgress {
    this.replayWorker.cancel();
    return this.tracker.getProgress();
  }

  public getReplayStatus(): ReplayProgress {
    return this.tracker.getProgress();
  }

  public isReplayActive(): boolean {
    return this.tracker.getProgress().status === 'running';
  }

  /**
   * Resets database state tables for clean rebuild cycles.
   */
  private async resetProjections(opts: { aggregateId?: string }): Promise<void> {
    if (opts.aggregateId) {
      const orderId = Number(opts.aggregateId);
      if (!isNaN(orderId) && orderId > 0) {
        // Delete only data corresponding to this aggregate
        await db.execute('DELETE FROM order_lifecycle_projections WHERE order_id = ?', [orderId]);
        await db.execute('DELETE FROM order_lifecycle_timeline_events WHERE order_id = ?', [orderId]);
        // Remove processed events associated with this aggregate
        await db.execute(
          `DELETE FROM processed_events 
           WHERE event_id IN (
             SELECT event_id FROM outbox_events WHERE aggregate_id = ?
           )`,
          [opts.aggregateId]
        );
      }
    } else {
      // Absolute Reset — purge all projections, timelines, and markers
      await this.projRepo.deleteAll();
      await this.timelineRepo.deleteAll();
      await this.processedEventsRepo.deleteAll();
      await db.execute('DELETE FROM dead_letter_events');
    }
  }
}
