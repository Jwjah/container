import { IProjectionEventSource } from '../events/IProjectionEventSource';
import { DomainEvent } from '../../domain/events/DomainEvent';

/**
 * DeadLetterService — handles formatting and logging of permanently failed events.
 *
 * RFC-007 Phase 7D Specification
 */
export class DeadLetterService {
  constructor(private readonly eventSource: IProjectionEventSource) {}

  /**
   * Route a failed event to the dead letter queue storage.
   */
  public async sendToDeadLetter(event: DomainEvent, error: Error): Promise<void> {
    const errorMsg = error.stack || error.message || 'Unknown processing error';
    
    console.error(
      `🚨 [DeadLetterService] Moving event ID "${event.eventId}" (type: ${event.eventType}) ` +
      `to DLQ. Error: ${error.message}`
    );

    try {
      await this.eventSource.markDeadLetter(event, errorMsg);
    } catch (dlqErr: any) {
      console.error(
        `💥 [DeadLetterService] CRITICAL: Failed to write event "${event.eventId}" to DLQ! ` +
        `DLQ Error: ${dlqErr.message}. Original Error: ${error.message}`
      );
    }
  }
}
