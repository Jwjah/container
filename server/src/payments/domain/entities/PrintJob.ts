import { PrintJobStatus } from '../enums/PrintJobStatus';
import { CancellationReason } from '../enums/CancellationReason';
import { DomainEvent } from '../events/DomainEvent';
import { Order } from './Order';

export class PrintJob {
  public domainEvents: DomainEvent[] = [];

  constructor(
    public readonly id: number,
    public readonly orderId: number,
    public readonly shopId: number,
    public readonly studentId: number,
    public status: PrintJobStatus,
    public priority: number,
    public version: number,
    public lastStatusChangedAt: Date | null,
    public acceptedAt: Date | null,
    public printingStartedAt: Date | null,
    public readyAt: Date | null,
    public cancelledAt: Date | null,
    public completedAt: Date | null,
    public cancellationReasonCode: CancellationReason | null,
    public cancellationDescription: string | null,
    public estimatedCompletionAt: Date | null,
    public readonly createdAt: Date,
    public updatedAt: Date
  ) {}

  public static createFromOrder(order: Order): PrintJob {
    const now = new Date();
    return new PrintJob(
      0, // ID is auto-allocated by DB
      order.id,
      order.shopId,
      order.studentId,
      PrintJobStatus.QUEUED,
      0, // default priority
      1, // default version
      now, // lastStatusChangedAt
      null, // acceptedAt
      null, // printingStartedAt
      null, // readyAt
      null, // cancelledAt
      null, // completedAt
      null, // cancellationReasonCode
      null, // cancellationDescription
      null, // estimatedCompletionAt
      now,
      now
    );
  }

  public accept(): void {
    if (this.status === PrintJobStatus.ACCEPTED) return;
    this.assertNotTerminal();
    this.assertStatus(PrintJobStatus.QUEUED, 'accept');

    this.status = PrintJobStatus.ACCEPTED;
    const now = new Date();
    this.acceptedAt = now;
    this.lastStatusChangedAt = now;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'PRINT_JOB_ACCEPTED',
      payload: { printJobId: this.id, orderId: this.orderId, shopId: this.shopId }
    });
  }

  public startPrinting(): void {
    if (this.status === PrintJobStatus.PRINTING) return;
    this.assertNotTerminal();
    this.assertStatus(PrintJobStatus.ACCEPTED, 'startPrinting');

    this.status = PrintJobStatus.PRINTING;
    const now = new Date();
    this.printingStartedAt = now;
    this.lastStatusChangedAt = now;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'PRINT_STARTED',
      payload: { printJobId: this.id, orderId: this.orderId, shopId: this.shopId }
    });
  }

  public markReady(): void {
    if (this.status === PrintJobStatus.READY) return;
    this.assertNotTerminal();
    this.assertStatus(PrintJobStatus.PRINTING, 'markReady');

    this.status = PrintJobStatus.READY;
    const now = new Date();
    this.readyAt = now;
    this.completedAt = now;
    this.lastStatusChangedAt = now;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'PRINT_READY',
      payload: { printJobId: this.id, orderId: this.orderId, shopId: this.shopId }
    });
  }

  public cancel(actorType: 'student' | 'shop' | 'system', reasonCode: CancellationReason, description: string | null): void {
    if (this.status === PrintJobStatus.CANCELLED) return;
    this.assertNotTerminal();

    // Invariant rule: Students can cancel ONLY in QUEUED state
    if (actorType === 'student' && this.status !== PrintJobStatus.QUEUED) {
      throw new Error(`Cancellation forbidden: Students can only cancel jobs in QUEUED status. Current status is ${this.status}.`);
    }

    this.status = PrintJobStatus.CANCELLED;
    const now = new Date();
    this.cancelledAt = now;
    this.lastStatusChangedAt = now;
    this.cancellationReasonCode = reasonCode;
    this.cancellationDescription = description;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'PRINT_CANCELLED',
      payload: { 
        printJobId: this.id, 
        orderId: this.orderId, 
        shopId: this.shopId, 
        actorType,
        reasonCode, 
        description 
      }
    });
  }

  public updateScheduling(priority?: number, estimatedCompletionAt?: Date): void {
    this.assertNotTerminal();
    const now = new Date();
    if (priority !== undefined) {
      this.priority = priority;
    }
    if (estimatedCompletionAt !== undefined) {
      this.estimatedCompletionAt = estimatedCompletionAt;
    }
    this.updatedAt = now;
  }

  private assertNotTerminal(): void {
    if (this.status === PrintJobStatus.READY || this.status === PrintJobStatus.CANCELLED) {
      throw new Error(`Cannot transition print job from terminal status: ${this.status}`);
    }
  }

  private assertStatus(expected: PrintJobStatus, action: string): void {
    if (this.status !== expected) {
      throw new Error(`Cannot perform '${action}' action: expected status to be ${expected}, but got ${this.status}`);
    }
  }
}
