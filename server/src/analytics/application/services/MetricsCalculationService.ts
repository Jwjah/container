import { IAnalyticsMetricRepository } from '../../interfaces/IAnalyticsMetricRepository';
import { IShopAnalyticsRepository } from '../../interfaces/IShopAnalyticsRepository';
import { IOrderFactRepository } from '../../interfaces/IOrderFactRepository';

/**
 * MetricsCalculationService — derives computed metrics from stored facts and aggregates.
 * RFC-010 Specification
 */
export class MetricsCalculationService {
  constructor(
    private readonly metricRepo: IAnalyticsMetricRepository,
    private readonly shopRepo: IShopAnalyticsRepository,
    private readonly factRepo: IOrderFactRepository
  ) {}

  public async getPlatformSummary(): Promise<{
    totalOrders: number;
    totalRevenue: number;
    successRate: number;
    cancellationRate: number;
    avgCompletionTimeSecs: number;
    avgDeliveryTimeSecs: number;
  }> {
    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const metrics = await this.metricRepo.findRange(thirtyDaysAgo, today);

    if (metrics.length === 0) {
      return { totalOrders: 0, totalRevenue: 0, successRate: 0, cancellationRate: 0, avgCompletionTimeSecs: 0, avgDeliveryTimeSecs: 0 };
    }

    const totalOrders = metrics.reduce((s, m) => s + m.totalOrders, 0);
    const totalRevenue = metrics.reduce((s, m) => s + m.totalRevenue, 0);
    const totalCompleted = metrics.reduce((s, m) => s + m.completedOrders, 0);
    const totalCancelled = metrics.reduce((s, m) => s + m.cancelledOrders, 0);
    const avgCompletion = metrics.reduce((s, m) => s + m.avgCompletionTimeSecs, 0) / metrics.length;
    const avgDelivery = metrics.reduce((s, m) => s + m.avgDeliveryTimeSecs, 0) / metrics.length;

    return {
      totalOrders,
      totalRevenue,
      successRate: totalOrders > 0 ? totalCompleted / totalOrders : 0,
      cancellationRate: totalOrders > 0 ? totalCancelled / totalOrders : 0,
      avgCompletionTimeSecs: avgCompletion,
      avgDeliveryTimeSecs: avgDelivery
    };
  }

  public async getRevenueByDay(days = 30): Promise<{ date: string; revenue: number }[]> {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const metrics = await this.metricRepo.findRange(startDate, today);
    return metrics.map(m => ({ date: m.date, revenue: m.totalRevenue }));
  }

  public async getOrderCountByDay(days = 30): Promise<{ date: string; count: number }[]> {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const metrics = await this.metricRepo.findRange(startDate, today);
    return metrics.map(m => ({ date: m.date, count: m.totalOrders }));
  }
}
