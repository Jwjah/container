import { Notification } from '../domain/entities/Notification';
import { DeliveryAttempt } from '../domain/entities/DeliveryAttempt';

export interface INotificationRepository {
  findById(id: number, connection?: any): Promise<Notification | null>;
  findByUserId(userId: number, connection?: any): Promise<Notification[]>;
  create(notification: Notification, connection?: any): Promise<Notification>;
  update(notification: Notification, connection?: any): Promise<void>;
  saveAttempt(attempt: DeliveryAttempt, connection?: any): Promise<void>;
  deleteAll(connection?: any): Promise<void>;
}
