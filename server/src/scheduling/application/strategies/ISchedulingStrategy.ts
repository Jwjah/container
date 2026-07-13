import { Printer } from '../../domain/entities/Printer';

export interface ISchedulingStrategy {
  /**
   * Evaluates compatible printers and returns the optimal assignment.
   */
  assignPrinter(
    printers: Printer[],
    slotRequirements: {
      pagesCount: number;
      duplex: boolean;
      color: boolean;
      paperSize: string;
      paperWeight?: number;
      mediaType?: string;
    }
  ): Printer | null;
}
