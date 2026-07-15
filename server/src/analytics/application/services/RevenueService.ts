import { IAnalyticsMetricRepository } from '../../interfaces/IAnalyticsMetricRepository';
import { IOrderFactRepository } from '../../interfaces/IOrderFactRepository';

/**
 * RevenueService — revenue queries and trend analysis.
 * RFC-010 Specification
 */
export class RevenueService {
  constructor(
    private readonly metricRepo: IAnalyticsMetricRepository,
    private readonly factRepo: IOrderFactRepository
  ) {}

  public async getTotalRevenue(days = 30): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const metrics = await this.metricRepo.findRange(startDate, today);
    return metrics.reduce((s, m) => s + m.totalRevenue, 0);
  }

  public async getDailyRevenueTrend(days = 30): Promise<{ date: string; revenue: number; orders: number }[]> {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const metrics = await this.metricRepo.findRange(startDate, today);
    return metrics.map(m => ({ date: m.date, revenue: m.totalRevenue, orders: m.totalOrders }));
  }

  public async getRevenueSummary(): Promise<{
    today: number;
    last7Days: number;
    last30Days: number;
    allTime: number;
  }> {
    const todayStr = new Date().toISOString().slice(0, 10);
    const d7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const d3650 = new Date(Date.now() - 3650 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [todayMetrics, week, month, all] = await Promise.all([
      this.metricRepo.findRange(todayStr, todayStr),
      this.metricRepo.findRange(d7, todayStr),
      this.metricRepo.findRange(d30, todayStr),
      this.metricRepo.findRange(d3650, todayStr)
    ]);

    return {
      today: todayMetrics.reduce((s, m) => s + m.totalRevenue, 0),
      last7Days: week.reduce((s, m) => s + m.totalRevenue, 0),
      last30Days: month.reduce((s, m) => s + m.totalRevenue, 0),
      allTime: all.reduce((s, m) => s + m.totalRevenue, 0)
    };
  }
}
