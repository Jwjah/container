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

/**
 * WithdrawalRequestedHandler — processes WITHDRAWAL_REQUESTED events.
 */
export class WithdrawalRequestedHandler implements NotificationEventHandler {
  constructor(private readonly notifService: NotificationService) {}

  public async handle(event: DomainEvent, connection?: any): Promise<void> {
    const executor = connection || db;
    const { amount, userId, role } = event.payload;

    // 1. Notify Requester
    await this.notifService.sendNotification(
      userId,
      'WITHDRAWAL_REQUESTED_USER',
      NotificationType.TRANSACTIONAL,
      NotificationPriority.MEDIUM,
      event.payload,
      executor
    );

    // 2. Resolve all admin users
    const [admins] = await executor.execute("SELECT id FROM users WHERE role = 'admin'");
    for (const admin of admins) {
      await this.notifService.sendNotification(
        admin.id,
        'WITHDRAWAL_REQUESTED',
        NotificationType.SYSTEM,
        NotificationPriority.HIGH,
        event.payload,
        executor
      );
    }
  }
}

/**
 * WithdrawalApprovedHandler — processes WITHDRAWAL_APPROVED events.
 */
export class WithdrawalApprovedHandler implements NotificationEventHandler {
  constructor(private readonly notifService: NotificationService) {}

  public async handle(event: DomainEvent, connection?: any): Promise<void> {
    const executor = connection || db;
    const { userId } = event.payload;

    await this.notifService.sendNotification(
      userId,
      'WITHDRAWAL_APPROVED',
      NotificationType.TRANSACTIONAL,
      NotificationPriority.MEDIUM,
      event.payload,
      executor
    );
  }
}

/**
 * WithdrawalRejectedHandler — processes WITHDRAWAL_REJECTED events.
 */
export class WithdrawalRejectedHandler implements NotificationEventHandler {
  constructor(private readonly notifService: NotificationService) {}

  public async handle(event: DomainEvent, connection?: any): Promise<void> {
    const executor = connection || db;
    const { userId } = event.payload;

    await this.notifService.sendNotification(
      userId,
      'WITHDRAWAL_REJECTED',
      NotificationType.TRANSACTIONAL,
      NotificationPriority.MEDIUM,
      event.payload,
      executor
    );
  }
}

/**
 * WithdrawalCompletedHandler — processes WITHDRAWAL_COMPLETED events.
 */
export class WithdrawalCompletedHandler implements NotificationEventHandler {
  constructor(private readonly notifService: NotificationService) {}

  public async handle(event: DomainEvent, connection?: any): Promise<void> {
    const executor = connection || db;
    const { userId } = event.payload;

    await this.notifService.sendNotification(
      userId,
      'WITHDRAWAL_COMPLETED',
      NotificationType.TRANSACTIONAL,
      NotificationPriority.HIGH,
      event.payload,
      executor
    );
  }
}

/**
 * DeliveryTimeoutHandler — processes DELIVERY_TIMEOUT events.
 */
export class DeliveryTimeoutHandler implements NotificationEventHandler {
  constructor(private readonly notifService: NotificationService) {}

  public async handle(event: DomainEvent, connection?: any): Promise<void> {
    const executor = connection || db;
    const { studentId, shopId } = event.payload;

    // 1. Notify Student
    await this.notifService.sendNotification(
      studentId,
      'DELIVERY_TIMEOUT',
      NotificationType.TRANSACTIONAL,
      NotificationPriority.HIGH,
      event.payload,
      executor
    );

    // 2. Notify Shop Owner
    const [shops] = await executor.execute('SELECT user_id FROM shops WHERE id = ?', [shopId]);
    if (shops.length) {
      const shopOwnerId = shops[0].user_id;
      await this.notifService.sendNotification(
        shopOwnerId,
        'DELIVERY_TIMEOUT_SHOP',
        NotificationType.TRANSACTIONAL,
        NotificationPriority.HIGH,
        event.payload,
        executor
      );
    }

    // 3. Notify Admins
    const [admins] = await executor.execute("SELECT id FROM users WHERE role = 'admin'");
    for (const admin of admins) {
      await this.notifService.sendNotification(
        admin.id,
        'DELIVERY_TIMEOUT_ADMIN',
        NotificationType.SYSTEM,
        NotificationPriority.HIGH,
        event.payload,
        executor
      );
    }
  }
}

/**
 * PickupConversionHandler — processes PICKUP_CONVERSION events.
 */
export class PickupConversionHandler implements NotificationEventHandler {
  constructor(private readonly notifService: NotificationService) {}

  public async handle(event: DomainEvent, connection?: any): Promise<void> {
    const executor = connection || db;
    const { studentId, shopId } = event.payload;

    // 1. Notify Student
    await this.notifService.sendNotification(
      studentId,
      'PICKUP_CONVERSION',
      NotificationType.TRANSACTIONAL,
      NotificationPriority.MEDIUM,
      event.payload,
      executor
    );

    // 2. Notify Shop Owner
    const [shops] = await executor.execute('SELECT user_id FROM shops WHERE id = ?', [shopId]);
    if (shops.length) {
      const shopOwnerId = shops[0].user_id;
      await this.notifService.sendNotification(
        shopOwnerId,
        'PICKUP_CONVERSION_SHOP',
        NotificationType.TRANSACTIONAL,
        NotificationPriority.MEDIUM,
        event.payload,
        executor
      );
    }

    // 3. Notify Admins
    const [admins] = await executor.execute("SELECT id FROM users WHERE role = 'admin'");
    for (const admin of admins) {
      await this.notifService.sendNotification(
        admin.id,
        'PICKUP_CONVERSION_ADMIN',
        NotificationType.SYSTEM,
        NotificationPriority.MEDIUM,
        event.payload,
        executor
      );
    }
  }
}
