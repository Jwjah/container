import { OutboxEvent } from '../../domain/entities/OutboxEvent';

export class EventDispatcher {
  private listeners: Map<string, Array<(payload: any) => Promise<void>>> = new Map();

  public register(eventType: string, handler: (payload: any) => Promise<void>): void {
    const list = this.listeners.get(eventType) || [];
    list.push(handler);
    this.listeners.set(eventType, list);
  }

  public async dispatch(event: OutboxEvent): Promise<void> {
    const handlers = this.listeners.get(event.eventType) || [];
    const payload = JSON.parse(event.payload);
    const errors: Error[] = [];

    // Execute all consumers in isolation (Fault Isolation)
    for (const handler of handlers) {
      try {
        await handler(payload);
      } catch (err: any) {
        console.error(`[EventDispatcher] Consumer execution failure on event ${event.eventType}: ${err.message}`);
        errors.push(err);
      }
    }

    // If any consumer failed, throw aggregate error so the worker retries the outbox event
    if (errors.length > 0) {
      throw new Error(`Event dispatch completed with ${errors.length} consumer failure(s): ${errors.map(e => e.message).join('; ')}`);
    }
  }
}
