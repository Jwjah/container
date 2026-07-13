/**
 * WorkerConfiguration — configuration parameters for the ProjectionWorker loop.
 *
 * RFC-007 Phase 7D Specification
 */
export interface WorkerConfiguration {
  /** Size of event batches to poll from the event source. Default: 10. */
  batchSize: number;

  /** Interval to wait between polling cycles when queue is empty (ms). Default: 1000ms. */
  pollIntervalMs: number;

  /** Maximum number of processing retries before moving event to DLQ. Default: 5. */
  maxRetries: number;

  /** Lease duration acquired on events (ms). Default: 30000ms (30s). */
  leaseDurationMs: number;

  /** Timeout to wait for active events to complete during graceful shutdown (ms). Default: 5000ms. */
  shutdownTimeoutMs: number;

  /** Base millisecond duration for exponential retry backoff. Default: 1000ms. */
  backoffBaseMs: number;

  /** Maximum backoff interval between retries (ms). Default: 30000ms. */
  backoffMaxMs: number;
}

export const DefaultWorkerConfiguration: WorkerConfiguration = {
  batchSize: 10,
  pollIntervalMs: 1000,
  maxRetries: 5,
  leaseDurationMs: 30000,
  shutdownTimeoutMs: 5000,
  backoffBaseMs: 1000,
  backoffMaxMs: 30000
};
