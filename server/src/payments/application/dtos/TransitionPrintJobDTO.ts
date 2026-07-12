import { CancellationReason } from '../../domain/enums/CancellationReason';

export interface TransitionPrintJobDTO {
  printJobId: number;
  reasonCode?: CancellationReason;
  reasonDescription?: string;
}
