import { DeliveryAssignmentService } from '../services/DeliveryAssignmentService';

export class FulfillmentAssignedListener {
  constructor(private readonly assignmentService: DeliveryAssignmentService) {}

  public async handle(payload: any): Promise<void> {
    const { fulfillmentId, orderId, shopId, studentId, assignedAgentId, printJobId, correlationId } = payload;

    console.log(`[FulfillmentAssignedListener] Creating delivery assignment for Fulfillment #${fulfillmentId} assigned to Agent #${assignedAgentId}`);

    const cid = correlationId || `cid-${Date.now()}`;

    await this.assignmentService.createAssignment(
      fulfillmentId,
      orderId,
      shopId,
      studentId,
      assignedAgentId,
      printJobId,
      cid
    );
  }
}
