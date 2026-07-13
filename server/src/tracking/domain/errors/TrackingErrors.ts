/**
 * UnsupportedLifecycleEventError — thrown when an event type is passed
 * that cannot be mapped to any known LifecycleState.
 */
export class UnsupportedLifecycleEventError extends Error {
  constructor(eventType: string) {
    super(`Unsupported or unmapped lifecycle event type: "${eventType}"`);
    this.name = 'UnsupportedLifecycleEventError';
  }
}

/**
 * InvalidLifecycleTransitionError — thrown when trying to perform an
 * illegal transition in the order lifecycle state machine.
 */
export class InvalidLifecycleTransitionError extends Error {
  constructor(fromState: string, toState: string, orderId: number) {
    super(
      `Invalid lifecycle transition from "${fromState}" to "${toState}" for order ID ${orderId}`
    );
    this.name = 'InvalidLifecycleTransitionError';
  }
}

/**
 * ProjectionConcurrencyError — thrown when an optimistic lock conflict is detected.
 * Callers must catch this and retry the event processing transaction.
 *
 * RFC-007 §21 — Optimistic Concurrency
 */
export class ProjectionConcurrencyError extends Error {
  constructor(orderId: number) {
    super(
      `Optimistic lock conflict on projection for orderId=${orderId}. ` +
      `Another worker updated this row concurrently. Retry required.`
    );
    this.name = 'ProjectionConcurrencyError';
  }
}

