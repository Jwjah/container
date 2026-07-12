import { WebhookEvent } from '../domain/entities/WebhookEvent';

export interface IWebhookEventRepository {
  /**
   * Records a new Webhook event in auditing persistence.
   */
  create(event: WebhookEvent, connection?: any): Promise<WebhookEvent>;

  /**
   * Finds a Webhook event by its external event business key (event_id).
   */
  findByEventId(eventId: string, connection?: any): Promise<WebhookEvent | null>;

  /**
   * Updates an existing Webhook event record.
   */
  update(event: WebhookEvent, connection?: any): Promise<WebhookEvent>;
}
