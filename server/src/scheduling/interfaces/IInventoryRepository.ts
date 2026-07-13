import { InventoryItem } from '../domain/entities/InventoryItem';

export interface IInventoryRepository {
  findById(id: number, connection?: any): Promise<InventoryItem | null>;
  findByShopAndItem(shopId: number, type: string, variant: string, connection?: any): Promise<InventoryItem | null>;
  findByShopId(shopId: number, connection?: any): Promise<InventoryItem[]>;
  create(item: InventoryItem, connection?: any): Promise<number>;
  update(item: InventoryItem, connection?: any): Promise<void>;
  deleteAll(connection?: any): Promise<void>;
}
