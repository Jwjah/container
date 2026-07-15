import { INotificationRepository } from '../../interfaces/INotificationRepository';
import { Notification } from '../../domain/entities/Notification';

/**
 * InAppChannelHandler — registers alert records inside the RDBMS.
 *
 * RFC-009 Specification
 */
export class InAppChannelHandler {
  constructor(private readonly notificationRepo: INotificationRepository) {}

  /**
   * Dispatches in-app notification by saving it to repository.
   */
  public async sendInApp(notification: Notification, connection?: any): Promise<void> {
    await this.notificationRepo.create(notification, connection);
    console.log(`📱 [InAppChannelHandler] Saved alert in-app for user ${notification.userId}: ${notification.title}`);
  }
}
