import { PrintJobHistory } from '../domain/entities/PrintJobHistory';

export interface IPrintJobHistoryRepository {
  create(history: PrintJobHistory, connection?: any): Promise<PrintJobHistory>;
  findByPrintJobId(printJobId: number, connection?: any): Promise<PrintJobHistory[]>;
}
