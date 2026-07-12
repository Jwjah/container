export interface UpdatePrintJobSchedulingDTO {
  printJobId: number;
  priority?: number;
  estimatedCompletionAt?: Date;
}
