import { FulfillmentService } from '../services/FulfillmentService';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';

export class DeliveryAgentAssignedListener {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  public async handle(payload: any): Promise<void> {
    const { fulfillmentId, agentId, userId, correlationId } = payload;
    const cid = correlationId ? CorrelationId.fromString(correlationId) : CorrelationId.create();

    console.log(`[DeliveryAgentAssignedListener] Reassigning agent to Agent #${agentId} for Fulfillment #${fulfillmentId}`);

    const performerId = userId || 0;

    await this.fulfillmentService.reassignAgent(
      fulfillmentId,
      agentId,
      performerId,
      cid
    );
  }
}
