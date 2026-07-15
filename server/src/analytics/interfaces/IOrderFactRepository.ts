import { OrderFact } from '../domain/entities/OrderFact';

export interface IOrderFactRepository {
  findByOrderId(orderId: number, connection?: any): Promise<OrderFact | null>;
  findByShopId(shopId: number, limit?: number, connection?: any): Promise<OrderFact[]>;
  findByUserId(userId: number, limit?: number, connection?: any): Promise<OrderFact[]>;
  findByDateRange(startDate: string, endDate: string, connection?: any): Promise<OrderFact[]>;
  upsert(fact: OrderFact, connection?: any): Promise<OrderFact>;
  deleteAll(connection?: any): Promise<void>;
}
