import { IOrderFactRepository } from '../../interfaces/IOrderFactRepository';
import { IAnalyticsMetricRepository } from '../../interfaces/IAnalyticsMetricRepository';
import { IShopAnalyticsRepository } from '../../interfaces/IShopAnalyticsRepository';
import { IUserAnalyticsRepository } from '../../interfaces/IUserAnalyticsRepository';
import { OrderFact } from '../../domain/entities/OrderFact';
import { AnalyticsMetric } from '../../domain/entities/AnalyticsMetric';
import { ShopAnalytics } from '../../domain/entities/ShopAnalytics';
import { UserAnalytics } from '../../domain/entities/UserAnalytics';

/**
 * AnalyticsAggregationService — recomputes daily, shop, and user aggregates from order facts.
 * Called after each event-driven update.
 * RFC-010 Specification
 */
export class AnalyticsAggregationService {
  constructor(
    private readonly factRepo: IOrderFactRepository,
    private readonly metricRepo: IAnalyticsMetricRepository,
    private readonly shopRepo: IShopAnalyticsRepository,
    private readonly userRepo: IUserAnalyticsRepository
  ) {}

  /**
   * Recomputes daily platform metrics for the given date.
   */
  public async aggregateDailyMetrics(date: string, connection?: any): Promise<void> {
    const [start, end] = [date, date];
    const facts = await this.factRepo.findByDateRange(start, end, connection);

    const total = facts.length;
    const completed = facts.filter(f => f.isCompleted).length;
    const cancelled = facts.filter(f => f.isCancelled).length;
    const revenue = facts.reduce((s, f) => s + f.revenue, 0);

    const completedWithTime = facts.filter(f => f.completionTimeSecs !== null);
    const avgCompletion = completedWithTime.length > 0
      ? completedWithTime.reduce((s, f) => s + (f.completionTimeSecs ?? 0), 0) / completedWithTime.length
      : 0;

    const deliveredWithTime = facts.filter(f => f.deliveryTimeSecs !== null);
    const avgDelivery = deliveredWithTime.length > 0
      ? deliveredWithTime.reduce((s, f) => s + (f.deliveryTimeSecs ?? 0), 0) / deliveredWithTime.length
      : 0;

    const existing = await this.metricRepo.findByDate(date, connection);
    const lowStock = existing?.lowStockEvents ?? 0;

    const metric = new AnalyticsMetric(
      existing?.id ?? null,
      date,
      total,
      revenue,
      completed,
      cancelled,
      avgCompletion,
      avgDelivery,
      lowStock,
      existing?.version ?? 1
    );

    await this.metricRepo.upsert(metric, connection);
  }

  /**
   * Recomputes shop-level rolling analytics from all stored order facts.
   */
  public async aggregateShopMetrics(shopId: number, connection?: any): Promise<void> {
    const facts = await this.factRepo.findByShopId(shopId, 10000, connection);

    const total = facts.length;
    const completed = facts.filter(f => f.isCompleted).length;
    const cancelled = facts.filter(f => f.isCancelled).length;
    const revenue = facts.reduce((s, f) => s + f.revenue, 0);

    const completedWithTime = facts.filter(f => f.completionTimeSecs !== null);
    const avgCompletion = completedWithTime.length > 0
      ? completedWithTime.reduce((s, f) => s + (f.completionTimeSecs ?? 0), 0) / completedWithTime.length
      : 0;

    const deliveredWithTime = facts.filter(f => f.deliveryTimeSecs !== null);
    const avgDelivery = deliveredWithTime.length > 0
      ? deliveredWithTime.reduce((s, f) => s + (f.deliveryTimeSecs ?? 0), 0) / deliveredWithTime.length
      : 0;

    const existing = await this.shopRepo.findByShopId(shopId, connection);
    const printerUtil = existing?.printerUtilizationPct ?? 0;
    const queueUtil = existing?.queueUtilizationPct ?? 0;
    const lowStock = existing?.lowStockEvents ?? 0;

    const analytics = new ShopAnalytics(
      existing?.id ?? null,
      shopId,
      total,
      completed,
      cancelled,
      revenue,
      avgCompletion,
      avgDelivery,
      printerUtil,
      queueUtil,
      lowStock,
      existing?.version ?? 1
    );

    await this.shopRepo.upsert(analytics, connection);
  }

  /**
   * Recomputes user-level activity analytics from all stored order facts.
   */
  public async aggregateUserMetrics(userId: number, connection?: any): Promise<void> {
    const facts = await this.factRepo.findByUserId(userId, 10000, connection);

    const total = facts.length;
    const completed = facts.filter(f => f.isCompleted).length;
    const cancelled = facts.filter(f => f.isCancelled).length;
    const spend = facts.reduce((s, f) => s + f.revenue, 0);
    const avgOrderValue = total > 0 ? spend / total : 0;
    const sorted = facts.slice().sort((a, b) => b.orderCreatedAt.getTime() - a.orderCreatedAt.getTime());
    const lastOrderAt = sorted.length > 0 ? sorted[0].orderCreatedAt : null;

    const existing = await this.userRepo.findByUserId(userId, connection);

    const analytics = new UserAnalytics(
      existing?.id ?? null,
      userId,
      total,
      completed,
      cancelled,
      spend,
      avgOrderValue,
      lastOrderAt,
      existing?.version ?? 1
    );

    await this.userRepo.upsert(analytics, connection);
  }
}
