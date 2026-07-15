import { INotificationTemplateRepository } from '../../interfaces/INotificationTemplateRepository';
import { DeliveryService } from './DeliveryService';
import { NotificationType } from '../../domain/enums/NotificationType';
import { NotificationPriority } from '../../domain/enums/NotificationPriority';

/**
 * NotificationService — higher level orchestrator linking template repository with delivery engine.
 *
 * RFC-009 Specification
 */
export class NotificationService {
  constructor(
    private readonly templateRepo: INotificationTemplateRepository,
    private readonly deliveryService: DeliveryService
  ) {}

  /**
   * Sends a notification based on a registered template name. Falls back to direct format if template missing.
   */
  public async sendNotification(
    userId: number,
    templateName: string,
    type: NotificationType,
    priority: NotificationPriority,
    variables: Record<string, any>,
    connection?: any
  ): Promise<void> {
    const template = await this.templateRepo.findByName(templateName, connection);

    let titleTemplate = 'Notification Update';
    let markdownTemplate = 'You have a new update in CampusPrint.';

    if (template) {
      titleTemplate = template.subject || titleTemplate;
      markdownTemplate = template.bodyMarkdown;
    } else {
      // Inline templates map for testing fallback configurations
      if (templateName === 'ORDER_CREATED') {
        titleTemplate = 'Order Created #{{orderId}}';
        markdownTemplate = 'Your print order of {{pagesCount}} pages was placed successfully at shop {{shopId}}.';
      } else if (templateName === 'PAYMENT_CONFIRMED') {
        titleTemplate = 'Payment Confirmed #{{orderId}}';
        markdownTemplate = 'Payment for your print order {{orderId}} was confirmed successfully.';
      } else if (templateName === 'LOW_STOCK') {
        titleTemplate = 'Low Stock Alert';
        markdownTemplate = 'Inventory item {{type}} {{variant}} in shop {{shopId}} is running low (quantity: {{quantity}}).';
      }
    }

    await this.deliveryService.deliver(
      userId,
      type,
      priority,
      titleTemplate,
      markdownTemplate,
      variables,
      connection
    );
  }
}
