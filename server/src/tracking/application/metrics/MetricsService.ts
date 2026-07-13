/**
 * MetricsService — keeps observability counters and metrics isolated for Prometheus scraping.
 *
 * RFC-007 Phase 7F Specification
 */
export class MetricsService {
  private metrics = {
    projection_events_processed_total: 0,
    projection_events_failed_total: 0,
    projection_events_retried_total: 0,
    projection_events_dlq_total: 0,
    projection_worker_running: 0, // 0 = stopped, 1 = running
    projection_worker_cycles_total: 0,
    projection_worker_processing_time_seconds: 0,
    projection_worker_batch_size: 10,
    projection_lag_events: 0,
    projection_lag_seconds: 0,
    projection_oldest_unprocessed_seconds: 0,
    projection_replay_running: 0, // 0 = inactive, 1 = active
    projection_replay_progress: 0, // 0 to 100
    projection_replay_processed_total: 0,
    projection_replay_duration_seconds: 0,
    projection_db_queries_total: 0,
    projection_db_write_duration_seconds: 0,
    projection_db_errors_total: 0,
    projection_query_requests_total: 0,
    projection_query_latency_seconds: 0,
    projection_query_errors_total: 0
  };

  public incrementProcessed(count = 1): void {
    this.metrics.projection_events_processed_total += count;
  }

  public incrementFailed(count = 1): void {
    this.metrics.projection_events_failed_total += count;
  }

  public incrementRetried(count = 1): void {
    this.metrics.projection_events_retried_total += count;
  }

  public incrementDlq(count = 1): void {
    this.metrics.projection_events_dlq_total += count;
  }

  public setWorkerRunning(running: boolean): void {
    this.metrics.projection_worker_running = running ? 1 : 0;
  }

  public incrementCycles(count = 1): void {
    this.metrics.projection_worker_cycles_total += count;
  }

  public addProcessingTime(seconds: number): void {
    this.metrics.projection_worker_processing_time_seconds += seconds;
  }

  public setBatchSize(size: number): void {
    this.metrics.projection_worker_batch_size = size;
  }

  public setLag(events: number, seconds: number): void {
    this.metrics.projection_lag_events = events;
    this.metrics.projection_lag_seconds = seconds;
  }

  public setOldestUnprocessed(seconds: number): void {
    this.metrics.projection_oldest_unprocessed_seconds = seconds;
  }

  public setReplayRunning(running: boolean): void {
    this.metrics.projection_replay_running = running ? 1 : 0;
  }

  public setReplayProgress(progressPercentage: number): void {
    this.metrics.projection_replay_progress = progressPercentage;
  }

  public incrementReplayProcessed(count = 1): void {
    this.metrics.projection_replay_processed_total += count;
  }

  public addReplayDuration(seconds: number): void {
    this.metrics.projection_replay_duration_seconds += seconds;
  }

  public incrementDbQueries(count = 1): void {
    this.metrics.projection_db_queries_total += count;
  }

  public addDbWriteDuration(seconds: number): void {
    this.metrics.projection_db_write_duration_seconds += seconds;
  }

  public incrementDbErrors(count = 1): void {
    this.metrics.projection_db_errors_total += count;
  }

  public incrementQueryRequests(count = 1): void {
    this.metrics.projection_query_requests_total += count;
  }

  public addQueryLatency(seconds: number): void {
    this.metrics.projection_query_latency_seconds += seconds;
  }

  public incrementQueryErrors(count = 1): void {
    this.metrics.projection_query_errors_total += count;
  }

  /**
   * Serializes current metrics into Prometheus scraping text format.
   */
  public toPrometheusFormat(): string {
    let output = '';
    for (const [key, value] of Object.entries(this.metrics)) {
      output += `# HELP ${key} Metric for campusprint ${key.replace(/_/g, ' ')}\n`;
      output += `# TYPE ${key} gauge\n`;
      output += `${key} ${value}\n\n`;
    }
    return output.trim();
  }

  public getRawMetrics() {
    return { ...this.metrics };
  }
}
export const globalMetricsService = new MetricsService();
