import db from '../../../config/database';
import { SchedulingEventSource } from '../../worker/SchedulingEventSource';

/**
 * SchedulingMetricsService — exposes key performance indicators (KPIs) in Prometheus registry format.
 *
 * RFC-008 Part 9 Specification
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
      `scheduling_low_stock_items_count ${lowStock}`
    ].join('\n');
  }
}
