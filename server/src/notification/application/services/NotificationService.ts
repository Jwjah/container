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
      } else if (templateName === 'WITHDRAWAL_REQUESTED') {
        titleTemplate = 'Withdrawal Requested';
        markdownTemplate = 'A withdrawal request of ₹{{amount}} has been submitted by user ID {{userId}} ({{role}}).';
      } else if (templateName === 'WITHDRAWAL_REQUESTED_USER') {
        titleTemplate = 'Withdrawal Requested';
        markdownTemplate = 'Your withdrawal request of ₹{{amount}} has been submitted successfully (ID: {{withdrawalId}}).';
      } else if (templateName === 'WITHDRAWAL_APPROVED') {
        titleTemplate = 'Withdrawal Approved';
        markdownTemplate = 'Your withdrawal request {{withdrawalId}} for ₹{{amount}} has been approved.';
      } else if (templateName === 'WITHDRAWAL_REJECTED') {
        titleTemplate = 'Withdrawal Rejected';
        markdownTemplate = 'Your withdrawal request {{withdrawalId}} for ₹{{amount}} has been rejected. Reason: {{reason}}.';
      } else if (templateName === 'WITHDRAWAL_COMPLETED') {
        titleTemplate = 'Withdrawal Completed';
        markdownTemplate = 'Your withdrawal request {{withdrawalId}} for ₹{{amount}} has been processed successfully. UTR: {{referenceNumber}}.';
      } else if (templateName === 'DELIVERY_TIMEOUT') {
        titleTemplate = 'Delivery Partner Unavailable';
        markdownTemplate = 'No delivery partner is currently available for your order. You may switch this order to Self Pickup and collect it directly from the shop.';
      } else if (templateName === 'DELIVERY_TIMEOUT_SHOP') {
        titleTemplate = 'Delivery Agent Timeout';
        markdownTemplate = 'No delivery partner accepted order #{{orderHash}} within the timeout period. Awaiting student self-pickup choice.';
      } else if (templateName === 'DELIVERY_TIMEOUT_ADMIN') {
        titleTemplate = 'Delivery Agent Timeout';
        markdownTemplate = 'Order #{{orderHash}} timed out waiting for a delivery agent.';
      } else if (templateName === 'PICKUP_CONVERSION') {
        titleTemplate = 'Order Fulfillment Changed';
        markdownTemplate = 'Your order #{{orderHash}} has been successfully converted to Self Pickup.';
      } else if (templateName === 'PICKUP_CONVERSION_SHOP') {
        titleTemplate = 'Fulfillment Switched to Pickup';
        markdownTemplate = 'Order #{{orderHash}} was converted to Self Pickup by the student.';
      } else if (templateName === 'PICKUP_CONVERSION_ADMIN') {
        titleTemplate = 'Fulfillment Switched to Pickup';
        markdownTemplate = 'Order #{{orderHash}} was converted to Self Pickup by the student.';
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
