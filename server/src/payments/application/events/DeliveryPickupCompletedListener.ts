import { FulfillmentService } from '../services/FulfillmentService';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';

export class DeliveryPickupCompletedListener {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  public async handle(payload: any): Promise<void> {
    const { fulfillmentId, agentId, correlationId } = payload;
    const cid = correlationId ? CorrelationId.fromString(correlationId) : CorrelationId.create();

    console.log(`[DeliveryPickupCompletedListener] Agent #${agentId} picked up prints for Fulfillment #${fulfillmentId}`);

    await this.fulfillmentService.startDelivery(
      fulfillmentId,
      agentId,
      cid
    );
  }
}
