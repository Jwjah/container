import { NotificationChannel } from '../enums/NotificationChannel';
import { NotificationStatus } from '../enums/NotificationStatus';

export class DeliveryAttempt {
  constructor(
    public readonly id: number | null,
    public readonly notificationId: number,
    public readonly channel: NotificationChannel,
    public readonly status: NotificationStatus,
    public readonly errorMessage: string | null = null,
    public readonly attemptedAt: Date = new Date()
  ) {}
}
