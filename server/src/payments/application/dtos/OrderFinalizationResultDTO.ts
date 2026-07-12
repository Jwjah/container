import { OrderStatus } from '../../domain/enums/OrderStatus';

export interface OrderFinalizationResultDTO {
  orderId: number;
  orderHash: string;
  invoiceNumber: string;
  printJobId: number;
  status: OrderStatus;
  finalizedAt: Date;
}
