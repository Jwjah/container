import { NotificationEventWorker } from '../../worker/NotificationEventWorker';
import { NotificationReplayWorker } from './NotificationReplayWorker';
import { ReplayProgressTracker } from './ReplayProgressTracker';
import db from '../../../config/database';

/**
 * NotificationReplayService — halts background processor worker, resets logs tables, and executes rebuilds.
 *
 * RFC-009 Specification
 */
export class NotificationReplayService {
  constructor(
    private readonly activeWorker: NotificationEventWorker,
    private readonly replayWorker: NotificationReplayWorker,
    private readonly tracker: ReplayProgressTracker
  ) {}

  /**
   * Resets active projections and triggers a full historical events outbox replay loop.
   */
  public async triggerReplay(options?: { reset?: boolean }): Promise<void> {
    console.log('🔄 [NotificationReplayService] Halting background worker...');
    await this.activeWorker.stop();

    if (options?.reset !== false) {
      console.log('🔄 [NotificationReplayService] Resetting notifications historic tables...');
      await db.execute('DELETE FROM notification_delivery_attempts');
      await db.execute('DELETE FROM notifications');
      await db.execute('DELETE FROM processed_notification_events');
    }

    // Load historical events
    const [rows] = await db.execute('SELECT * FROM outbox_events ORDER BY id ASC');
    const events = (rows as any[]).map(row => {
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

    console.log(`🔄 [NotificationReplayService] Replaying ${events.length} outbox log events...`);

    this.replayWorker.executeReplay(events, () => {
      console.log('🔄 [NotificationReplayService] Replay complete. Restarting background worker...');
      this.activeWorker.start();
    }).catch(err => {
      this.tracker.fail(err.message);
      console.error('🚨 [NotificationReplayService] Replay failed:', err.message);
      this.activeWorker.start();
    });
  }
}
