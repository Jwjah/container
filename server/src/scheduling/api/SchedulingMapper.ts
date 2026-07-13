import { ShopCapacity } from '../domain/entities/ShopCapacity';
import { Printer } from '../domain/entities/Printer';
import { QueueSlot } from '../domain/entities/QueueSlot';
import { ShopCapacityDTO, PrinterDTO, QueueSlotDTO, OrderEtaDTO } from './SchedulingDTO';

/**
 * SchedulingMapper — translates domain entity states to serialized DTO structures.
 *
 * RFC-008 Part 8 Specification
 */
export class SchedulingMapper {
  public static toShopCapacityDTO(capacity: ShopCapacity): ShopCapacityDTO {
    return {
      shopId: capacity.shopId,
      maxParallelOrders: capacity.maxParallelOrders,
      isAcceptingOrders: capacity.isAcceptingOrders,
      overloadWaitThresholdSeconds: capacity.overloadWaitThresholdSeconds
    };
  }

  public static toPrinterDTO(printer: Printer): PrinterDTO {
    return {
      id: printer.id,
      shopId: printer.shopId,
      name: printer.name,
      status: printer.status,
      capabilities: {
        pagesPerMinute: printer.capabilities.pagesPerMinute,
        duplexSupported: printer.capabilities.duplexSupported,
        colorSupported: printer.capabilities.colorSupported,
        supportedPaperSizes: printer.capabilities.supportedPaperSizes,
        maximumPaperWeight: printer.capabilities.maximumPaperWeight,
        printableMedia: printer.capabilities.printableMedia,
        warmupTimeSeconds: printer.capabilities.warmupTimeSeconds
      },
      slotsCount: printer.slots.length,
      maintenanceCount: printer.maintenanceWindows.length
    };
  }

  public static toQueueSlotDTO(slot: QueueSlot): QueueSlotDTO {
    return {
      id: slot.id,
      shopId: slot.shopId,
      orderId: slot.orderId,
      printerId: slot.printerId,
      queuePosition: slot.queuePosition,
      estimatedStartTime: slot.estimatedStartTime.toISOString(),
      estimatedCompletionTime: slot.estimatedCompletionTime.toISOString(),
      pagesCount: slot.pagesCount,
      duplex: slot.duplex,
      color: slot.color,
      status: slot.status
    };
  }

  public static toOrderEtaDTO(eta: {
    orderId: number;
    queuePosition: number;
    printerId: number | null;
    startTime: Date;
    completionTime: Date;
  }): OrderEtaDTO {
    return {
      orderId: eta.orderId,
      queuePosition: eta.queuePosition,
      printerId: eta.printerId,
      estimatedStartTime: eta.startTime.toISOString(),
      estimatedCompletionTime: eta.completionTime.toISOString()
    };
  }
}
