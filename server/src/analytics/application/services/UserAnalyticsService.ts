import { IUserAnalyticsRepository } from '../../interfaces/IUserAnalyticsRepository';
import { IOrderFactRepository } from '../../interfaces/IOrderFactRepository';
import { UserAnalytics } from '../../domain/entities/UserAnalytics';

/**
 * UserAnalyticsService — read-oriented queries for user activity analytics.
 * RFC-010 Specification
 */
export class UserAnalyticsService {
  constructor(
    private readonly userRepo: IUserAnalyticsRepository,
    private readonly factRepo: IOrderFactRepository
  ) {}

  public async getUserAnalytics(userId: number): Promise<UserAnalytics | null> {
    return this.userRepo.findByUserId(userId);
  }

  public async getUserActivity(userId: number): Promise<{
    analytics: UserAnalytics | null;
    recentOrders: {
      orderId: number;
      shopId: number;
      date: string;
      revenue: number;
      completed: boolean;
      cancelled: boolean;
    }[];
  }> {
    const [analytics, facts] = await Promise.all([
      this.userRepo.findByUserId(userId),
      this.factRepo.findByUserId(userId, 20)
    ]);

    const recentOrders = facts.map(f => ({
      orderId: f.orderId,
      shopId: f.shopId,
      date: f.date,
      revenue: f.revenue,
      completed: f.isCompleted,
      cancelled: f.isCancelled
    }));

    return { analytics, recentOrders };
  }
}
