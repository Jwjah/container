import { PrintJobResponseDTO } from '../dtos/PrintJobResponseDTO';
import { TransitionPrintJobDTO } from '../dtos/TransitionPrintJobDTO';
import { UpdatePrintJobSchedulingDTO } from '../dtos/UpdatePrintJobSchedulingDTO';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';

export interface IPrintProductionService {
  acceptJob(printJobId: number, userId: number, correlationId?: CorrelationId): Promise<PrintJobResponseDTO>;
  startPrinting(printJobId: number, userId: number, correlationId?: CorrelationId): Promise<PrintJobResponseDTO>;
  markJobReady(printJobId: number, userId: number, correlationId?: CorrelationId): Promise<PrintJobResponseDTO>;
  cancelJob(dto: TransitionPrintJobDTO, userId: number, correlationId?: CorrelationId): Promise<PrintJobResponseDTO>;
  updateScheduling(dto: UpdatePrintJobSchedulingDTO, userId: number, correlationId?: CorrelationId): Promise<PrintJobResponseDTO>;
}
