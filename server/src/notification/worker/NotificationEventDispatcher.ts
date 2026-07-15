import { DomainEvent } from '../../tracking/domain/events/DomainEvent';

export interface NotificationEventHandler {
  handle(event: DomainEvent, connection?: any): Promise<void>;
}

/**
 * NotificationEventDispatcher — routes incoming events to registered context event handlers.
 *
 * RFC-009 Specification
 */
export class NotificationEventDispatcher {
  private readonly handlers = new Map<string, NotificationEventHandler[]>();

  public register(eventType: string, handler: NotificationEventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  public async dispatch(event: DomainEvent, connection?: any): Promise<void> {
    const handlers = this.handlers.get(event.eventType);
    if (!handlers || handlers.length === 0) {
      // Event not registered/subscribed inside this context. Ignore.
      return;
    }

    for (const handler of handlers) {
      try {
        await handler.handle(event, connection);
      } catch (err: any) {
        console.error(`🚨 [NotificationEventDispatcher] Handler error for ${event.eventType}:`, err.message);
        throw err;
      }
    }
  }
}
