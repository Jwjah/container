/**
 * ReplayProgressTracker — tracks running state and completions for execution queries.
 *
 * RFC-008 Part 10 Specification
 */
export class ReplayProgressTracker {
  private totalEvents: number = 0;
  private processedCount: number = 0;
  private status: 'idle' | 'running' | 'completed' | 'failed' = 'idle';
  private errorMessage: string | null = null;

  public start(total: number): void {
    this.totalEvents = total;
    this.processedCount = 0;
    this.status = 'running';
    this.errorMessage = null;
  }

  public update(processed: number): void {
    this.processedCount = processed;
    if (this.processedCount >= this.totalEvents) {
      this.status = 'completed';
    }
  }

  public fail(message: string): void {
    this.status = 'failed';
    this.errorMessage = message;
  }

  public getProgress(): {
    status: string;
    totalEvents: number;
    processedCount: number;
    progressPercentage: number;
    error: string | null;
  } {
    const progressPercentage = this.totalEvents > 0 
      ? Math.min(100, Math.floor((this.processedCount / this.totalEvents) * 100))
      : 0;

    return {
      status: this.status,
      totalEvents: this.totalEvents,
      processedCount: this.processedCount,
      progressPercentage,
      error: this.errorMessage
    };
  }
}
export const globalReplayProgressTracker = new ReplayProgressTracker();
