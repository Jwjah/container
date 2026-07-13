import { ShopCapacity } from '../domain/entities/ShopCapacity';

export interface IShopCapacityRepository {
  findById(shopId: number, connection?: any): Promise<ShopCapacity | null>;
  create(capacity: ShopCapacity, connection?: any): Promise<void>;
  update(capacity: ShopCapacity, connection?: any): Promise<void>;
  deleteAll(connection?: any): Promise<void>;
}
