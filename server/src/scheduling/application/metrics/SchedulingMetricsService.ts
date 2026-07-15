import db from '../../../config/database';
import { SchedulingEventSource } from '../../worker/SchedulingEventSource';
import { SchedulingEngine } from '../services/SchedulingEngine';
import { QueueService } from '../services/QueueService';
import { SchedulingReplayService } from '../replay/SchedulingReplayService';

/**
 * SchedulingMetricsService — exposes expanded KPIs in Prometheus monitoring registry format.
 *
 * RFC-008 Refinement 3 Specification
 */
export class SchedulingMetricsService {
  constructor(private readonly source: SchedulingEventSource) {}

  /**
   * Generates Prometheus compliant monitoring text block.
   */
  public async getMetricsString(): Promise<string> {
    const lag = await this.source.peekLag();

    // 1. Get processed event count
    const [processedRows] = await db.execute('SELECT COUNT(*) AS total FROM scheduling_processed_events');
    const processedCount = Number((processedRows as any[])[0]?.total ?? 0);

    // 2. Get active printers count
    const [printerRows] = await db.execute("SELECT COUNT(*) AS total FROM scheduling_printers WHERE status = 'available'");
    const activePrinters = Number((printerRows as any[])[0]?.total ?? 0);

    // 3. Get pending slot count
    const [slotRows] = await db.execute("SELECT COUNT(*) AS total FROM scheduling_print_queue WHERE status = 'pending'");
    const activeSlots = Number((slotRows as any[])[0]?.total ?? 0);

    // 4. Get low stock inventory items count
    const [invRows] = await db.execute('SELECT COUNT(*) AS total FROM scheduling_inventory WHERE quantity <= low_stock_threshold');
    const lowStock = Number((invRows as any[])[0]?.total ?? 0);

    // 5. Calculate average queue wait time in seconds (JS-based calculation)
    const [slotsData] = await db.execute(
      "SELECT estimated_start_time, estimated_completion_time FROM scheduling_print_queue WHERE status IN ('pending', 'printing')"
    );
    let totalWaitSeconds = 0;
    const now = Date.now();

    for (const s of slotsData as any[]) {
      const start = new Date(s.estimated_start_time).getTime();
      const end = new Date(s.estimated_completion_time).getTime();
      totalWaitSeconds += Math.max(0, (end - start) / 1000);
    }
    const avgWait = (slotsData as any[]).length > 0
      ? Math.floor(totalWaitSeconds / (slotsData as any[]).length)
      : 0;

    // 6. Calculate general printer utilization percent
    const printerCapacityHourMs = Math.max(1, activePrinters) * 60 * 60 * 1000;
    const [durationRows] = await db.execute(
      "SELECT SUM(pages_count) AS total_pages FROM scheduling_print_queue WHERE status IN ('pending', 'printing')"
    );
    const totalPages = Number((durationRows as any[])[0]?.total_pages ?? 0);
    // Assumes average printer speed of 20 ppm to estimate active duration in ms
    const estimatedDurationMs = (totalPages / 20) * 60 * 1000;
    const printerUtilization = Math.min(100, Math.floor((estimatedDurationMs / printerCapacityHourMs) * 100));

    // 7. Get inventory paper days remaining
    const [paperRows] = await db.execute("SELECT quantity FROM scheduling_inventory WHERE type = 'paper'");
    const totalPaper = Number((paperRows as any[])[0]?.quantity ?? 0);
    const paperDaysRemaining = Math.max(0, Math.floor(totalPaper / 200)); // assumes 200 pages daily

    return [
      '# HELP scheduling_processed_events_total Cumulative count of processed domain events in scheduling.',
      '# TYPE scheduling_processed_events_total counter',
      `scheduling_processed_events_total ${processedCount}`,
      '',
      '# HELP scheduling_queue_lag_events Unprocessed event counts inside the outbox table.',
      '# TYPE scheduling_queue_lag_events gauge',
      `scheduling_queue_lag_events ${lag}`,
      '',
      '# HELP scheduling_active_printers_count Active available printer count.',
      '# TYPE scheduling_active_printers_count gauge',
      `scheduling_active_printers_count ${activePrinters}`,
      '',
      '# HELP scheduling_active_slots_count Number of jobs currently queued and pending.',
      '# TYPE scheduling_active_slots_count gauge',
      `scheduling_active_slots_count ${activeSlots}`,
      '',
      '# HELP scheduling_low_stock_items_count Number of inventory supplies running below low thresholds.',
      '# TYPE scheduling_low_stock_items_count gauge',
      `scheduling_low_stock_items_count ${lowStock}`,
      '',
      '# HELP printer_utilization_percent General utilization level of available hardware resources.',
      '# TYPE printer_utilization_percent gauge',
      `printer_utilization_percent ${printerUtilization}`,
      '',
      '# HELP average_queue_wait_seconds Expected queue wait duration in seconds.',
      '# TYPE average_queue_wait_seconds gauge',
      `average_queue_wait_seconds ${avgWait}`,
      '',
      '# HELP forecast_overload_seconds Advisory duration remaining before wait limits are reached.',
      '# TYPE forecast_overload_seconds gauge',
      `forecast_overload_seconds ${Math.max(0, 7200 - avgWait)}`,
      '',
      '# HELP inventory_days_remaining Estimated depletion time in days.',
      '# TYPE inventory_days_remaining gauge',
      `inventory_days_remaining ${paperDaysRemaining}`,
      '',
      '# HELP scheduler_decisions_total Cumulative count of scheduling decisions.',
      '# TYPE scheduler_decisions_total counter',
      `scheduler_decisions_total ${SchedulingEngine.schedulerDecisionsCount}`,
      '',
      '# HELP printer_failovers_total Cumulative count of printer offline rescheduling failovers.',
      '# TYPE printer_failovers_total counter',
      `printer_failovers_total ${QueueService.printerFailoversCount}`,
      '',
      '# HELP snapshot_replays_total Cumulative count of snapshot restoration replay loops.',
      '# TYPE snapshot_replays_total counter',
      `snapshot_replays_total ${SchedulingReplayService.snapshotReplaysCount}`
    ].join('\n');
  }
}
