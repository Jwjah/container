import { IShopAnalyticsRepository } from '../../interfaces/IShopAnalyticsRepository';
import { ShopAnalytics } from '../../domain/entities/ShopAnalytics';
import db from '../../../config/database';

/**
 * SqlShopAnalyticsRepository — persists per-shop rolling analytics to analytics_shop_metrics.
 * Uses optimistic locking via version column.
 * RFC-010 Specification
 */
export class SqlShopAnalyticsRepository implements IShopAnalyticsRepository {
  private toEntity(row: any): ShopAnalytics {
    return new ShopAnalytics(
      row.id,
      Number(row.shop_id),
      Number(row.total_orders),
      Number(row.completed_orders),
      Number(row.cancelled_orders),
      Number(row.total_revenue),
      Number(row.avg_completion_time_secs),
      Number(row.avg_delivery_time_secs),
      Number(row.printer_utilization_pct),
      Number(row.queue_utilization_pct),
      Number(row.low_stock_events),
      Number(row.version),
      new Date(row.created_at),
      new Date(row.updated_at)
    );
  }

  async findByShopId(shopId: number, connection?: any): Promise<ShopAnalytics | null> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      'SELECT * FROM analytics_shop_metrics WHERE shop_id = ? LIMIT 1',
      [shopId]
    );
    const arr = rows as any[];
    return arr.length > 0 ? this.toEntity(arr[0]) : null;
  }

  async findAll(connection?: any): Promise<ShopAnalytics[]> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      'SELECT * FROM analytics_shop_metrics ORDER BY total_revenue DESC'
    );
    return (rows as any[]).map(r => this.toEntity(r));
  }

  async upsert(analytics: ShopAnalytics, connection?: any): Promise<ShopAnalytics> {
    const executor = connection || db;
    const existing = await this.findByShopId(analytics.shopId, executor);

    if (!existing) {
      await executor.execute(
        `INSERT INTO analytics_shop_metrics
          (shop_id, total_orders, completed_orders, cancelled_orders, total_revenue,
           avg_completion_time_secs, avg_delivery_time_secs, printer_utilization_pct,
           queue_utilization_pct, low_stock_events, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          analytics.shopId, analytics.totalOrders, analytics.completedOrders,
          analytics.cancelledOrders, analytics.totalRevenue, analytics.avgCompletionTimeSecs,
          analytics.avgDeliveryTimeSecs, analytics.printerUtilizationPct,
          analytics.queueUtilizationPct, analytics.lowStockEvents
        ]
      );
      const inserted = await this.findByShopId(analytics.shopId, executor);
      return inserted!;
    } else {
      await executor.execute(
        `UPDATE analytics_shop_metrics SET
          total_orders = ?, completed_orders = ?, cancelled_orders = ?, total_revenue = ?,
          avg_completion_time_secs = ?, avg_delivery_time_secs = ?,
          printer_utilization_pct = ?, queue_utilization_pct = ?, low_stock_events = ?,
          version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE shop_id = ? AND version = ?`,
        [
          analytics.totalOrders, analytics.completedOrders, analytics.cancelledOrders,
          analytics.totalRevenue, analytics.avgCompletionTimeSecs, analytics.avgDeliveryTimeSecs,
          analytics.printerUtilizationPct, analytics.queueUtilizationPct, analytics.lowStockEvents,
          analytics.shopId, existing.version
        ]
      );
      const updated = await this.findByShopId(analytics.shopId, executor);
      return updated!;
    }
  }

  async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    await executor.execute('DELETE FROM analytics_shop_metrics');
  }
}
