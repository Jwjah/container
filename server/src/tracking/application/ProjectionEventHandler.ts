import { DomainEvent } from '../domain/events/DomainEvent';
import { ProjectionContext } from './ProjectionContext';

/**
 * ProjectionEventHandler — thin adapter interface for event-specific mapping logic.
 *
 * RFC-007 §39
 */
export interface ProjectionEventHandler {
  handle(event: DomainEvent, context: ProjectionContext): Promise<void>;
}
