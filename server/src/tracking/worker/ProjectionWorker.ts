import { WorkerLifecycle, WorkerState } from './WorkerLifecycle';
import { WorkerConfiguration, DefaultWorkerConfiguration } from './WorkerConfiguration';
import { IProjectionEventSource } from '../application/events/IProjectionEventSource';
import { ProjectionEventDispatcher } from '../application/dispatcher/ProjectionEventDispatcher';
import { EventOrderingValidator } from '../application/ordering/EventOrderingValidator';
import { DeadLetterService } from '../application/dlq/DeadLetterService';
import { WorkerLoop, WorkerMetrics } from './WorkerLoop';
import crypto from 'crypto';

/**
 * ProjectionWorker — orchestrates background projection processing lifecycle, configurations, metrics and loop cycles.
 *
 * RFC-007 Phase 7D Specification
 *
 * Rules:
 *  - Fully decoupled from Outbox SQL queries (communicates entirely via IProjectionEventSource).
 *  - Supports graceful shutdowns, pause/resume, and active in-flight tracking.
 */
export class ProjectionWorker implements WorkerLifecycle {
  private readonly workerId: string;
  private readonly config: WorkerConfiguration;
  private state: WorkerState = WorkerState.STOPPED;
  
  private loopTimeout: NodeJS.Timeout | null = null;
  private isProcessingCycle = false;
  private shutdownPromise: Promise<void> | null = null;

  // Tracked metrics
  private readonly metrics: WorkerMetrics = {
    eventsProcessed: 0,
    eventsSucceeded: 0,
    eventsFailed: 0,
    eventsRetried: 0,
    eventsDeadLettered: 0,
    processingTimeSumMs: 0,
    lastProcessedEventId: null,
    lastProcessedAt: null
  };

  private readonly workerLoop: WorkerLoop;

  constructor(
    private readonly eventSource: IProjectionEventSource,
    dispatcher: ProjectionEventDispatcher,
    orderingValidator: EventOrderingValidator,
    dlqService: DeadLetterService,
    config: Partial<WorkerConfiguration> = {}
  ) {
    this.workerId = `proj-worker-${crypto.randomUUID()}`;
    this.config = { ...DefaultWorkerConfiguration, ...config };
    this.workerLoop = new WorkerLoop(
      this.eventSource,
      dispatcher,
      orderingValidator,
      dlqService,
      this.config,
      this.metrics,
      this.workerId
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // WorkerLifecycle Implementation
  // ────────────────────────────────────────────────────────────────────────────

  public async start(): Promise<void> {
    if (this.state === WorkerState.RUNNING) {
      return;
    }

    this.state = WorkerState.RUNNING;
    console.log(`🚀 [ProjectionWorker] Started background worker ID: ${this.workerId}`);
    
    // Kickstart the polling cycle loop
    this.scheduleNextCycle(0);
  }

  public async stop(): Promise<void> {
    await this.gracefulShutdown();
  }

  public pause(): void {
    if (this.state !== WorkerState.RUNNING) return;
    this.state = WorkerState.PAUSED;
    console.log(`⏸️ [ProjectionWorker] Paused processing loop for worker ID: ${this.workerId}`);
    if (this.loopTimeout) {
      clearTimeout(this.loopTimeout);
      this.loopTimeout = null;
    }
  }

  public resume(): void {
    if (this.state !== WorkerState.PAUSED) return;
    this.state = WorkerState.RUNNING;
    console.log(`▶️ [ProjectionWorker] Resumed processing loop for worker ID: ${this.workerId}`);
    this.scheduleNextCycle(0);
  }

  public async gracefulShutdown(): Promise<void> {
    if (this.state === WorkerState.STOPPED) {
      return;
    }

    console.log(`🛑 [ProjectionWorker] Initiating graceful shutdown for worker ID: ${this.workerId}...`);
    this.state = WorkerState.STOPPED;

    if (this.loopTimeout) {
      clearTimeout(this.loopTimeout);
      this.loopTimeout = null;
    }

    if (this.isProcessingCycle) {
      // Create a promise to wait for the active cycle to complete
      this.shutdownPromise = new Promise<void>((resolve) => {
        const checkCycle = setInterval(() => {
          if (!this.isProcessingCycle) {
            clearInterval(checkCycle);
            resolve();
          }
        }, 100);

        // Force resolve on timeout limit to prevent hanging
        setTimeout(() => {
          clearInterval(checkCycle);
          resolve();
        }, this.config.shutdownTimeoutMs);
      });

      await this.shutdownPromise;
    }

    console.log(`✅ [ProjectionWorker] Worker ID: ${this.workerId} cleanly shut down.`);
  }

  public getState(): WorkerState {
    return this.state;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Polling Loop Orchestration
  // ────────────────────────────────────────────────────────────────────────────

  private scheduleNextCycle(delayMs: number): void {
    if (this.state !== WorkerState.RUNNING) {
      return;
    }

    this.loopTimeout = setTimeout(async () => {
      if (this.state !== WorkerState.RUNNING) return;

      this.isProcessingCycle = true;
      try {
        const processed = await this.workerLoop.executeCycle();
        
        // If we processed items, run next cycle immediately (no sleep lag) to drain queue faster.
        // Otherwise, back off to configured poll interval.
        const nextDelay = processed > 0 ? 0 : this.config.pollIntervalMs;
        this.scheduleNextCycle(nextDelay);
      } catch (err: any) {
        console.error(`[ProjectionWorker] Error during loop cycle:`, err.message);
        this.scheduleNextCycle(this.config.pollIntervalMs); // poll interval backoff on loop failure
      } finally {
        this.isProcessingCycle = false;
      }
    }, delayMs);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Observability & Diagnostics
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Expose Prometheus compatible metrics payload internally.
   */
  public getMetrics() {
    const avgTimeMs = this.metrics.eventsProcessed > 0
      ? this.metrics.processingTimeSumMs / this.metrics.eventsProcessed
      : 0;

    return {
      eventsProcessed: this.metrics.eventsProcessed,
      eventsSucceeded: this.metrics.eventsSucceeded,
      eventsFailed: this.metrics.eventsFailed,
      eventsRetried: this.metrics.eventsRetried,
      eventsDeadLettered: this.metrics.eventsDeadLettered,
      averageProcessingTimeMs: parseFloat(avgTimeMs.toFixed(2)),
      workerState: this.state
    };
  }

  /**
   * Retrieves runtime health and queue backlog sizing.
   */
  public async getHealth() {
    const lag = await this.eventSource.peekLag();
    return {
      workerId: this.workerId,
      status: this.state,
      queueLag: lag,
      lastProcessedEvent: this.metrics.lastProcessedEventId,
      lastProcessedAt: this.metrics.lastProcessedAt ? this.metrics.lastProcessedAt.toISOString() : null,
      isProcessing: this.isProcessingCycle
    };
  }
}
