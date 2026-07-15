import { IUserAnalyticsRepository } from '../../interfaces/IUserAnalyticsRepository';
import { UserAnalytics } from '../../domain/entities/UserAnalytics';
import db from '../../../config/database';

/**
 * SqlUserAnalyticsRepository — persists per-user activity analytics to analytics_user_metrics.
 * RFC-010 Specification
 */
export class SqlUserAnalyticsRepository implements IUserAnalyticsRepository {
  private toEntity(row: any): UserAnalytics {
    return new UserAnalytics(
      row.id,
      Number(row.user_id),
      Number(row.total_orders),
      Number(row.completed_orders),
      Number(row.cancelled_orders),
      Number(row.total_spend),
      Number(row.avg_order_value),
      row.last_order_at ? new Date(row.last_order_at) : null,
      Number(row.version),
      new Date(row.created_at),
      new Date(row.updated_at)
    );
  }

  async findByUserId(userId: number, connection?: any): Promise<UserAnalytics | null> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      'SELECT * FROM analytics_user_metrics WHERE user_id = ? LIMIT 1',
      [userId]
    );
    const arr = rows as any[];
    return arr.length > 0 ? this.toEntity(arr[0]) : null;
  }

  async upsert(analytics: UserAnalytics, connection?: any): Promise<UserAnalytics> {
    const executor = connection || db;
    const existing = await this.findByUserId(analytics.userId, executor);
    const lastOrderAt = analytics.lastOrderAt ? analytics.lastOrderAt.toISOString() : null;

    if (!existing) {
      await executor.execute(
        `INSERT INTO analytics_user_metrics
          (user_id, total_orders, completed_orders, cancelled_orders,
           total_spend, avg_order_value, last_order_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          analytics.userId, analytics.totalOrders, analytics.completedOrders,
          analytics.cancelledOrders, analytics.totalSpend, analytics.avgOrderValue, lastOrderAt
        ]
      );
    } else {
      await executor.execute(
        `UPDATE analytics_user_metrics SET
          total_orders = ?, completed_orders = ?, cancelled_orders = ?,
          total_spend = ?, avg_order_value = ?, last_order_at = ?,
          version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND version = ?`,
        [
          analytics.totalOrders, analytics.completedOrders, analytics.cancelledOrders,
          analytics.totalSpend, analytics.avgOrderValue, lastOrderAt,
          analytics.userId, existing.version
        ]
      );
    }
    const saved = await this.findByUserId(analytics.userId, executor);
    return saved!;
  }

  async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    await executor.execute('DELETE FROM analytics_user_metrics');
  }
}
