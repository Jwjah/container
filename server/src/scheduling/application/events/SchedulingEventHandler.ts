import { DomainEvent } from '../../../tracking/domain/events/DomainEvent';
import { SchedulingContext } from './SchedulingContext';

export interface SchedulingEventHandler {
  handle(event: DomainEvent, context: SchedulingContext): Promise<void>;
}
