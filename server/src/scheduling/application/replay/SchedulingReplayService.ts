import { ReplayRepository } from '../../infrastructure/replay/ReplayRepository';
import { SchedulingEventWorker } from '../../worker/SchedulingEventWorker';
import { SchedulingReplayWorker } from './SchedulingReplayWorker';
import { ReplayProgressTracker } from './ReplayProgressTracker';

/**
 * SchedulingReplayService — orchestrates worker stops, db wipes, and replay execution.
 *
 * RFC-008 Part 10 Specification
 */
export class SchedulingReplayService {
  constructor(
    private readonly replayRepo: ReplayRepository,
    private readonly activeWorker: SchedulingEventWorker,
    private readonly replayWorker: SchedulingReplayWorker,
    private readonly tracker: ReplayProgressTracker
  ) {}

  /**
   * Triggers the full database replay projection sequence.
   */
  public async triggerReplay(options?: {
    reset?: boolean;
    startDate?: Date;
    endDate?: Date;
    aggregateId?: string;
  }): Promise<void> {
    console.log('🔄 [ReplayService] Initiating replay projection. Stopping background worker...');
    
    // 1. Terminate background worker loop
    await this.activeWorker.stop();

    // 2. Perform DB reset if requested
    if (options?.reset !== false) {
      console.log('🔄 [ReplayService] Resetting scheduling projection database tables...');
      await this.replayRepo.resetSchedulingTables();
    }

    // 3. Load historical event stream logs
    const events = await this.replayRepo.getEvents({
      startDate: options?.startDate,
      endDate: options?.endDate,
      aggregateId: options?.aggregateId
    });

    console.log(`🔄 [ReplayService] Found ${events.length} historical events for replay.`);

    // 4. Trigger replay worker (asynchronous completion)
    this.replayWorker.executeReplay(events, () => {
      // 5. Completion callback: resume background outbox processing worker
      console.log('🔄 [ReplayService] Replay completed. Restarting background worker...');
      this.activeWorker.start();
    }).catch(err => {
      this.tracker.fail(err.message);
      console.error('🚨 [ReplayService] Replay failed with error:', err.message);
      // Try to recover worker anyway
      this.activeWorker.start();
    });
  }
}
