import { IWebhookEventRepository } from '../../interfaces/IWebhookEventRepository';
import { WebhookEvent } from '../../domain/entities/WebhookEvent';
import { WebhookProcessingStatus } from '../../domain/enums/WebhookProcessingStatus';
import { PaymentRepositoryError } from '../../domain/errors/PaymentErrors';
import db from '../../../config/database';

export class SqlWebhookEventRepository implements IWebhookEventRepository {
  
  public async create(event: WebhookEvent, connection?: any): Promise<WebhookEvent> {
    const runner = connection || db;
    const query = `
      INSERT INTO payment_webhook_events (
        event_id, event_type, payment_uuid, payment_reference, 
        gateway_order_id, gateway_payment_id, payload, headers, 
        signature, payload_hash, processing_status, error_message, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      event.eventId,
      event.eventType,
      event.paymentUuid || null,
      event.paymentReference || null,
      event.gatewayOrderId || null,
      event.gatewayPaymentId || null,
      event.payload,
      event.headers,
      event.signature,
      event.payloadHash,
      event.processingStatus,
      event.errorMessage || null,
      event.processedAt ? event.processedAt.toISOString().replace('T', ' ').substring(0, 19) : null
    ];

    try {
      const [result]: any = await runner.execute(query, params);
      return {
        ...event,
        id: result.insertId
      };
    } catch (err: any) {
      throw new PaymentRepositoryError(`Failed to create webhook event: ${event.eventId}`, err);
    }
  }

  public async findByEventId(eventId: string, connection?: any): Promise<WebhookEvent | null> {
    const runner = connection || db;
    const query = 'SELECT * FROM payment_webhook_events WHERE event_id = ?';
    try {
      const [rows]: any = await runner.execute(query, [eventId]);
      if (!rows || rows.length === 0) return null;
      const row = rows[0];
      return {
        id: row.id,
        eventId: row.event_id,
        eventType: row.event_type,
        paymentUuid: row.payment_uuid,
        paymentReference: row.payment_reference,
        gatewayOrderId: row.gateway_order_id,
        gatewayPaymentId: row.gateway_payment_id,
        payload: row.payload,
        headers: row.headers,
        signature: row.signature,
        payloadHash: row.payload_hash,
        processingStatus: row.processing_status as WebhookProcessingStatus,
        errorMessage: row.error_message,
        processedAt: row.processed_at ? new Date(row.processed_at) : null,
        createdAt: row.created_at ? new Date(row.created_at) : undefined
      };
    } catch (err: any) {
      throw new PaymentRepositoryError(`Failed to find webhook event by event_id: ${eventId}`, err);
    }
  }

  public async update(event: WebhookEvent, connection?: any): Promise<WebhookEvent> {
    if (!event.id) {
      throw new PaymentRepositoryError('Cannot update webhook event without a valid persistence surrogate ID');
    }
    const runner = connection || db;
    const query = `
      UPDATE payment_webhook_events SET
        payment_uuid = ?,
        payment_reference = ?,
        gateway_order_id = ?,
        gateway_payment_id = ?,
        processing_status = ?,
        error_message = ?,
        processed_at = ?
      WHERE id = ?
    `;

    const params = [
      event.paymentUuid || null,
      event.paymentReference || null,
      event.gatewayOrderId || null,
      event.gatewayPaymentId || null,
      event.processingStatus,
      event.errorMessage || null,
      event.processedAt ? event.processedAt.toISOString().replace('T', ' ').substring(0, 19) : null,
      event.id
    ];

    try {
      await runner.execute(query, params);
      return event;
    } catch (err: any) {
      throw new PaymentRepositoryError(`Failed to update webhook event with ID: ${event.id}`, err);
    }
  }
}
