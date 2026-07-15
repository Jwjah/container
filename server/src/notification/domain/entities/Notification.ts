import { NotificationType } from '../enums/NotificationType';
import { NotificationPriority } from '../enums/NotificationPriority';
import { DeliveryAttempt } from './DeliveryAttempt';
import { NotificationChannel } from '../enums/NotificationChannel';
import { NotificationStatus } from '../enums/NotificationStatus';

export class Notification {
  constructor(
    public readonly id: number | null,
    public readonly userId: number,
    public readonly type: NotificationType,
    public readonly priority: NotificationPriority,
    public readonly title: string,
    public readonly content: string,
    public isRead: boolean = false,
    public readonly createdAt: Date = new Date(),
    public readonly deliveryAttempts: DeliveryAttempt[] = []
  ) {
    if (!title) {
      throw new Error('Notification title cannot be empty');
    }
    if (!content) {
      throw new Error('Notification content cannot be empty');
    }
  }

  public markAsRead(): void {
    this.isRead = true;
  }

  public addDeliveryAttempt(channel: NotificationChannel, status: NotificationStatus, errorMessage: string | null = null): void {
    this.deliveryAttempts.push(
      new DeliveryAttempt(
        null,
        this.id || 0,
        channel,
        status,
        errorMessage,
        new Date()
      )
    );
  }
}
