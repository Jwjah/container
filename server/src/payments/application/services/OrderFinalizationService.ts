import { IOrderFinalizationService } from './IOrderFinalizationService';
import { IPaymentRepository } from '../../interfaces/IPaymentRepository';
import { IOrderRepository } from '../../interfaces/IOrderRepository';
import { IInvoiceRepository } from '../../interfaces/IInvoiceRepository';
import { IPrintJobRepository } from '../../interfaces/IPrintJobRepository';
import { IOutboxRepository } from '../../interfaces/IOutboxRepository';
import { OrderFinalizationResultDTO } from '../dtos/OrderFinalizationResultDTO';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';
import { OrderStatus } from '../../domain/enums/OrderStatus';
import { PrintJobStatus } from '../../domain/enums/PrintJobStatus';
import { OutboxEventStatus } from '../../domain/enums/OutboxEventStatus';
import { PaymentStatus } from '../../domain/enums/PaymentStatus';
import { Invoice } from '../../domain/entities/Invoice';
import { PrintJob } from '../../domain/entities/PrintJob';
import { OutboxEvent } from '../../domain/entities/OutboxEvent';
import { InvoiceNumberGenerator } from './InvoiceNumberGenerator';
import db from '../../../config/database';
import crypto from 'crypto';

export class OrderFinalizationService implements IOrderFinalizationService {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly invoiceRepository: IInvoiceRepository,
    private readonly printJobRepository: IPrintJobRepository,
    private readonly outboxRepository: IOutboxRepository
  ) {}

  public async finalizeOrder(paymentUuid: string, correlationId?: CorrelationId): Promise<OrderFinalizationResultDTO> {
    const cid = correlationId || CorrelationId.create();
    const correlationStr = cid.value;

    console.log(`[${correlationStr}] [OrderFinalizationService] Finalizing order for payment UUID: ${paymentUuid}`);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Lock payment and verify captured state
      const payment = await this.paymentRepository.findByUuidForUpdate(paymentUuid, conn);
      if (!payment) {
        throw new Error('Payment record not found');
      }
      if (payment.status !== PaymentStatus.CAPTURED) {
        throw new Error(`Cannot finalize order: payment is in ${payment.status} status`);
      }

      // 2. Lock Order row
      const order = await this.orderRepository.findByIdForUpdate(payment.orderId, conn);
      if (!order) {
        throw new Error('Order record not found');
      }

      // 3. Idempotency Check
      if (order.status === OrderStatus.PAID) {
        console.log(`[${correlationStr}] [OrderFinalizationService] Order already finalized. Returning existing details (Idempotency).`);
        const invoice = await this.invoiceRepository.findByOrderId(order.id, conn);
        const printJob = await this.printJobRepository.findByOrderId(order.id, conn);
        
        await conn.commit();
        
        return {
          orderId: order.id,
          orderHash: order.orderHash,
          invoiceNumber: invoice?.invoiceNumber || '',
          printJobId: printJob?.id || 0,
          status: order.status,
          finalizedAt: order.paidAt || new Date()
        };
      }

      // Validate eligibility
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        throw new Error(`Order in state ${order.status} is ineligible for payment finalization`);
      }
      if (order.studentId !== payment.studentId) {
        throw new Error('Payment ownership mismatch');
      }

      // 4. Mark paid via Domain Model method
      order.markPaid(payment.paymentReference!, payment.uuid, payment.gatewayPaymentId || '');
      await this.orderRepository.update(order, conn);

      // 5. Generate Concurrency-Safe Sequence Invoice Number
      const seq = await this.invoiceRepository.getNextSequenceValue(conn);
      const invoiceNumber = await InvoiceNumberGenerator.generate(seq);
      const invoiceUuid = crypto.randomUUID();

      const invoice = Invoice.createFromOrder(order, invoiceNumber, invoiceUuid);
      await this.invoiceRepository.create(invoice, conn);

      // 6. Create Print Job Queue entry via Domain model factory
      const printJobEntity = PrintJob.createFromOrder(order);
      const printJob = await this.printJobRepository.create(printJobEntity, conn);

      // 7. Stage Generic Domain Event in Outbox Table
      const eventPayload = {
        orderId: order.id,
        orderHash: order.orderHash,
        studentId: order.studentId,
        shopId: order.shopId,
        totalPrice: order.totalPrice,
        paymentReference: payment.paymentReference,
        gatewayPaymentId: payment.gatewayPaymentId,
        invoiceNumber,
        invoiceUuid
      };

      const outboxEvent = new OutboxEvent(
        null,
        crypto.randomUUID(),
        'ORDER_FINALIZED',
        'ORDER',
        String(order.id),
        JSON.stringify(eventPayload),
        OutboxEventStatus.PENDING,
        0,
        null,
        correlationStr,
        1,
        new Date()
      );

      await this.outboxRepository.create(outboxEvent, conn);

      await conn.commit();

      console.log(`[${correlationStr}] [OrderFinalizationService] Order finalization complete for order: ${order.id}`);

      return {
        orderId: order.id,
        orderHash: order.orderHash,
        invoiceNumber,
        printJobId: printJob.id || 0,
        status: order.status,
        finalizedAt: order.paidAt!
      };

    } catch (err: any) {
      await conn.rollback();
      console.error(`[${correlationStr}] [OrderFinalizationService] Finalization transaction failed:`, err);
      throw err;
    } finally {
      conn.release();
    }
  }
}
