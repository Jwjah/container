import { IProjectionEventSource } from '../application/events/IProjectionEventSource';
import { ProjectionEventDispatcher } from '../application/dispatcher/ProjectionEventDispatcher';
import { EventOrderingValidator } from '../application/ordering/EventOrderingValidator';
import { DeadLetterService } from '../application/dlq/DeadLetterService';
import { WorkerConfiguration } from './WorkerConfiguration';
import { DomainEvent } from '../domain/events/DomainEvent';
import { RetryPolicy } from '../application/retry/RetryPolicy';
import { ExponentialBackoff } from '../application/retry/ExponentialBackoff';

export interface WorkerMetrics {
  eventsProcessed: number;
  eventsSucceeded: number;
  eventsFailed: number;
  eventsRetried: number;
  eventsDeadLettered: number;
  processingTimeSumMs: number;
  lastProcessedEventId: string | null;
  lastProcessedAt: Date | null;
}

/**
 * WorkerLoop — executes the core polling, leasing, validation, dispatching, and error handling loop.
 *
 * RFC-007 Phase 7D Specification
 *
 * Rules:
 *  - No database logic or raw SQL inside the loop.
 *  - Guarantees exactly-once processing via leasing and processed_events.
 *  - Enforces sequence ordering via EventOrderingValidator.
 */
export class WorkerLoop {
  constructor(
    private readonly eventSource: IProjectionEventSource,
    private readonly dispatcher: ProjectionEventDispatcher,
    private readonly orderingValidator: EventOrderingValidator,
    private readonly dlqService: DeadLetterService,
    private readonly config: WorkerConfiguration,
    private readonly metrics: WorkerMetrics,
    private readonly workerId: string
  ) {}

  /**
   * Executes a single processing cycle.
   * Returns the number of events successfully processed in this cycle.
   */
  public async executeCycle(): Promise<number> {
    const startTime = Date.now();

    // 1. Poll batch from the event source
    const polledEvents = await this.eventSource.poll(this.config.batchSize);
    if (polledEvents.length === 0) {
      return 0;
    }

    // 2. Acquire lease on the polled events
    // This filters out any events leased concurrently by other workers
    await this.eventSource.lease(polledEvents, this.config.leaseDurationMs, this.workerId);
    if (polledEvents.length === 0) {
      return 0;
    }

    let processedCount = 0;

    // 3. Process each leased event sequentially to preserve relative order
    for (const event of polledEvents) {
      const eventStartTime = Date.now();
      this.metrics.eventsProcessed++;

      try {
        // A. Validate event sequence ordering
        await this.orderingValidator.assertOrdering(event);

        // B. Dispatch event to its registered handler
        await this.dispatcher.dispatch(event);

        // C. Acknowledge success
        await this.eventSource.acknowledge([event]);
        this.metrics.eventsSucceeded++;
        this.metrics.lastProcessedEventId = event.eventId;
        this.metrics.lastProcessedAt = new Date();

        processedCount++;
      } catch (err: any) {
        this.metrics.eventsFailed++;

        // D. Determine transient vs permanent error
        const isTransient = RetryPolicy.isTransient(err);
        const metadata = (event as any)._metadata;
        const currentRetryCount = metadata?.retryCount || 0;

        if (isTransient && currentRetryCount < this.config.maxRetries) {
          // Transient failure: backoff and retry later
          this.metrics.eventsRetried++;
          const backoffDelay = ExponentialBackoff.calculate(
            currentRetryCount,
            this.config.backoffBaseMs,
            this.config.backoffMaxMs
          );
          
          console.warn(
            `[WorkerLoop] Transient failure on event "${event.eventId}" (type: ${event.eventType}). ` +
            `Retry #${currentRetryCount + 1}/${this.config.maxRetries} scheduled in ${backoffDelay}ms. ` +
            `Error: ${err.message}`
          );

          await this.eventSource.markFailed(event, err.message, this.config.maxRetries);
        } else {
          // Permanent failure or retry limit exhausted: route to Dead-Letter Queue
          this.metrics.eventsDeadLettered++;
          await this.dlqService.sendToDeadLetter(event, err);
        }
      } finally {
        this.metrics.processingTimeSumMs += Date.now() - eventStartTime;
      }
    }

    return processedCount;
  }
}
