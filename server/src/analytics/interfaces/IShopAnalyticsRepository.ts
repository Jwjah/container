import { ShopAnalytics } from '../domain/entities/ShopAnalytics';

export interface IShopAnalyticsRepository {
  findByShopId(shopId: number, connection?: any): Promise<ShopAnalytics | null>;
  findAll(connection?: any): Promise<ShopAnalytics[]>;
  upsert(analytics: ShopAnalytics, connection?: any): Promise<ShopAnalytics>;
  deleteAll(connection?: any): Promise<void>;
}
