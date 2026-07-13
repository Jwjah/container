import { ProjectionEventHandler } from '../ProjectionEventHandler';
import { DomainEvent } from '../../domain/events/DomainEvent';
import { ProjectionContext } from '../ProjectionContext';
import { LifecycleState } from '../../domain/enums/LifecycleState';
import { ActorType } from '../../domain/enums/ActorType';

export class PrintJobCreatedProjectionHandler implements ProjectionEventHandler {
  public async handle(event: DomainEvent, context: ProjectionContext): Promise<void> {
    const { payload } = event;
    const orderId = Number(payload.orderId);
    const printJobId = payload.printJobId ? Number(payload.printJobId) : null;
    const printStatus = payload.printStatus || 'IN_PRODUCTION';

    await context.projectionUpdateService.transition(
      {
        orderId,
        event,
        targetState: LifecycleState.IN_PRODUCTION,
        title: 'PRINT_STARTED',
        description: 'The print shop has accepted and started printing your documents.',
        actorType: ActorType.SHOP,
        actorId: payload.shopId ? Number(payload.shopId) : null,
        metadata: {
          printJobId,
          printStatus,
          shopId: payload.shopId
        },
        applyChanges: (proj) => {
          if (printJobId) {
            proj.printJobId = printJobId;
          }
          proj.printStatus = printStatus;
        }
      },
      context.connection
    );
  }
}
