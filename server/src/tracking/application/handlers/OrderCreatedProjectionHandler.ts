import { ProjectionEventHandler } from '../ProjectionEventHandler';
import { DomainEvent } from '../../domain/events/DomainEvent';
import { ProjectionContext } from '../ProjectionContext';
import { OrderLifecycleProjection } from '../../domain/entities/OrderLifecycleProjection';
import { LifecycleState } from '../../domain/enums/LifecycleState';
import { ActorType } from '../../domain/enums/ActorType';

export class OrderCreatedProjectionHandler implements ProjectionEventHandler {
  public async handle(event: DomainEvent, context: ProjectionContext): Promise<void> {
    const { payload } = event;

    const orderId = Number(payload.orderId);
    const orderHash = String(payload.orderHash);
    const studentId = Number(payload.studentId);
    const shopId = Number(payload.shopId);
    const shopName = String(payload.shopName);
    const deliveryType = payload.deliveryType as 'pickup' | 'hostel';
    const hostelAddress = payload.hostelAddress ? String(payload.hostelAddress) : null;
    const totalPrice = Number(payload.totalPrice);

    // Initial projection state is PENDING_PAYMENT
    const projection = new OrderLifecycleProjection(
      orderId,
      orderHash,
      studentId,
      shopId,
      shopName,
      deliveryType,
      hostelAddress,
      totalPrice,
      'PENDING_PAYMENT', // initial paymentStatus
      null,              // invoiceNumber
      null,              // printJobId
      null,              // printStatus
      null,              // fulfillmentId
      null,              // fulfillmentStatus
      null,              // assignedAgentId
      null,              // agentName
      null,              // agentPhone
      LifecycleState.PENDING_PAYMENT,
      event.eventVersion,
      event.occurredAt,
      1,                 // version
      new Date(),
      new Date()
    );

    await context.projectionUpdateService.create(
      {
        projection,
        event,
        title: 'ORDER_CREATED',
        description: `Order successfully created. Awaiting payment of ${(totalPrice / 100).toFixed(2)} INR.`,
        actorType: ActorType.STUDENT,
        actorId: studentId,
        metadata: {
          deliveryType,
          totalPrice
        }
      },
      context.connection
    );
  }
}
