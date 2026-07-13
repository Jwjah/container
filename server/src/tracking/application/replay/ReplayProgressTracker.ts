export interface ReplayProgress {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';
  totalEvents: number;
  processedEvents: number;
  errorsCount: number;
  percentage: number;
  startedAt: Date | null;
  completedAt: Date | null;
}

/**
 * ReplayProgressTracker — thread-safe tracker representing active replay progress.
 *
 * RFC-007 Phase 7F Specification
 */
export class ReplayProgressTracker {
  private progress: ReplayProgress = {
    status: 'idle',
    totalEvents: 0,
    processedEvents: 0,
    errorsCount: 0,
    percentage: 0,
    startedAt: null,
    completedAt: null
  };

  public start(totalEvents: number): void {
    this.progress = {
      status: 'running',
      totalEvents,
      processedEvents: 0,
      errorsCount: 0,
      percentage: 0,
      startedAt: new Date(),
      completedAt: null
    };
  }

  public incrementProcessed(): void {
    if (this.progress.status !== 'running') return;
    this.progress.processedEvents++;
    this.updatePercentage();
  }

  public incrementErrors(): void {
    if (this.progress.status !== 'running') return;
    this.progress.errorsCount++;
  }

  public pause(): void {
    if (this.progress.status === 'running') {
      this.progress.status = 'paused';
    }
  }

  public resume(): void {
    if (this.progress.status === 'paused') {
      this.progress.status = 'running';
    }
  }

  public cancel(): void {
    this.progress.status = 'cancelled';
    this.progress.completedAt = new Date();
  }

  public complete(): void {
    this.progress.status = 'completed';
    this.progress.percentage = 100;
    this.progress.completedAt = new Date();
  }

  public getProgress(): ReplayProgress {
    return { ...this.progress };
  }

  private updatePercentage(): void {
    if (this.progress.totalEvents > 0) {
      this.progress.percentage = Math.floor(
        (this.progress.processedEvents / this.progress.totalEvents) * 100
      );
    } else {
      this.progress.percentage = 100;
    }
  }
}
