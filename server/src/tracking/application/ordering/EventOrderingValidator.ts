import { IOrderLifecycleProjectionRepository } from '../../interfaces/IOrderLifecycleProjectionRepository';
import { DomainEvent } from '../../domain/events/DomainEvent';

/**
 * OutOfOrderEventError — thrown when a version gap is detected (e.g. processing version 3 before 2).
 * Triggers a retry so the missing event can be processed first.
 */
export class OutOfOrderEventError extends Error {
  constructor(orderId: number, expectedVersion: number, actualVersion: number) {
    super(
      `Out of order event for order ID ${orderId}. ` +
      `Expected version ${expectedVersion}, but received event version ${actualVersion}.`
    );
    this.name = 'OutOfOrderEventError';
  }
}

/**
 * EventOrderingValidator — enforces version ordering per aggregate.
 *
 * RFC-007 Phase 7D Specification
 */
export class EventOrderingValidator {
  constructor(private readonly projRepo: IOrderLifecycleProjectionRepository) {}

  /**
   * Asserts that the event follows the strictly expected version sequence.
   * Throws OutOfOrderEventError if there is a sequence gap.
   */
  public async assertOrdering(event: DomainEvent, connection?: any): Promise<void> {
    const orderId = Number(event.payload.orderId);
    if (isNaN(orderId)) return; // Skip sequence checks if payload lacks orderId

    const proj = await this.projRepo.findByOrderId(orderId, connection);

    if (proj) {
      const nextExpected = proj.lastProcessedVersion + 1;
      if (event.eventVersion > nextExpected) {
        throw new OutOfOrderEventError(orderId, nextExpected, event.eventVersion);
      }
    } else {
      // If projection does not exist, the first event MUST be version 1 (typically ORDER_CREATED)
      if (event.eventVersion > 1) {
        throw new OutOfOrderEventError(orderId, 1, event.eventVersion);
      }
    }
  }
}
