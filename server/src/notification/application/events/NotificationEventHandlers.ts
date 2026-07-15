import { NotificationEventHandler } from '../../worker/NotificationEventDispatcher';
import { DomainEvent } from '../../../tracking/domain/events/DomainEvent';
import { NotificationService } from '../services/NotificationService';
import { NotificationType } from '../../domain/enums/NotificationType';
import { NotificationPriority } from '../../domain/enums/NotificationPriority';
import db from '../../../config/database';

/**
 * OrderCreatedHandler — processes ORDER_CREATED events to notify the student.
 */
export class OrderCreatedHandler implements NotificationEventHandler {
  constructor(private readonly notifService: NotificationService) {}

  public async handle(event: DomainEvent, connection?: any): Promise<void> {
    const { orderId, shopId, pagesCount } = event.payload;
    const executor = connection || db;

    // Resolve student user ID from orders table
    const [rows] = await executor.execute('SELECT student_id FROM orders WHERE id = ?', [orderId]);
    const studentId = (rows as any[])[0]?.student_id;

    if (!studentId) {
      console.warn(`⚠️ [OrderCreatedHandler] Could not resolve student_id for order ${orderId}`);
      return;
    }

    await this.notifService.sendNotification(
      studentId,
      'ORDER_CREATED',
      NotificationType.TRANSACTIONAL,
      NotificationPriority.LOW,
      { orderId, shopId, pagesCount },
      executor
    );
  }
}

/**
 * PaymentConfirmedHandler — processes PAYMENT_CONFIRMED events to notify the student.
 */
export class PaymentConfirmedHandler implements NotificationEventHandler {
  constructor(private readonly notifService: NotificationService) {}

  public async handle(event: DomainEvent, connection?: any): Promise<void> {
    const { orderId } = event.payload;
    const executor = connection || db;

    const [rows] = await executor.execute('SELECT student_id FROM orders WHERE id = ?', [orderId]);
    const studentId = (rows as any[])[0]?.student_id;

    if (!studentId) {
      console.warn(`⚠️ [PaymentConfirmedHandler] Could not resolve student_id for order ${orderId}`);
      return;
    }

    await this.notifService.sendNotification(
      studentId,
      'PAYMENT_CONFIRMED',
      NotificationType.TRANSACTIONAL,
      NotificationPriority.MEDIUM,
      { orderId },
      executor
    );
  }
}

/**
 * LowStockHandler — processes LOW_STOCK events to notify the shop owner.
 */
export class LowStockHandler implements NotificationEventHandler {
  constructor(private readonly notifService: NotificationService) {}

  public async handle(event: DomainEvent, connection?: any): Promise<void> {
    const { shopId, type, variant, quantity } = event.payload;
    const executor = connection || db;

    // Resolve shop owner user ID from shops table
    const [rows] = await executor.execute('SELECT user_id FROM shops WHERE id = ?', [shopId]);
    const ownerId = (rows as any[])[0]?.user_id;

    if (!ownerId) {
      console.warn(`⚠️ [LowStockHandler] Could not resolve owner user_id for shop ${shopId}`);
      return;
    }

    await this.notifService.sendNotification(
      ownerId,
      'LOW_STOCK',
      NotificationType.SYSTEM,
      NotificationPriority.HIGH,
      { shopId, type, variant, quantity },
      executor
    );
  }
}
