import { ProjectionEventHandler } from './ProjectionEventHandler';

/**
 * ProjectionEventHandlerRegistry — registry resolving domain event types to handlers.
 *
 * RFC-007 §39
 */
export class ProjectionEventHandlerRegistry {
  private handlers: Map<string, ProjectionEventHandler> = new Map();

  /**
   * Register a new handler for a specific event type.
   */
  public register(eventType: string, handler: ProjectionEventHandler): void {
    this.handlers.set(eventType, handler);
  }

  /**
   * Lookup and return the handler registered for the event type.
   * Throws an error if no handler is registered.
   */
  public get(eventType: string): ProjectionEventHandler {
    const handler = this.handlers.get(eventType);
    if (!handler) {
      throw new Error(`No projection event handler registered for event type "${eventType}"`);
    }
    return handler;
  }

  /**
   * Returns true if there is a handler registered for the event type.
   */
  public has(eventType: string): boolean {
    return this.handlers.has(eventType);
  }
}
