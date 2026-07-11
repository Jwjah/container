import { PrintJobStatus } from '../enums/PrintJobStatus';
import { Order } from './Order';

export class PrintJob {
  constructor(
    public readonly id: number | null,
    public readonly orderId: number,
    public readonly shopId: number,
    public readonly studentId: number,
    public readonly status: PrintJobStatus,
    public readonly priority: number,
    public readonly estimatedCompletionAt: Date | null = null,
    public readonly completedAt: Date | null = null,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date()
  ) {}

  public static createFromOrder(order: Order): PrintJob {
    return new PrintJob(
      null,
      order.id,
      order.shopId,
      order.studentId,
      PrintJobStatus.QUEUED,
      0 // default priority
    );
  }
}
