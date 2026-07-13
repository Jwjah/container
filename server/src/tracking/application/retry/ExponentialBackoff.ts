/**
 * ExponentialBackoff — utility to calculate backoff delays for transient errors.
 *
 * RFC-007 Phase 7D Specification
 */
export class ExponentialBackoff {
  /**
   * Calculate retry delay with exponential backoff and randomized jitter to prevent thundering herd.
   */
  public static calculate(
    retryCount: number,
    baseMs: number,
    maxMs: number
  ): number {
    const delay = Math.min(maxMs, baseMs * Math.pow(2, retryCount));
    // Apply 10% random jitter
    const jitter = delay * 0.1 * Math.random();
    return Math.floor(delay + jitter);
  }
}
