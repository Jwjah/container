import { InvalidLifecycleTransitionError, UnsupportedLifecycleEventError, ProjectionConcurrencyError } from '../../domain/errors/TrackingErrors';
import { OutOfOrderEventError } from '../ordering/EventOrderingValidator';

/**
 * RetryPolicy — classifies errors into transient (retryable) vs permanent (DLQ).
 *
 * RFC-007 Phase 7D Specification
 */
export class RetryPolicy {
  /**
   * Returns true if the error is transient and should be retried.
   * Returns false if the error is permanent (e.g. logic/hierarchy violation) and should go straight to DLQ.
   */
  public static isTransient(error: any): boolean {
    // Permanent failures: logic or validation errors
    if (
      error instanceof InvalidLifecycleTransitionError ||
      error instanceof UnsupportedLifecycleEventError
    ) {
      return false;
    }

    // Explicit transient failures: concurrency or version ordering gaps
    if (
      error instanceof ProjectionConcurrencyError ||
      error instanceof OutOfOrderEventError
    ) {
      return true;
    }

    const msg = error?.message ?? '';
    const code = error?.code ?? '';

    // Handle database lock timeouts, lock conflicts, and deadlocks as transient
    if (
      msg.includes('database is locked') ||
      msg.includes('SQLITE_BUSY') ||
      code === 'SQLITE_BUSY' ||
      code === 'ER_LOCK_DEADLOCK' ||
      code === 'ER_LOCK_WAIT_TIMEOUT' ||
      msg.includes('deadlock') ||
      msg.includes('lock wait timeout')
    ) {
      return true;
    }

    // Default to transient for system/infrastructure failures (e.g. lost db connection, network, etc.)
    return true;
  }
}
