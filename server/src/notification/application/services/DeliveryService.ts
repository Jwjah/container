import { INotificationRepository } from '../../interfaces/INotificationRepository';
import { EmailChannelHandler } from './EmailChannelHandler';
import { InAppChannelHandler } from './InAppChannelHandler';
import { ChannelRouter } from './ChannelRouter';
import { TemplateEngine } from './TemplateEngine';
import { Notification } from '../../domain/entities/Notification';
import { DeliveryAttempt } from '../../domain/entities/DeliveryAttempt';
import { NotificationType } from '../../domain/enums/NotificationType';
import { NotificationPriority } from '../../domain/enums/NotificationPriority';
import { NotificationChannel } from '../../domain/enums/NotificationChannel';
import { NotificationStatus } from '../../domain/enums/NotificationStatus';
import db from '../../../config/database';

/**
 * DeliveryService — orchestrates rendering, routing, calling handlers, and logging attempts.
 *
 * RFC-009 Specification
 */
export class DeliveryService {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly emailHandler: EmailChannelHandler,
    private readonly inAppHandler: InAppChannelHandler,
    private readonly router: ChannelRouter,
    private readonly templateEngine: TemplateEngine
  ) {}

  /**
   * Delivers a custom parameterized template notification across active preferred channels.
   */
  public async deliver(
    userId: number,
    type: NotificationType,
    priority: NotificationPriority,
    titleTemplate: string,
    markdownTemplate: string,
    variables: Record<string, any>,
    connection?: any
  ): Promise<void> {
    const executor = connection || db;

    // 1. Resolve active preferred channels
    const channels = await this.router.route(userId, priority, new Date(), executor);
    if (channels.length === 0) {
      console.log(`🔇 [DeliveryService] No channels routed for user ${userId} (preference / quiet hours)`);
      return;
    }

    // 2. Render templates
    const renderedTitle = this.templateEngine.render(titleTemplate, variables);
    const renderedMarkdown = this.templateEngine.render(markdownTemplate, variables);
    const renderedHtml = this.templateEngine.markdownToHtml(renderedMarkdown);
    const renderedText = this.templateEngine.markdownToPlainText(renderedMarkdown);

    // 3. Create core Notification alert record in database (represents the in-app delivery entity)
    const notification = new Notification(
      null,
      userId,
      type,
      priority,
      renderedTitle,
      renderedText,
      false, // isRead
      new Date()
    );

    // If IN_APP is in channels, we create/save the notification record first to get its ID!
    let savedNotification = notification;
    if (channels.includes(NotificationChannel.IN_APP)) {
      savedNotification = await this.notificationRepo.create(notification, executor);
      const attempt = new DeliveryAttempt(
        null,
        savedNotification.id!,
        NotificationChannel.IN_APP,
        NotificationStatus.SENT
      );
      await this.notificationRepo.saveAttempt(attempt, executor);
    } else {
      // Save notification anyway as general historic ledger even if not active in user's in-app inbox
      savedNotification = await this.notificationRepo.create(notification, executor);
    }

    // 4. Deliver on other channels (e.g. EMAIL)
    if (channels.includes(NotificationChannel.EMAIL)) {
      try {
        await this.emailHandler.sendEmail(
          userId,
          renderedTitle,
          renderedHtml,
          renderedText,
          executor
        );

        const attempt = new DeliveryAttempt(
          null,
          savedNotification.id!,
          NotificationChannel.EMAIL,
          NotificationStatus.SENT
        );
        await this.notificationRepo.saveAttempt(attempt, executor);
      } catch (err: any) {
        console.error(`🚨 [DeliveryService] Email delivery failed for user ${userId}:`, err.message);

        // Record failed attempt log entry
        const attempt = new DeliveryAttempt(
          null,
          savedNotification.id!,
          NotificationChannel.EMAIL,
          NotificationStatus.FAILED,
          err.message
        );
        await this.notificationRepo.saveAttempt(attempt, executor);

        // Re-throw so the background worker retry loop detects this and processes retries
        throw err;
      }
    }
  }
}
