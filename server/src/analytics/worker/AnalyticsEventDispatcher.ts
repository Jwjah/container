import { DomainEvent } from '../../tracking/domain/events/DomainEvent';

export interface AnalyticsEventHandler {
  handle(event: DomainEvent, connection?: any): Promise<void>;
}

/**
 * AnalyticsEventDispatcher — routes incoming domain events to registered analytics handlers.
 * RFC-010 Specification
 */
export class AnalyticsEventDispatcher {
  private readonly handlers = new Map<string, AnalyticsEventHandler[]>();

  public register(eventType: string, handler: AnalyticsEventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  public async dispatch(event: DomainEvent, connection?: any): Promise<void> {
    const handlers = this.handlers.get(event.eventType);
    if (!handlers || handlers.length === 0) {
      return; // Not subscribed — silently ignore
    }

    for (const handler of handlers) {
      try {
        await handler.handle(event, connection);
      } catch (err: any) {
        console.error(`🚨 [AnalyticsEventDispatcher] Handler error for ${event.eventType}:`, err.message);
        throw err;
      }
    }
  }
}
