import { AnalyticsWorker } from '../../worker/AnalyticsWorker';
import { AnalyticsReplayWorker } from './AnalyticsReplayWorker';
import { AnalyticsReplayProgressTracker } from './AnalyticsReplayProgressTracker';
import { AnalyticsMetricsService } from '../metrics/AnalyticsMetricsService';
import db from '../../../config/database';

/**
 * AnalyticsReplayService — halts background worker, wipes analytics projections, rebuilds from outbox.
 * RFC-010 Specification
 */
export class AnalyticsReplayService {
  constructor(
    private readonly activeWorker: AnalyticsWorker,
    private readonly replayWorker: AnalyticsReplayWorker,
    private readonly tracker: AnalyticsReplayProgressTracker
  ) {}

  public async triggerReplay(options?: { reset?: boolean }): Promise<void> {
    console.log('🔄 [AnalyticsReplayService] Halting background worker...');
    await this.activeWorker.stop();

    if (options?.reset !== false) {
      console.log('🔄 [AnalyticsReplayService] Resetting analytics projection tables...');
      await db.execute('DELETE FROM analytics_order_facts');
      await db.execute('DELETE FROM analytics_daily_metrics');
      await db.execute('DELETE FROM analytics_shop_metrics');
      await db.execute('DELETE FROM analytics_user_metrics');
      await db.execute('DELETE FROM analytics_events_processed');
    }

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

    console.log(`🔄 [AnalyticsReplayService] Replaying ${events.length} events...`);

    this.replayWorker.executeReplay(events, () => {
      console.log('🔄 [AnalyticsReplayService] Replay complete. Restarting worker...');
      this.activeWorker.start();
    }).catch(err => {
      this.tracker.fail(err.message);
      console.error('🚨 [AnalyticsReplayService] Replay failed:', err.message);
      this.activeWorker.start();
    });
  }
}
