import { ProjectionEventHandlerRegistry } from '../ProjectionEventHandlerRegistry';
import { ProjectionUpdateService } from '../ProjectionUpdateService';
import { DomainEvent } from '../../domain/events/DomainEvent';
import { ProjectionContext } from '../ProjectionContext';

/**
 * ProjectionEventDispatcher — dispatches domain events to their mapped projection handlers.
 *
 * RFC-007 Phase 7D Specification
 *
 * Rules:
 *  - Must not access repositories directly.
 *  - Looks up handlers via ProjectionEventHandlerRegistry.
 *  - Executes handlers inside a consistent ProjectionContext.
 */
export class ProjectionEventDispatcher {
  constructor(
    private readonly registry: ProjectionEventHandlerRegistry,
    private readonly updateService: ProjectionUpdateService
  ) {}

  /**
   * Dispatches the event to the registered handler.
   * Returns true on success, or throws/re-throws processing errors.
   */
  public async dispatch(event: DomainEvent, connection?: any): Promise<boolean> {
    console.log(`[ProjectionEventDispatcher] Dispatching event "${event.eventType}" (id=${event.eventId}, orderId=${event.payload?.orderId})`);

    if (!this.registry.has(event.eventType)) {
      console.log(`[ProjectionEventDispatcher] No handler registered for event type "${event.eventType}". Skipping.`);
      return false;
    }

    const handler = this.registry.get(event.eventType);
    const context: ProjectionContext = {
      projectionUpdateService: this.updateService,
      connection
    };

    await handler.handle(event, context);
    return true;
  }
}
