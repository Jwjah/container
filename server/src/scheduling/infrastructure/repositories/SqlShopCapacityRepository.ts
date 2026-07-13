import { IShopCapacityRepository } from '../../interfaces/IShopCapacityRepository';
import { ShopCapacity } from '../../domain/entities/ShopCapacity';
import { SchedulingConcurrencyError } from '../../domain/errors/SchedulingErrors';
import db from '../../../config/database';

export class SqlShopCapacityRepository implements IShopCapacityRepository {
  public async findById(shopId: number, connection?: any): Promise<ShopCapacity | null> {
    const executor = connection || db;
    const query = 'SELECT * FROM scheduling_shops_capacity WHERE shop_id = ?';
    try {
      const [rows] = await executor.execute(query, [shopId]);
      const row = (rows as any[])[0];
      if (!row) return null;

      const createdDate = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
      const updatedDate = row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);

      return new ShopCapacity(
        row.shop_id,
        row.max_parallel_orders,
        row.overload_wait_threshold_seconds,
        row.is_accepting_orders === 1,
        row.version,
        createdDate,
        updatedDate
      );
    } catch (err: any) {
      console.error('[SqlShopCapacityRepository.findById] Error:', err.message);
      throw err;
    }
  }

  public async create(capacity: ShopCapacity, connection?: any): Promise<void> {
    const executor = connection || db;
    const query = `
      INSERT INTO scheduling_shops_capacity (
        shop_id, max_parallel_orders, overload_wait_threshold_seconds, is_accepting_orders, version
      ) VALUES (?, ?, ?, ?, ?)
    `;
    try {
      await executor.execute(query, [
        capacity.shopId,
        capacity.maxParallelOrders,
        capacity.overloadWaitThresholdSeconds,
        capacity.isAcceptingOrders ? 1 : 0,
        capacity.version
      ]);
    } catch (err: any) {
      console.error('[SqlShopCapacityRepository.create] Error:', err.message);
      throw err;
    }
  }

  public async update(capacity: ShopCapacity, connection?: any): Promise<void> {
    const executor = connection || db;
    const nextVersion = capacity.version + 1;
    const query = `
      UPDATE scheduling_shops_capacity 
      SET max_parallel_orders = ?, 
          overload_wait_threshold_seconds = ?, 
          is_accepting_orders = ?, 
          version = ?, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE shop_id = ? AND version = ?
    `;
    try {
      const [result] = await executor.execute(query, [
        capacity.maxParallelOrders,
        capacity.overloadWaitThresholdSeconds,
        capacity.isAcceptingOrders ? 1 : 0,
        nextVersion,
        capacity.shopId,
        capacity.version
      ]);

      const affected = (result as any).affectedRows ?? (result as any).changes ?? 0;
      if (affected === 0) {
        throw new SchedulingConcurrencyError('ShopCapacity', capacity.shopId);
      }
      (capacity as any).version = nextVersion;
    } catch (err: any) {
      if (err instanceof SchedulingConcurrencyError) throw err;
      console.error('[SqlShopCapacityRepository.update] Error:', err.message);
      throw err;
    }
  }

  public async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    const query = 'DELETE FROM scheduling_shops_capacity';
    try {
      await executor.execute(query);
    } catch (err: any) {
      console.error('[SqlShopCapacityRepository.deleteAll] Error:', err.message);
      throw err;
    }
  }
}
