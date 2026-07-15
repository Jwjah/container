import { ReplayRepository } from '../../infrastructure/replay/ReplayRepository';
import { SchedulingEventWorker } from '../../worker/SchedulingEventWorker';
import { SchedulingReplayWorker } from './SchedulingReplayWorker';
import { ReplayProgressTracker } from './ReplayProgressTracker';
import { SchedulingSnapshotService } from '../services/SchedulingSnapshotService';
import db from '../../../config/database';

/**
 * SchedulingReplayService — orchestrates worker stops, db wipes, and replay execution.
 *
 * RFC-008 Part 10 & Refinement 4 Specification
 */
export class SchedulingReplayService {
  public static snapshotReplaysCount = 0;

  constructor(
    private readonly replayRepo: ReplayRepository,
    private readonly activeWorker: SchedulingEventWorker,
    private readonly replayWorker: SchedulingReplayWorker,
    private readonly tracker: ReplayProgressTracker,
    private readonly snapshotService: SchedulingSnapshotService
  ) {}

  /**
   * Triggers the database replay projection sequence, leveraging snapshot checkpoints if available.
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

    let eventsToReplay: any[] = [];
    let restoredFromSnapshot = false;

    // 2. Perform Snapshot Restoration Check (if reset not explicitly forced to true)
    if (options?.reset === false) {
      try {
        const [snapshotRows] = await db.execute(
          'SELECT * FROM scheduling_snapshots ORDER BY created_at DESC LIMIT 1'
        );
        const latest = (snapshotRows as any[])[0];

        if (latest) {
          console.log(`📸 [ReplayService] Latest snapshot detected for shop ${latest.shop_id} at sequence ${latest.last_event_sequence}. Restoring...`);
          await this.snapshotService.restoreSnapshot(latest.shop_id);
          
          // Fetch remaining outbox events following the snapshot sequence checkpoint
          const remainingQuery = 'SELECT * FROM outbox_events WHERE id > ? ORDER BY id ASC';
          const [remainingRows] = await db.execute(remainingQuery, [latest.last_event_sequence]);
          
          // Map to DomainEvents
          eventsToReplay = (remainingRows as any[]).map(row => {
            let payloadObj: any = {};
            try {
              payloadObj = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
            } catch {
              payloadObj = {};
            }
            return {
              eventId: row.event_id,
              eventType: row.event_type,
              eventVersion: row.event_version || 1,
              occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at),
              correlationId: row.correlation_id || '',
              causationId: payloadObj.causationId || row.event_id,
              payload: payloadObj
            };
          });

          restoredFromSnapshot = true;
          SchedulingReplayService.snapshotReplaysCount++;
        }
      } catch (err: any) {
        console.warn('⚠️ [ReplayService] Snapshot restoration failed, falling back to full replay. Error:', err.message);
      }
    }

    // 3. Fallback: Full Replay Rebuild
    if (!restoredFromSnapshot) {
      console.log('🔄 [ReplayService] Wiping scheduling tables and performing full event replay...');
      await this.replayRepo.resetSchedulingTables();
      eventsToReplay = await this.replayRepo.getEvents({
        startDate: options?.startDate,
        endDate: options?.endDate,
        aggregateId: options?.aggregateId
      });
    }

    console.log(`🔄 [ReplayService] Replaying ${eventsToReplay.length} events...`);

    // 4. Trigger replay worker (asynchronous completion)
    this.replayWorker.executeReplay(eventsToReplay, () => {
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
