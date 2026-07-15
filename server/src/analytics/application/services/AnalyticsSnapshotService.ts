import { IAnalyticsMetricRepository } from '../../interfaces/IAnalyticsMetricRepository';
import { IShopAnalyticsRepository } from '../../interfaces/IShopAnalyticsRepository';
import { IOrderFactRepository } from '../../interfaces/IOrderFactRepository';
import { AnalyticsSnapshot } from '../../domain/entities/AnalyticsSnapshot';
import db from '../../../config/database';

/**
 * AnalyticsSnapshotService — creates and reads analytics point-in-time snapshots for fast replay recovery.
 * RFC-010 Specification
 */
export class AnalyticsSnapshotService {
  constructor(
    private readonly metricRepo: IAnalyticsMetricRepository,
    private readonly shopRepo: IShopAnalyticsRepository,
    private readonly factRepo: IOrderFactRepository
  ) {}

  public async createSnapshot(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const metrics = await this.metricRepo.findRange(d30, today);
    const shops = await this.shopRepo.findAll();

    const totalOrders = metrics.reduce((s, m) => s + m.totalOrders, 0);
    const totalRevenue = metrics.reduce((s, m) => s + m.totalRevenue, 0);
    const totalCompleted = metrics.reduce((s, m) => s + m.completedOrders, 0);
    const totalCancelled = metrics.reduce((s, m) => s + m.cancelledOrders, 0);

    // Get the last processed outbox event sequence
    const [seqRows] = await db.execute(
      'SELECT MAX(CAST(SUBSTR(event_id, -8) AS INTEGER)) AS last_seq FROM analytics_events_processed'
    );
    const lastSeq = Number((seqRows as any[])[0]?.last_seq ?? 0);

    const stateData = JSON.stringify({ metrics, shops, capturedAt: new Date().toISOString() });

    await db.execute(
      `INSERT OR REPLACE INTO analytics_snapshots
        (snapshot_date, total_orders, total_revenue, total_completed, total_cancelled, last_event_sequence, state_data)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [today, totalOrders, totalRevenue, totalCompleted, totalCancelled, lastSeq, stateData]
    );

    console.log(`📸 [AnalyticsSnapshotService] Snapshot created for ${today}`);
  }

  public async getLatestSnapshot(): Promise<AnalyticsSnapshot | null> {
    const [rows] = await db.execute(
      'SELECT * FROM analytics_snapshots ORDER BY snapshot_date DESC LIMIT 1'
    );
    const arr = rows as any[];
    if (arr.length === 0) return null;
    const r = arr[0];
    return new AnalyticsSnapshot(
      r.id,
      r.snapshot_date,
      Number(r.total_orders),
      Number(r.total_revenue),
      Number(r.total_completed),
      Number(r.total_cancelled),
      Number(r.last_event_sequence),
      r.state_data,
      new Date(r.created_at)
    );
  }
}
