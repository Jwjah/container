import { DeliveryAssignmentStatus } from '../enums/DeliveryAssignmentStatus';

export class DeliveryAssignment {
  public domainEvents: any[] = [];

  constructor(
    public readonly id: number,
    public readonly fulfillmentId: number,
    public readonly orderId: number,
    public readonly shopId: number,
    public readonly studentId: number,
    public readonly agentId: number,
    public status: DeliveryAssignmentStatus,
    public correlationId: string,
    public version: number,
    public readonly createdAt: Date,
    public updatedAt: Date
  ) {}

  public static create(
    fulfillmentId: number,
    orderId: number,
    shopId: number,
    studentId: number,
    agentId: number,
    correlationId: string
  ): DeliveryAssignment {
    const now = new Date();
    const assignment = new DeliveryAssignment(
      0,
      fulfillmentId,
      orderId,
      shopId,
      studentId,
      agentId,
      DeliveryAssignmentStatus.ASSIGNED,
      correlationId,
      1,
      now,
      now
    );

    assignment.domainEvents.push({
      eventName: 'DELIVERY_AGENT_ASSIGNED',
      payload: {
        deliveryAssignmentId: assignment.id,
        fulfillmentId,
        orderId,
        shopId,
        studentId,
        agentId,
        correlationId
      }
    });

    return assignment;
  }

  public accept(): void {
    this.assertNotTerminal();
    this.assertStatus(DeliveryAssignmentStatus.ASSIGNED, 'accept');

    const now = new Date();
    this.status = DeliveryAssignmentStatus.EN_ROUTE_TO_SHOP;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'DELIVERY_AGENT_ACCEPTED',
      payload: {
        deliveryAssignmentId: this.id,
        fulfillmentId: this.fulfillmentId,
        orderId: this.orderId,
        agentId: this.agentId,
        correlationId: this.correlationId
      }
    });

    this.domainEvents.push({
      eventName: 'DELIVERY_PICKUP_STARTED',
      payload: {
        deliveryAssignmentId: this.id,
        fulfillmentId: this.fulfillmentId,
        orderId: this.orderId,
        agentId: this.agentId,
        correlationId: this.correlationId
      }
    });
  }

  public reject(): void {
    this.assertNotTerminal();
    this.assertStatus(DeliveryAssignmentStatus.ASSIGNED, 'reject');

    const now = new Date();
    this.status = DeliveryAssignmentStatus.REJECTED;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'DELIVERY_AGENT_REJECTED',
      payload: {
        deliveryAssignmentId: this.id,
        fulfillmentId: this.fulfillmentId,
        orderId: this.orderId,
        agentId: this.agentId,
        correlationId: this.correlationId
      }
    });

    this.domainEvents.push({
      eventName: 'DELIVERY_AGENT_AVAILABLE',
      payload: {
        agentId: this.agentId,
        correlationId: this.correlationId
      }
    });
  }

  public pickup(): void {
    this.assertNotTerminal();
    this.assertStatus(DeliveryAssignmentStatus.EN_ROUTE_TO_SHOP, 'pickup');

    const now = new Date();
    this.status = DeliveryAssignmentStatus.DELIVERING;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'DELIVERY_PICKUP_COMPLETED',
      payload: {
        deliveryAssignmentId: this.id,
        fulfillmentId: this.fulfillmentId,
        orderId: this.orderId,
        agentId: this.agentId,
        correlationId: this.correlationId
      }
    });
  }

  public complete(): void {
    this.assertNotTerminal();
    this.assertStatus(DeliveryAssignmentStatus.DELIVERING, 'complete');

    const now = new Date();
    this.status = DeliveryAssignmentStatus.DELIVERED;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'DELIVERY_COMPLETED',
      payload: {
        deliveryAssignmentId: this.id,
        fulfillmentId: this.fulfillmentId,
        orderId: this.orderId,
        agentId: this.agentId,
        correlationId: this.correlationId
      }
    });

    this.domainEvents.push({
      eventName: 'DELIVERY_AGENT_AVAILABLE',
      payload: {
        agentId: this.agentId,
        correlationId: this.correlationId
      }
    });
  }

  public fail(): void {
    this.assertNotTerminal();
    this.assertStatus(DeliveryAssignmentStatus.DELIVERING, 'fail');

    const now = new Date();
    this.status = DeliveryAssignmentStatus.FAILED;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'DELIVERY_FAILED',
      payload: {
        deliveryAssignmentId: this.id,
        fulfillmentId: this.fulfillmentId,
        orderId: this.orderId,
        agentId: this.agentId,
        correlationId: this.correlationId
      }
    });

    this.domainEvents.push({
      eventName: 'DELIVERY_AGENT_AVAILABLE',
      payload: {
        agentId: this.agentId,
        correlationId: this.correlationId
      }
    });
  }

  private assertNotTerminal(): void {
    if (
      this.status === DeliveryAssignmentStatus.DELIVERED ||
      this.status === DeliveryAssignmentStatus.REJECTED ||
      this.status === DeliveryAssignmentStatus.FAILED
    ) {
      throw new Error(`Cannot transition delivery assignment from terminal status: ${this.status}`);
    }
  }

  private assertStatus(expected: DeliveryAssignmentStatus, action: string): void {
    if (this.status !== expected) {
      throw new Error(
        `Cannot perform '${action}' action: expected status to be ${expected}, but got ${this.status}`
      );
    }
  }
}
