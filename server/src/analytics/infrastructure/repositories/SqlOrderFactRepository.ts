import { IOrderFactRepository } from '../../interfaces/IOrderFactRepository';
import { OrderFact } from '../../domain/entities/OrderFact';
import db from '../../../config/database';

/**
 * SqlOrderFactRepository — persists immutable per-order facts to analytics_order_facts.
 * RFC-010 Specification
 */
export class SqlOrderFactRepository implements IOrderFactRepository {
  private toEntity(row: any): OrderFact {
    return new OrderFact(
      row.id,
      Number(row.order_id),
      Number(row.shop_id),
      Number(row.user_id),
      row.date,
      Number(row.revenue),
      Number(row.page_count),
      Boolean(Number(row.is_color)),
      new Date(row.order_created_at),
      row.payment_confirmed_at ? new Date(row.payment_confirmed_at) : null,
      row.print_started_at ? new Date(row.print_started_at) : null,
      row.print_completed_at ? new Date(row.print_completed_at) : null,
      row.delivery_completed_at ? new Date(row.delivery_completed_at) : null,
      row.cancelled_at ? new Date(row.cancelled_at) : null,
      new Date(row.created_at)
    );
  }

  async findByOrderId(orderId: number, connection?: any): Promise<OrderFact | null> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      'SELECT * FROM analytics_order_facts WHERE order_id = ? LIMIT 1',
      [orderId]
    );
    const arr = rows as any[];
    return arr.length > 0 ? this.toEntity(arr[0]) : null;
  }

  async findByShopId(shopId: number, limit = 100, connection?: any): Promise<OrderFact[]> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      'SELECT * FROM analytics_order_facts WHERE shop_id = ? ORDER BY order_created_at DESC LIMIT ?',
      [shopId, limit]
    );
    return (rows as any[]).map(r => this.toEntity(r));
  }

  async findByUserId(userId: number, limit = 50, connection?: any): Promise<OrderFact[]> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      'SELECT * FROM analytics_order_facts WHERE user_id = ? ORDER BY order_created_at DESC LIMIT ?',
      [userId, limit]
    );
    return (rows as any[]).map(r => this.toEntity(r));
  }

  async findByDateRange(startDate: string, endDate: string, connection?: any): Promise<OrderFact[]> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      'SELECT * FROM analytics_order_facts WHERE date >= ? AND date <= ? ORDER BY order_created_at ASC',
      [startDate, endDate]
    );
    return (rows as any[]).map(r => this.toEntity(r));
  }

  async upsert(fact: OrderFact, connection?: any): Promise<OrderFact> {
    const executor = connection || db;
    const existing = await this.findByOrderId(fact.orderId, executor);

    const toTs = (d: Date | null): string | null => d ? d.toISOString().slice(0, 19).replace('T', ' ') : null;

    if (!existing) {
      await executor.execute(
        `INSERT INTO analytics_order_facts
          (order_id, shop_id, user_id, date, revenue, page_count, is_color,
           order_created_at, payment_confirmed_at, print_started_at, print_completed_at,
           delivery_completed_at, cancelled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fact.orderId, fact.shopId, fact.userId, fact.date, fact.revenue,
          fact.pageCount, fact.isColor ? 1 : 0,
          toTs(fact.orderCreatedAt), toTs(fact.paymentConfirmedAt),
          toTs(fact.printStartedAt), toTs(fact.printCompletedAt),
          toTs(fact.deliveryCompletedAt), toTs(fact.cancelledAt)
        ]
      );
    } else {
      await executor.execute(
        `UPDATE analytics_order_facts SET
          revenue = ?, page_count = ?, is_color = ?,
          payment_confirmed_at = ?, print_started_at = ?, print_completed_at = ?,
          delivery_completed_at = ?, cancelled_at = ?
         WHERE order_id = ?`,
        [
          fact.revenue, fact.pageCount, fact.isColor ? 1 : 0,
          toTs(fact.paymentConfirmedAt), toTs(fact.printStartedAt), toTs(fact.printCompletedAt),
          toTs(fact.deliveryCompletedAt), toTs(fact.cancelledAt),
          fact.orderId
        ]
      );
    }

    const saved = await this.findByOrderId(fact.orderId, executor);
    return saved!;
  }

  async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    await executor.execute('DELETE FROM analytics_order_facts');
  }
}
