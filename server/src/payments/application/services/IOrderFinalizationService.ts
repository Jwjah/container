import { OrderFinalizationResultDTO } from '../dtos/OrderFinalizationResultDTO';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';

export interface IOrderFinalizationService {
  finalizeOrder(paymentUuid: string, correlationId?: CorrelationId): Promise<OrderFinalizationResultDTO>;
}
