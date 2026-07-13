/**
 * WorkerState — current run state of the background worker.
 */
export enum WorkerState {
  STOPPED = 'STOPPED',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED'
}

/**
 * WorkerLifecycle — contract for worker lifecycle operations.
 *
 * RFC-007 Phase 7D Specification
 */
export interface WorkerLifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): void;
  resume(): void;
  gracefulShutdown(): Promise<void>;
  getState(): WorkerState;
}
