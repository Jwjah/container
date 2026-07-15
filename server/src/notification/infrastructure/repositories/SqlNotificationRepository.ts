import { INotificationRepository } from '../../interfaces/INotificationRepository';
import { Notification } from '../../domain/entities/Notification';
import { DeliveryAttempt } from '../../domain/entities/DeliveryAttempt';
import { NotificationChannel } from '../../domain/enums/NotificationChannel';
import { NotificationStatus } from '../../domain/enums/NotificationStatus';
import { NotificationType } from '../../domain/enums/NotificationType';
import { NotificationPriority } from '../../domain/enums/NotificationPriority';
import db from '../../../config/database';

export class SqlNotificationRepository implements INotificationRepository {
  public async findById(id: number, connection?: any): Promise<Notification | null> {
    const executor = connection || db;
    try {
      const [rows] = await executor.execute('SELECT * FROM notifications WHERE id = ?', [id]);
      const row = (rows as any[])[0];
      if (!row) return null;

      // Get attempts
      const [attemptRows] = await executor.execute(
        'SELECT * FROM notification_delivery_attempts WHERE notification_id = ? ORDER BY attempted_at ASC',
        [id]
      );
      const attempts = (attemptRows as any[]).map(a => new DeliveryAttempt(
        a.id,
        a.notification_id,
        a.channel as NotificationChannel,
        a.status as NotificationStatus,
        a.error_message,
        a.attempted_at instanceof Date ? a.attempted_at : new Date(a.attempted_at)
      ));

      let priority = NotificationPriority.LOW;
      try {
        const meta = row.metadata ? JSON.parse(row.metadata) : {};
        if (meta.priority) {
          priority = meta.priority as NotificationPriority;
        }
      } catch {}

      return new Notification(
        row.id,
        row.user_id,
        (row.type || 'system') as NotificationType,
        priority,
        row.title,
        row.message || '',
        row.is_read === 1,
        row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        attempts
      );
    } catch (err: any) {
      console.error('[SqlNotificationRepository.findById] Error:', err.message);
      throw err;
    }
  }

  public async findByUserId(userId: number, connection?: any): Promise<Notification[]> {
    const executor = connection || db;
    try {
      const [rows] = await executor.execute(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
      
      const notifications: Notification[] = [];
      for (const row of rows as any[]) {
        // Load attempts
        const [attemptRows] = await executor.execute(
          'SELECT * FROM notification_delivery_attempts WHERE notification_id = ? ORDER BY attempted_at ASC',
          [row.id]
        );
        const attempts = (attemptRows as any[]).map(a => new DeliveryAttempt(
          a.id,
          a.notification_id,
          a.channel as NotificationChannel,
          a.status as NotificationStatus,
          a.error_message,
          a.attempted_at instanceof Date ? a.attempted_at : new Date(a.attempted_at)
        ));

        let priority = NotificationPriority.LOW;
        try {
          const meta = row.metadata ? JSON.parse(row.metadata) : {};
          if (meta.priority) {
            priority = meta.priority as NotificationPriority;
          }
        } catch {}

        notifications.push(
          new Notification(
            row.id,
            row.user_id,
            (row.type || 'system') as NotificationType,
            priority,
            row.title,
            row.message || '',
            row.is_read === 1,
            row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
            attempts
          )
        );
      }
      return notifications;
    } catch (err: any) {
      console.error('[SqlNotificationRepository.findByUserId] Error:', err.message);
      throw err;
    }
  }

  public async create(notification: Notification, connection?: any): Promise<Notification> {
    const executor = connection || db;
    try {
      const metadata = JSON.stringify({ priority: notification.priority });
      const query = `
        INSERT INTO notifications (
          user_id, type, title, message, is_read, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      const [result] = await executor.execute(query, [
        notification.userId,
        notification.type,
        notification.title,
        notification.content,
        notification.isRead ? 1 : 0,
        metadata,
        notification.createdAt.toISOString().slice(0, 19).replace('T', ' ')
      ]);

      const insertedId = (result as any).insertId || (result as any).lastID;

      // Save delivery attempts if they exist
      for (const attempt of notification.deliveryAttempts) {
        await this.saveAttempt(
          new DeliveryAttempt(
            null,
            insertedId,
            attempt.channel,
            attempt.status,
            attempt.errorMessage,
            attempt.attemptedAt
          ),
          executor
        );
      }

      return new Notification(
        insertedId,
        notification.userId,
        notification.type,
        notification.priority,
        notification.title,
        notification.content,
        notification.isRead,
        notification.createdAt,
        notification.deliveryAttempts
      );
    } catch (err: any) {
      console.error('[SqlNotificationRepository.create] Error:', err.message);
      throw err;
    }
  }

  public async update(notification: Notification, connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      await executor.execute(
        'UPDATE notifications SET is_read = ? WHERE id = ?',
        [notification.isRead ? 1 : 0, notification.id]
      );
    } catch (err: any) {
      console.error('[SqlNotificationRepository.update] Error:', err.message);
      throw err;
    }
  }

  public async saveAttempt(attempt: DeliveryAttempt, connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      const query = `
        INSERT INTO notification_delivery_attempts (
          notification_id, channel, status, error_message, attempted_at
        ) VALUES (?, ?, ?, ?, ?)
      `;
      await executor.execute(query, [
        attempt.notificationId,
        attempt.channel,
        attempt.status,
        attempt.errorMessage,
        attempt.attemptedAt.toISOString().slice(0, 19).replace('T', ' ')
      ]);
    } catch (err: any) {
      console.error('[SqlNotificationRepository.saveAttempt] Error:', err.message);
      throw err;
    }
  }

  public async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      await executor.execute('DELETE FROM notification_delivery_attempts');
      await executor.execute('DELETE FROM notifications');
    } catch (err: any) {
      console.error('[SqlNotificationRepository.deleteAll] Error:', err.message);
      throw err;
    }
  }
}
export const globalNotificationRepository = new SqlNotificationRepository();
