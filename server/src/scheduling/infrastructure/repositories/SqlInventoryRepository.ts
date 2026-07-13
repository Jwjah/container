import { IInventoryRepository } from '../../interfaces/IInventoryRepository';
import { InventoryItem } from '../../domain/entities/InventoryItem';
import { SchedulingConcurrencyError } from '../../domain/errors/SchedulingErrors';
import db from '../../../config/database';

export class SqlInventoryRepository implements IInventoryRepository {
  public async findById(id: number, connection?: any): Promise<InventoryItem | null> {
    const executor = connection || db;
    const query = 'SELECT * FROM scheduling_inventory WHERE id = ?';
    try {
      const [rows] = await executor.execute(query, [id]);
      const row = (rows as any[])[0];
      if (!row) return null;

      return this.mapToInventoryItem(row);
    } catch (err: any) {
      console.error('[SqlInventoryRepository.findById] Error:', err.message);
      throw err;
    }
  }

  public async findByShopAndItem(
    shopId: number,
    type: string,
    variant: string,
    connection?: any
  ): Promise<InventoryItem | null> {
    const executor = connection || db;
    const query = 'SELECT * FROM scheduling_inventory WHERE shop_id = ? AND type = ? AND variant = ?';
    try {
      const [rows] = await executor.execute(query, [shopId, type, variant]);
      const row = (rows as any[])[0];
      if (!row) return null;

      return this.mapToInventoryItem(row);
    } catch (err: any) {
      console.error('[SqlInventoryRepository.findByShopAndItem] Error:', err.message);
      throw err;
    }
  }

  public async findByShopId(shopId: number, connection?: any): Promise<InventoryItem[]> {
    const executor = connection || db;
    const query = 'SELECT * FROM scheduling_inventory WHERE shop_id = ? ORDER BY id ASC';
    try {
      const [rows] = await executor.execute(query, [shopId]);
      return (rows as any[]).map(row => this.mapToInventoryItem(row));
    } catch (err: any) {
      console.error('[SqlInventoryRepository.findByShopId] Error:', err.message);
      throw err;
    }
  }

  public async create(item: InventoryItem, connection?: any): Promise<number> {
    const executor = connection || db;
    const query = `
      INSERT INTO scheduling_inventory (
        shop_id, type, variant, quantity, unit, low_stock_threshold, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    try {
      const [result] = await executor.execute(query, [
        item.shopId,
        item.type,
        item.variant,
        item.quantity,
        item.unit,
        item.lowStockThreshold,
        item.version
      ]);

      const insertedId = (result as any).insertId;
      item.id = insertedId;
      return insertedId;
    } catch (err: any) {
      console.error('[SqlInventoryRepository.create] Error:', err.message);
      throw err;
    }
  }

  public async update(item: InventoryItem, connection?: any): Promise<void> {
    const executor = connection || db;
    const nextVersion = item.version + 1;
    const query = `
      UPDATE scheduling_inventory 
      SET quantity = ?, 
          low_stock_threshold = ?, 
          version = ?, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND version = ?
    `;
    try {
      const [result] = await executor.execute(query, [
        item.quantity,
        item.lowStockThreshold,
        nextVersion,
        item.id,
        item.version
      ]);

      const affected = (result as any).affectedRows ?? (result as any).changes ?? 0;
      if (affected === 0) {
        throw new SchedulingConcurrencyError('InventoryItem', item.id || 0);
      }
      (item as any).version = nextVersion;
    } catch (err: any) {
      if (err instanceof SchedulingConcurrencyError) throw err;
      console.error('[SqlInventoryRepository.update] Error:', err.message);
      throw err;
    }
  }

  public async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    const query = 'DELETE FROM scheduling_inventory';
    try {
      await executor.execute(query);
    } catch (err: any) {
      console.error('[SqlInventoryRepository.deleteAll] Error:', err.message);
      throw err;
    }
  }

  private mapToInventoryItem(row: any): InventoryItem {
    const createdDate = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
    const updatedDate = row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);

    return new InventoryItem(
      row.id,
      row.shop_id,
      row.type,
      row.variant,
      row.quantity,
      row.unit,
      row.low_stock_threshold,
      row.version,
      createdDate,
      updatedDate
    );
  }
}
