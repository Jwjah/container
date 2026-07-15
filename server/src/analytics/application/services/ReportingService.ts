import { IAnalyticsMetricRepository } from '../../interfaces/IAnalyticsMetricRepository';
import { IShopAnalyticsRepository } from '../../interfaces/IShopAnalyticsRepository';
import { IOrderFactRepository } from '../../interfaces/IOrderFactRepository';

/**
 * ReportingService — produces structured platform-wide and shop-level reports.
 * RFC-010 Specification
 */
export class ReportingService {
  constructor(
    private readonly metricRepo: IAnalyticsMetricRepository,
    private readonly shopRepo: IShopAnalyticsRepository,
    private readonly factRepo: IOrderFactRepository
  ) {}

  public async getPlatformReport(days = 30): Promise<{
    period: { start: string; end: string };
    totalOrders: number;
    totalRevenue: number;
    successRate: number;
    cancellationRate: number;
    avgCompletionTimeSecs: number;
    avgDeliveryTimeSecs: number;
    lowStockEvents: number;
    topShops: { shopId: number; revenue: number; orders: number }[];
    dailyTrend: { date: string; orders: number; revenue: number }[];
  }> {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [metrics, shops] = await Promise.all([
      this.metricRepo.findRange(startDate, today),
      this.shopRepo.findAll()
    ]);

    const totalOrders = metrics.reduce((s, m) => s + m.totalOrders, 0);
    const totalRevenue = metrics.reduce((s, m) => s + m.totalRevenue, 0);
    const totalCompleted = metrics.reduce((s, m) => s + m.completedOrders, 0);
    const totalCancelled = metrics.reduce((s, m) => s + m.cancelledOrders, 0);
    const lowStockEvents = metrics.reduce((s, m) => s + m.lowStockEvents, 0);

    const nonZeroMetrics = metrics.filter(m => m.totalOrders > 0);
    const avgCompletion = nonZeroMetrics.length > 0
      ? nonZeroMetrics.reduce((s, m) => s + m.avgCompletionTimeSecs, 0) / nonZeroMetrics.length
      : 0;
    const avgDelivery = nonZeroMetrics.length > 0
      ? nonZeroMetrics.reduce((s, m) => s + m.avgDeliveryTimeSecs, 0) / nonZeroMetrics.length
      : 0;

    const topShops = shops
      .slice(0, 10)
      .map(s => ({ shopId: s.shopId, revenue: s.totalRevenue, orders: s.totalOrders }));

    const dailyTrend = metrics.map(m => ({ date: m.date, orders: m.totalOrders, revenue: m.totalRevenue }));

    return {
      period: { start: startDate, end: today },
      totalOrders,
      totalRevenue,
      successRate: totalOrders > 0 ? totalCompleted / totalOrders : 0,
      cancellationRate: totalOrders > 0 ? totalCancelled / totalOrders : 0,
      avgCompletionTimeSecs: avgCompletion,
      avgDeliveryTimeSecs: avgDelivery,
      lowStockEvents,
      topShops,
      dailyTrend
    };
  }

  public async getOrdersReport(days = 30): Promise<{
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    pendingOrders: number;
    successRate: number;
    dailyBreakdown: { date: string; created: number; completed: number; cancelled: number }[];
  }> {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const metrics = await this.metricRepo.findRange(startDate, today);

    const totalOrders = metrics.reduce((s, m) => s + m.totalOrders, 0);
    const completedOrders = metrics.reduce((s, m) => s + m.completedOrders, 0);
    const cancelledOrders = metrics.reduce((s, m) => s + m.cancelledOrders, 0);

    return {
      totalOrders,
      completedOrders,
      cancelledOrders,
      pendingOrders: totalOrders - completedOrders - cancelledOrders,
      successRate: totalOrders > 0 ? completedOrders / totalOrders : 0,
      dailyBreakdown: metrics.map(m => ({
        date: m.date,
        created: m.totalOrders,
        completed: m.completedOrders,
        cancelled: m.cancelledOrders
      }))
    };
  }
}
