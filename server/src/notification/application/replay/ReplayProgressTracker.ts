export interface ReplayProgress {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  processedCount: number;
  totalCount: number;
  errorMessage: string | null;
}

/**
 * ReplayProgressTracker — monitors state of async background rebuild progress.
 *
 * RFC-009 Specification
 */
export class ReplayProgressTracker {
  private status: 'idle' | 'processing' | 'completed' | 'failed' = 'idle';
  private processedCount = 0;
  private totalCount = 0;
  private errorMessage: string | null = null;

  public start(total: number): void {
    this.status = 'processing';
    this.totalCount = total;
    this.processedCount = 0;
    this.errorMessage = null;
  }

  public increment(count = 1): void {
    this.processedCount += count;
    if (this.processedCount >= this.totalCount) {
      this.status = 'completed';
    }
  }

  public complete(): void {
    this.status = 'completed';
    this.processedCount = this.totalCount;
  }

  public fail(message: string): void {
    this.status = 'failed';
    this.errorMessage = message;
  }

  public getProgress(): ReplayProgress {
    return {
      status: this.status,
      processedCount: this.processedCount,
      totalCount: this.totalCount,
      errorMessage: this.errorMessage
    };
  }
}
