import { ProjectionEventHandler } from '../ProjectionEventHandler';
import { DomainEvent } from '../../domain/events/DomainEvent';
import { ProjectionContext } from '../ProjectionContext';
import { LifecycleState } from '../../domain/enums/LifecycleState';
import { ActorType } from '../../domain/enums/ActorType';

export class DeliveryAssignedProjectionHandler implements ProjectionEventHandler {
  public async handle(event: DomainEvent, context: ProjectionContext): Promise<void> {
    const { payload } = event;
    const orderId = Number(payload.orderId);
    const assignedAgentId = payload.assignedAgentId ? Number(payload.assignedAgentId) : (payload.agentId ? Number(payload.agentId) : null);
    const agentName = payload.agentName ? String(payload.agentName) : null;
    const agentPhone = payload.agentPhone ? String(payload.agentPhone) : null;
    const fulfillmentStatus = payload.fulfillmentStatus || 'OUT_FOR_DELIVERY';

    await context.projectionUpdateService.transition(
      {
        orderId,
        event,
        targetState: LifecycleState.OUT_FOR_DELIVERY,
        title: 'OUT_FOR_DELIVERY',
        description: agentName
          ? `Delivery agent ${agentName} is bringing your package.`
          : 'Your order is out for delivery with our agent.',
        actorType: ActorType.AGENT,
        actorId: assignedAgentId,
        metadata: {
          assignedAgentId,
          agentName,
          agentPhone,
          fulfillmentStatus
        },
        applyChanges: (proj) => {
          if (assignedAgentId) {
            proj.assignedAgentId = assignedAgentId;
          }
          if (agentName) {
            proj.agentName = agentName;
          }
          if (agentPhone) {
            proj.agentPhone = agentPhone;
          }
          proj.fulfillmentStatus = fulfillmentStatus;
        }
      },
      context.connection
    );
  }
}
