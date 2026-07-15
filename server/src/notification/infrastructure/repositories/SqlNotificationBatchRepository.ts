import { INotificationBatchRepository } from '../../interfaces/INotificationBatchRepository';
import { NotificationBatch } from '../../domain/entities/NotificationBatch';
import db from '../../../config/database';

export class SqlNotificationBatchRepository implements INotificationBatchRepository {
  public async findById(id: number, connection?: any): Promise<NotificationBatch | null> {
    const executor = connection || db;
    try {
      const [rows] = await executor.execute('SELECT * FROM notification_batches WHERE id = ?', [id]);
      const row = (rows as any[])[0];
      if (!row) return null;

      return new NotificationBatch(
        row.id,
        row.shop_id,
        row.recipient_count,
        row.status,
        row.created_at instanceof Date ? row.created_at : new Date(row.created_at)
      );
    } catch (err: any) {
      console.error('[SqlNotificationBatchRepository.findById] Error:', err.message);
      throw err;
    }
  }

  public async create(batch: NotificationBatch, connection?: any): Promise<NotificationBatch> {
    const executor = connection || db;
    try {
      const query = 'INSERT INTO notification_batches (shop_id, recipient_count, status) VALUES (?, ?, ?)';
      const [result] = await executor.execute(query, [batch.shopId, batch.recipientCount, batch.status]);
      const insertedId = (result as any).insertId;
      return new NotificationBatch(insertedId, batch.shopId, batch.recipientCount, batch.status, batch.createdAt);
    } catch (err: any) {
      console.error('[SqlNotificationBatchRepository.create] Error:', err.message);
      throw err;
    }
  }

  public async update(batch: NotificationBatch, connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      const query = 'UPDATE notification_batches SET status = ? WHERE id = ?';
      await executor.execute(query, [batch.status, batch.id]);
    } catch (err: any) {
      console.error('[SqlNotificationBatchRepository.update] Error:', err.message);
      throw err;
    }
  }

  public async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      await executor.execute('DELETE FROM notification_batches');
    } catch (err: any) {
      console.error('[SqlNotificationBatchRepository.deleteAll] Error:', err.message);
      throw err;
    }
  }
}
export const globalNotificationBatchRepository = new SqlNotificationBatchRepository();
