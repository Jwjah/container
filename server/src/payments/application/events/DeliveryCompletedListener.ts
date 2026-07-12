import { FulfillmentService } from '../services/FulfillmentService';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';

export class DeliveryCompletedListener {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  public async handle(payload: any): Promise<void> {
    const { fulfillmentId, proofOfDeliveryReference, agentId, correlationId } = payload;
    const cid = correlationId ? CorrelationId.fromString(correlationId) : CorrelationId.create();

    console.log(`[DeliveryCompletedListener] Delivery completed for Fulfillment #${fulfillmentId} by Agent #${agentId}`);

    const proof = proofOfDeliveryReference || 'PROOFOFDELIVERY_DEFAULT';
    await this.fulfillmentService.completeDelivery(
      fulfillmentId,
      proof,
      agentId,
      cid
    );
  }
}
