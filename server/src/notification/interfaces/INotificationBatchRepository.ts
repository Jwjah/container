import { NotificationBatch } from '../domain/entities/NotificationBatch';

export interface INotificationBatchRepository {
  findById(id: number, connection?: any): Promise<NotificationBatch | null>;
  create(batch: NotificationBatch, connection?: any): Promise<NotificationBatch>;
  update(batch: NotificationBatch, connection?: any): Promise<void>;
  deleteAll(connection?: any): Promise<void>;
}
