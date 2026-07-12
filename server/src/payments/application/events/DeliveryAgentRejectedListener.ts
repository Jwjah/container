import { FulfillmentService } from '../services/FulfillmentService';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';

export class DeliveryAgentRejectedListener {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  public async handle(payload: any): Promise<void> {
    const { fulfillmentId, agentId, correlationId } = payload;
    const cid = correlationId ? CorrelationId.fromString(correlationId) : CorrelationId.create();

    console.log(`[DeliveryAgentRejectedListener] Agent #${agentId} rejected Fulfillment #${fulfillmentId}`);

    await this.fulfillmentService.rejectAgent(
      fulfillmentId,
      agentId,
      cid
    );
  }
}
