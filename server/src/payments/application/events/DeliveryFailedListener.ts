import { FulfillmentService } from '../services/FulfillmentService';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';
import { FulfillmentFailureReason } from '../../domain/enums/FulfillmentFailureReason';

export class DeliveryFailedListener {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  public async handle(payload: any): Promise<void> {
    const { fulfillmentId, reason, agentId, correlationId } = payload;
    const cid = correlationId ? CorrelationId.fromString(correlationId) : CorrelationId.create();

    console.log(`[DeliveryFailedListener] Delivery failed for Fulfillment #${fulfillmentId} by Agent #${agentId}. Reason: ${reason}`);

    // Map reason safely to FulfillmentFailureReason
    let failureReason = FulfillmentFailureReason.OTHER;
    if (reason === 'STUDENT_UNAVAILABLE') {
      failureReason = FulfillmentFailureReason.STUDENT_UNAVAILABLE;
    } else if (reason === 'INVALID_ADDRESS') {
      failureReason = FulfillmentFailureReason.INVALID_ADDRESS;
    }

    await this.fulfillmentService.failDelivery(
      fulfillmentId,
      failureReason,
      agentId,
      cid
    );
  }
}
