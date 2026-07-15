import { IAnalyticsMetricRepository } from '../../interfaces/IAnalyticsMetricRepository';
import { AnalyticsMetric } from '../../domain/entities/AnalyticsMetric';
import db from '../../../config/database';

/**
 * SqlAnalyticsMetricRepository — persists daily platform analytics to analytics_daily_metrics.
 * Uses optimistic locking via version column.
 * RFC-010 Specification
 */
export class SqlAnalyticsMetricRepository implements IAnalyticsMetricRepository {
  private toEntity(row: any): AnalyticsMetric {
    return new AnalyticsMetric(
      row.id,
      row.date,
      Number(row.total_orders),
      Number(row.total_revenue),
      Number(row.completed_orders),
      Number(row.cancelled_orders),
      Number(row.avg_completion_time_secs),
      Number(row.avg_delivery_time_secs),
      Number(row.low_stock_events),
      Number(row.version),
      new Date(row.created_at),
      new Date(row.updated_at)
    );
  }

  async findByDate(date: string, connection?: any): Promise<AnalyticsMetric | null> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      'SELECT * FROM analytics_daily_metrics WHERE date = ? LIMIT 1',
      [date]
    );
    const arr = rows as any[];
    return arr.length > 0 ? this.toEntity(arr[0]) : null;
  }

  async findRange(startDate: string, endDate: string, connection?: any): Promise<AnalyticsMetric[]> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      'SELECT * FROM analytics_daily_metrics WHERE date >= ? AND date <= ? ORDER BY date ASC',
      [startDate, endDate]
    );
    return (rows as any[]).map(r => this.toEntity(r));
  }

  async upsert(metric: AnalyticsMetric, connection?: any): Promise<AnalyticsMetric> {
    const executor = connection || db;
    const existing = await this.findByDate(metric.date, executor);

    if (!existing) {
      const [result] = await executor.execute(
        `INSERT INTO analytics_daily_metrics
          (date, total_orders, total_revenue, completed_orders, cancelled_orders,
           avg_completion_time_secs, avg_delivery_time_secs, low_stock_events, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          metric.date, metric.totalOrders, metric.totalRevenue, metric.completedOrders,
          metric.cancelledOrders, metric.avgCompletionTimeSecs, metric.avgDeliveryTimeSecs,
          metric.lowStockEvents
        ]
      );
      const inserted = await this.findByDate(metric.date, executor);
      return inserted!;
    } else {
      // Optimistic locking: only update if version matches
      const [result] = await executor.execute(
        `UPDATE analytics_daily_metrics SET
          total_orders = ?, total_revenue = ?, completed_orders = ?, cancelled_orders = ?,
          avg_completion_time_secs = ?, avg_delivery_time_secs = ?, low_stock_events = ?,
          version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE date = ? AND version = ?`,
        [
          metric.totalOrders, metric.totalRevenue, metric.completedOrders, metric.cancelledOrders,
          metric.avgCompletionTimeSecs, metric.avgDeliveryTimeSecs, metric.lowStockEvents,
          metric.date, existing.version
        ]
      );
      const updated = await this.findByDate(metric.date, executor);
      return updated!;
    }
  }

  async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    await executor.execute('DELETE FROM analytics_daily_metrics');
  }
}
