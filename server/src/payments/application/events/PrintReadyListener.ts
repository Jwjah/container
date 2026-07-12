import { FulfillmentService } from '../services/FulfillmentService';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';

export class PrintReadyListener {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  public async handle(payload: any): Promise<void> {
    const { orderId, shopId, studentId, printJobId } = payload;
    const cidStr = payload.correlationId;
    const cid = cidStr ? CorrelationId.fromString(cidStr) : CorrelationId.create();

    console.log(`[PrintReadyListener] Handling PRINT_READY event for Order #${orderId || printJobId}`);

    // Resolve shopId and studentId safely if they are missing from payload
    const resolvedShopId = shopId || 0;
    const resolvedStudentId = studentId || 0;

    await this.fulfillmentService.initializeFromPrintReady(
      orderId,
      resolvedShopId,
      resolvedStudentId,
      printJobId,
      cid
    );
  }
}
