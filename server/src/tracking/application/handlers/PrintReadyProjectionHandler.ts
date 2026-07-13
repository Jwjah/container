import { ProjectionEventHandler } from '../ProjectionEventHandler';
import { DomainEvent } from '../../domain/events/DomainEvent';
import { ProjectionContext } from '../ProjectionContext';
import { LifecycleState } from '../../domain/enums/LifecycleState';
import { ActorType } from '../../domain/enums/ActorType';

export class PrintReadyProjectionHandler implements ProjectionEventHandler {
  public async handle(event: DomainEvent, context: ProjectionContext): Promise<void> {
    const { payload } = event;
    const orderId = Number(payload.orderId);
    const printStatus = payload.printStatus || 'READY';
    const fulfillmentId = payload.fulfillmentId ? Number(payload.fulfillmentId) : null;
    const fulfillmentStatus = payload.fulfillmentStatus || null;

    await context.projectionUpdateService.transition(
      {
        orderId,
        event,
        targetState: LifecycleState.READY_FOR_PICKUP,
        title: 'PRINT_READY',
        description: 'Your printed order is ready at the shop counter.',
        actorType: ActorType.SHOP,
        actorId: payload.shopId ? Number(payload.shopId) : null,
        metadata: {
          printStatus,
          fulfillmentId,
          fulfillmentStatus,
          shopId: payload.shopId
        },
        applyChanges: (proj) => {
          proj.printStatus = printStatus;
          if (fulfillmentId) {
            proj.fulfillmentId = fulfillmentId;
          }
          if (fulfillmentStatus) {
            proj.fulfillmentStatus = fulfillmentStatus;
          }
        }
      },
      context.connection
    );
  }
}
