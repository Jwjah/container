import { FulfillmentService } from '../services/FulfillmentService';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';

export class DeliveryDispatchRequestListner {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  public async handle(payload: any): Promise<void> {
    const { fulfillmentId, agentId, userId, correlationId } = payload;
    const cid = correlationId ? CorrelationId.fromString(correlationId) : CorrelationId.create();

    console.log(`[DeliveryDispatchRequestListner] Handling auto-dispatch request for Fulfillment #${fulfillmentId} to Agent #${agentId}`);

    await this.fulfillmentService.assignAgent(
      fulfillmentId,
      agentId,
      userId,
      cid
    );
  }
}
