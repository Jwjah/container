import { AnalyticsEventSource } from '../../worker/AnalyticsEventSource';
import db from '../../../config/database';

/**
 * AnalyticsMetricsService — Prometheus metrics for the analytics bounded context.
 * RFC-010 Specification
 */
export class AnalyticsMetricsService {
  // Static counters incremented by handlers and workers
  public static eventsProcessedCount = 0;
  public static replayCount = 0;
  public static processingDurationMs = 0;
  public static lastProcessedEventId: string | null = null;

  constructor(private readonly source: AnalyticsEventSource) {}

  public async getMetricsString(): Promise<string> {
    const [orderRows] = await db.execute('SELECT COUNT(*) AS total FROM analytics_order_facts');
    const orderCount = Number((orderRows as any[])[0]?.total ?? 0);

    const [dailyRows] = await db.execute('SELECT COUNT(*) AS total FROM analytics_daily_metrics');
    const dailyCount = Number((dailyRows as any[])[0]?.total ?? 0);

    const [shopRows] = await db.execute('SELECT COUNT(*) AS total FROM analytics_shop_metrics');
    const shopCount = Number((shopRows as any[])[0]?.total ?? 0);

    const lag = await this.source.peekLag();
    const processingDurationSecs = AnalyticsMetricsService.processingDurationMs / 1000;
    const lastEvent = AnalyticsMetricsService.lastProcessedEventId ?? 'none';

    return [
      '# HELP analytics_events_processed_total Total analytics events consumed from outbox.',
      '# TYPE analytics_events_processed_total counter',
      `analytics_events_processed_total ${AnalyticsMetricsService.eventsProcessedCount}`,
      '',
      '# HELP analytics_replay_total Total events replayed into analytics projections.',
      '# TYPE analytics_replay_total counter',
      `analytics_replay_total ${AnalyticsMetricsService.replayCount}`,
      '',
      '# HELP analytics_processing_duration_seconds Duration of last processing batch.',
      '# TYPE analytics_processing_duration_seconds gauge',
      `analytics_processing_duration_seconds ${processingDurationSecs.toFixed(4)}`,
      '',
      '# HELP analytics_worker_lag Outstanding unprocessed outbox events.',
      '# TYPE analytics_worker_lag gauge',
      `analytics_worker_lag ${lag}`,
      '',
      '# HELP analytics_order_facts_total Total order fact records stored.',
      '# TYPE analytics_order_facts_total gauge',
      `analytics_order_facts_total ${orderCount}`,
      '',
      '# HELP analytics_daily_metrics_days_stored Days of daily metrics stored.',
      '# TYPE analytics_daily_metrics_days_stored gauge',
      `analytics_daily_metrics_days_stored ${dailyCount}`,
      '',
      '# HELP analytics_shop_projections_total Shop analytics projections stored.',
      '# TYPE analytics_shop_projections_total gauge',
      `analytics_shop_projections_total ${shopCount}`,
      '',
      `# analytics_last_processed_event ${lastEvent}`
    ].join('\n');
  }
}
