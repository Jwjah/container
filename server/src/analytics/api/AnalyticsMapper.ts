import { ShopAnalytics } from '../domain/entities/ShopAnalytics';
import { UserAnalytics } from '../domain/entities/UserAnalytics';
import { ShopAnalyticsDTO, UserAnalyticsDTO } from './AnalyticsDTO';

/**
 * AnalyticsMapper — converts domain entities to REST response DTOs.
 * RFC-010 Specification
 */
export class AnalyticsMapper {
  public static toShopDTO(a: ShopAnalytics): ShopAnalyticsDTO {
    return {
      shopId: a.shopId,
      totalOrders: a.totalOrders,
      completedOrders: a.completedOrders,
      cancelledOrders: a.cancelledOrders,
      totalRevenue: a.totalRevenue,
      successRate: a.successRate,
      avgCompletionTimeSecs: a.avgCompletionTimeSecs,
      avgDeliveryTimeSecs: a.avgDeliveryTimeSecs,
      printerUtilizationPct: a.printerUtilizationPct,
      queueUtilizationPct: a.queueUtilizationPct,
      lowStockEvents: a.lowStockEvents
    };
  }

  public static toUserDTO(
    a: UserAnalytics,
    recentOrders: {
      orderId: number;
      shopId: number;
      date: string;
      revenue: number;
      completed: boolean;
      cancelled: boolean;
    }[]
  ): UserAnalyticsDTO {
    return {
      userId: a.userId,
      totalOrders: a.totalOrders,
      completedOrders: a.completedOrders,
      cancelledOrders: a.cancelledOrders,
      totalSpend: a.totalSpend,
      avgOrderValue: a.avgOrderValue,
      lastOrderAt: a.lastOrderAt ? a.lastOrderAt.toISOString() : null,
      recentOrders
    };
  }
}
