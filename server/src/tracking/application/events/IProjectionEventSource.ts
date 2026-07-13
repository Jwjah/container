import { DomainEvent } from '../../domain/events/DomainEvent';

/**
 * IProjectionEventSource — interface decoupling the Projection Worker from concrete event storage.
 *
 * RFC-007 Phase 7D Specification
 */
export interface IProjectionEventSource {
  /**
   * Polls for pending events available for processing.
   */
  poll(batchSize: number): Promise<DomainEvent[]>;

  /**
   * Acquires a lease/lock on the batch of events for a specific worker.
   */
  lease(events: DomainEvent[], leaseDurationMs: number, workerId: string): Promise<void>;

  /**
   * Releases a lease/lock on the events (e.g. on temporary error or shutdown).
   */
  release(events: DomainEvent[]): Promise<void>;

  /**
   * Marks the event as successfully processed (acknowledged).
   */
  acknowledge(events: DomainEvent[]): Promise<void>;

  /**
   * Records a transient failure on the event, incrementing retry count.
   */
  markFailed(event: DomainEvent, error: string, maxRetries: number): Promise<void>;

  /**
   * Moves the event to the Dead-Letter Queue (DLQ) after retries are exhausted.
   */
  markDeadLetter(event: DomainEvent, error: string): Promise<void>;

  /**
   * Returns the count of pending/unprocessed events (lag).
   */
  peekLag(): Promise<number>;
}
