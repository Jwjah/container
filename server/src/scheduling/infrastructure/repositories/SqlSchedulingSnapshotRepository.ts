import { ISchedulingSnapshotRepository } from '../../interfaces/ISchedulingSnapshotRepository';
import { SchedulingSnapshot } from '../../domain/entities/SchedulingSnapshot';
import db from '../../../config/database';

export class SqlSchedulingSnapshotRepository implements ISchedulingSnapshotRepository {
  public async findLatestByShopId(shopId: number, connection?: any): Promise<SchedulingSnapshot | null> {
    const executor = connection || db;
    const query = 'SELECT * FROM scheduling_snapshots WHERE shop_id = ? ORDER BY created_at DESC LIMIT 1';
    try {
      const [rows] = await executor.execute(query, [shopId]);
      const row = (rows as any[])[0];
      if (!row) return null;

      const createdDate = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);

      return new SchedulingSnapshot(
        row.shop_id,
        row.last_event_id,
        row.last_event_sequence,
        row.state_data,
        createdDate
      );
    } catch (err: any) {
      console.error('[SqlSchedulingSnapshotRepository.findLatestByShopId] Error:', err.message);
      throw err;
    }
  }

  public async save(snapshot: SchedulingSnapshot, connection?: any): Promise<void> {
    const executor = connection || db;
    const query = `
      INSERT OR REPLACE INTO scheduling_snapshots (
        shop_id, last_event_id, last_event_sequence, state_data
      ) VALUES (?, ?, ?, ?)
    `;
    try {
      await executor.execute(query, [
        snapshot.shopId,
        snapshot.lastEventId,
        snapshot.lastEventSequence,
        snapshot.stateData
      ]);
    } catch (err: any) {
      console.error('[SqlSchedulingSnapshotRepository.save] Error:', err.message);
      throw err;
    }
  }

  public async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      await executor.execute('DELETE FROM scheduling_snapshots');
    } catch (err: any) {
      console.error('[SqlSchedulingSnapshotRepository.deleteAll] Error:', err.message);
      throw err;
    }
  }
}
export const globalSchedulingSnapshotRepository = new SqlSchedulingSnapshotRepository();
