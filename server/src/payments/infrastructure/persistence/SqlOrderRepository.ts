import { IOrderRepository } from '../../interfaces/IOrderRepository';
import { Order } from '../../domain/entities/Order';
import { OrderStatus } from '../../domain/enums/OrderStatus';
import db from '../../../config/database';

export class SqlOrderRepository implements IOrderRepository {
  private toEntity(row: any): Order {
    return new Order(
      row.id,
      row.order_hash,
      row.student_id,
      row.shop_id,
      row.status as OrderStatus,
      row.total_price,
      row.payment_reference,
      row.payment_uuid,
      row.gateway_payment_id,
      row.paid_at ? new Date(row.paid_at) : null,
      new Date(row.created_at)
    );
  }

  public async findById(id: number, connection?: any): Promise<Order | null> {
    const executor = connection || db;
    const [rows] = await executor.execute('SELECT * FROM orders WHERE id = ?', [id]);
    if (!rows || rows.length === 0) {
      return null;
    }
    return this.toEntity(rows[0]);
  }

  public async findByIdForUpdate(id: number, connection?: any): Promise<Order | null> {
    const executor = connection || db;
    const isMySQL = process.env.DB_MODE === 'mysql';
    const query = isMySQL
      ? 'SELECT * FROM orders WHERE id = ? FOR UPDATE'
      : 'SELECT * FROM orders WHERE id = ?';
    const [rows] = await executor.execute(query, [id]);
    if (!rows || rows.length === 0) {
      return null;
    }
    return this.toEntity(rows[0]);
  }

  public async update(order: Order, connection?: any): Promise<Order> {
    const executor = connection || db;
    const paidAtStr = order.paidAt ? order.paidAt.toISOString() : null;
    await executor.execute(
      `UPDATE orders SET 
        status = ?, 
        payment_reference = ?, 
        payment_uuid = ?, 
        gateway_payment_id = ?, 
        paid_at = ?, 
        updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
        order.status,
        order.paymentReference,
        order.paymentUuid,
        order.gatewayPaymentId,
        paidAtStr,
        order.id
      ]
    );
    return order;
  }
}
