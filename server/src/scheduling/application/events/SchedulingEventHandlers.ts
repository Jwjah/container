import { SchedulingEventHandler } from './SchedulingEventHandler';
import { DomainEvent } from '../../../tracking/domain/events/DomainEvent';
import { SchedulingContext } from './SchedulingContext';
import { PrinterStatus } from '../../domain/enums/PrinterStatus';

export class OrderCreatedHandler implements SchedulingEventHandler {
  public async handle(event: DomainEvent, context: SchedulingContext): Promise<void> {
    const { shopId, orderId, pagesCount, duplex, color, paperSize = 'A4' } = event.payload;
    await context.schedulingEngine.scheduleOrder(
      Number(shopId),
      Number(orderId),
      Number(pagesCount),
      duplex === true,
      color === true,
      paperSize,
      context.connection
    );
  }
}

export class OrderCancelledHandler implements SchedulingEventHandler {
  public async handle(event: DomainEvent, context: SchedulingContext): Promise<void> {
    const orderId = Number(event.payload.orderId);
    
    // Retrieve queue slot info to release inventory stock
    const [rows] = await context.connection.execute(
      'SELECT shop_id, pages_count, color FROM scheduling_print_queue WHERE order_id = ?',
      [orderId]
    );
    const row = (rows as any[])[0];

    if (row) {
      await context.queueService.cancelOrder(orderId, context.connection);
      await context.inventoryService.releaseInventory(
        row.shop_id,
        'A4',
        row.pages_count,
        row.color === 1,
        context.connection
      );
    }
  }
}

export class PaymentFailedHandler implements SchedulingEventHandler {
  public async handle(event: DomainEvent, context: SchedulingContext): Promise<void> {
    const handler = new OrderCancelledHandler();
    await handler.handle(event, context);
  }
}

export class PrintStartedHandler implements SchedulingEventHandler {
  public async handle(event: DomainEvent, context: SchedulingContext): Promise<void> {
    const orderId = Number(event.payload.orderId);
    await context.queueService.startOrder(orderId, context.connection);
  }
}

export class PrintCompletedHandler implements SchedulingEventHandler {
  public async handle(event: DomainEvent, context: SchedulingContext): Promise<void> {
    const orderId = Number(event.payload.orderId);
    await context.queueService.completeOrder(orderId, context.connection);
  }
}

export class PrintFailedHandler implements SchedulingEventHandler {
  public async handle(event: DomainEvent, context: SchedulingContext): Promise<void> {
    const orderId = Number(event.payload.orderId);
    await context.queueService.failOrder(orderId, context.connection);
  }
}

export class ShopDisabledHandler implements SchedulingEventHandler {
  public async handle(event: DomainEvent, context: SchedulingContext): Promise<void> {
    const shopId = Number(event.payload.shopId);
    const cap = await context.capacityRepo.findById(shopId, context.connection);
    if (cap) {
      cap.disableAcceptance();
      await context.capacityRepo.update(cap, context.connection);
    }
  }
}

export class ShopEnabledHandler implements SchedulingEventHandler {
  public async handle(event: DomainEvent, context: SchedulingContext): Promise<void> {
    const shopId = Number(event.payload.shopId);
    const cap = await context.capacityRepo.findById(shopId, context.connection);
    if (cap) {
      cap.enableAcceptance();
      await context.capacityRepo.update(cap, context.connection);
    }
  }
}

export class PrinterOfflineHandler implements SchedulingEventHandler {
  public async handle(event: DomainEvent, context: SchedulingContext): Promise<void> {
    const printerId = Number(event.payload.printerId);
    await context.queueService.rescheduleOfflinePrinter(printerId, context.connection);
  }
}

export class PrinterOnlineHandler implements SchedulingEventHandler {
  public async handle(event: DomainEvent, context: SchedulingContext): Promise<void> {
    const printerId = Number(event.payload.printerId);
    const printer = await context.printerRepo.findById(printerId, context.connection);
    if (printer) {
      printer.updateStatus(PrinterStatus.AVAILABLE);
      await context.printerRepo.update(printer, context.connection);
    }
  }
}

export class MaintenanceScheduledHandler implements SchedulingEventHandler {
  public async handle(event: DomainEvent, context: SchedulingContext): Promise<void> {
    const { printerId, startTime, endTime, reason } = event.payload;
    await context.maintenancePlanner.scheduleMaintenance(
      Number(printerId),
      new Date(startTime),
      new Date(endTime),
      reason,
      context.connection
    );
  }
}

export class MaintenanceCompletedHandler implements SchedulingEventHandler {
  public async handle(event: DomainEvent, context: SchedulingContext): Promise<void> {
    const printerId = Number(event.payload.printerId);
    await context.maintenancePlanner.completeMaintenance(printerId, context.connection);
  }
}
