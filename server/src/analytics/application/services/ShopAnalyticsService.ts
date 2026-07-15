import { IShopAnalyticsRepository } from '../../interfaces/IShopAnalyticsRepository';
import { IOrderFactRepository } from '../../interfaces/IOrderFactRepository';
import { ShopAnalytics } from '../../domain/entities/ShopAnalytics';

/**
 * ShopAnalyticsService — read-oriented queries for the shop analytics projection.
 * RFC-010 Specification
 */
export class ShopAnalyticsService {
  constructor(
    private readonly shopRepo: IShopAnalyticsRepository,
    private readonly factRepo: IOrderFactRepository
  ) {}

  public async getShopAnalytics(shopId: number): Promise<ShopAnalytics | null> {
    return this.shopRepo.findByShopId(shopId);
  }

  public async getAllShopsRanked(): Promise<ShopAnalytics[]> {
    return this.shopRepo.findAll();
  }

  public async getShopDailyBreakdown(shopId: number, days = 30): Promise<{
    date: string;
    orders: number;
    revenue: number;
    completed: number;
    cancelled: number;
  }[]> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const facts = await this.factRepo.findByShopId(shopId, 10000);

    const filtered = facts.filter(f => f.date >= startDate && f.date <= today);
    const byDate = new Map<string, { orders: number; revenue: number; completed: number; cancelled: number }>();

    for (const f of filtered) {
      if (!byDate.has(f.date)) {
        byDate.set(f.date, { orders: 0, revenue: 0, completed: 0, cancelled: 0 });
      }
      const day = byDate.get(f.date)!;
      day.orders++;
      day.revenue += f.revenue;
      if (f.isCompleted) day.completed++;
      if (f.isCancelled) day.cancelled++;
    }

    return Array.from(byDate.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  public async getShopPerformance(shopId: number): Promise<{
    successRate: number;
    cancellationRate: number;
    avgCompletionTimeSecs: number;
    avgDeliveryTimeSecs: number;
    printerUtilizationPct: number;
    queueUtilizationPct: number;
    totalRevenue: number;
    totalOrders: number;
  }> {
    const analytics = await this.shopRepo.findByShopId(shopId);
    if (!analytics) {
      return {
        successRate: 0, cancellationRate: 0, avgCompletionTimeSecs: 0,
        avgDeliveryTimeSecs: 0, printerUtilizationPct: 0, queueUtilizationPct: 0,
        totalRevenue: 0, totalOrders: 0
      };
    }
    return {
      successRate: analytics.successRate,
      cancellationRate: analytics.totalOrders > 0 ? analytics.cancelledOrders / analytics.totalOrders : 0,
      avgCompletionTimeSecs: analytics.avgCompletionTimeSecs,
      avgDeliveryTimeSecs: analytics.avgDeliveryTimeSecs,
      printerUtilizationPct: analytics.printerUtilizationPct,
      queueUtilizationPct: analytics.queueUtilizationPct,
      totalRevenue: analytics.totalRevenue,
      totalOrders: analytics.totalOrders
    };
  }
}
