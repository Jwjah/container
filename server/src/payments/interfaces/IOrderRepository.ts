import { Order } from '../domain/entities/Order';

export interface IOrderRepository {
  findById(id: number, connection?: any): Promise<Order | null>;
  findByIdForUpdate(id: number, connection?: any): Promise<Order | null>;
  update(order: Order, connection?: any): Promise<Order>;
}
