import { OrderLifecycleProjection } from '../domain/entities/OrderLifecycleProjection';
import { TimelineEvent } from '../domain/entities/TimelineEvent';
import { TrackingDTO, TimelineEventDTO } from './TrackingDTO';

export class TrackingMapper {
  public static toTrackingDTO(
    projection: OrderLifecycleProjection,
    timeline?: TimelineEvent[]
  ): TrackingDTO {
    return {
      orderId: projection.orderId,
      orderHash: projection.orderHash,
      studentId: projection.studentId,
      shopId: projection.shopId,
      shopName: projection.shopName,
      deliveryType: projection.deliveryType,
      hostelAddress: projection.hostelAddress,
      totalPrice: projection.totalPrice,
      currentState: projection.currentState,
      paymentStatus: projection.paymentStatus,
      invoiceNumber: projection.invoiceNumber,
      printJobId: projection.printJobId,
      printStatus: projection.printStatus,
      fulfillmentId: projection.fulfillmentId,
      fulfillmentStatus: projection.fulfillmentStatus,
      assignedAgentId: projection.assignedAgentId,
      agentName: projection.agentName,
      agentPhone: projection.agentPhone,
      lastProcessedVersion: projection.lastProcessedVersion,
      lastProcessedOccurredAt: projection.lastProcessedOccurredAt.toISOString(),
      version: projection.version,
      createdAt: projection.createdAt.toISOString(),
      updatedAt: projection.updatedAt.toISOString(),
      timeline: timeline ? timeline.map(t => this.toTimelineEventDTO(t)) : undefined
    };
  }

  public static toTimelineEventDTO(event: TimelineEvent): TimelineEventDTO {
    return {
      id: event.id,
      orderId: event.orderId,
      eventId: event.eventId,
      eventType: event.eventType,
      state: event.state,
      title: event.title,
      description: event.description,
      occurredAt: event.occurredAt.toISOString(),
      actorType: event.actorType,
      actorId: event.actorId,
      metadata: event.metadata,
      correlationId: event.correlationId
    };
  }
}
