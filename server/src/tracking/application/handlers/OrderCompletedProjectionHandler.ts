import { ProjectionEventHandler } from '../ProjectionEventHandler';
import { DomainEvent } from '../../domain/events/DomainEvent';
import { ProjectionContext } from '../ProjectionContext';
import { LifecycleState } from '../../domain/enums/LifecycleState';
import { ActorType } from '../../domain/enums/ActorType';

export class OrderCompletedProjectionHandler implements ProjectionEventHandler {
  public async handle(event: DomainEvent, context: ProjectionContext): Promise<void> {
    const { payload } = event;
    const orderId = Number(payload.orderId);
    const fulfillmentStatus = payload.fulfillmentStatus || 'DELIVERED';

    await context.projectionUpdateService.transition(
      {
        orderId,
        event,
        targetState: LifecycleState.DELIVERED,
        title: 'DELIVERY_COMPLETED',
        description: 'Your order has been successfully delivered and completed.',
        actorType: ActorType.SYSTEM,
        actorId: null,
        metadata: {
          fulfillmentStatus
        },
        applyChanges: (proj) => {
          proj.fulfillmentStatus = fulfillmentStatus;
        }
      },
      context.connection
    );
  }
}
