import { Request, Response } from 'express';
import { IPrintProductionService } from '../../application/services/IPrintProductionService';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';
import { TransitionPrintJobDTO } from '../../application/dtos/TransitionPrintJobDTO';
import { UpdatePrintJobSchedulingDTO } from '../../application/dtos/UpdatePrintJobSchedulingDTO';

export class PrintProductionController {
  constructor(private readonly service: IPrintProductionService) {}

  public accept = async (req: Request, res: Response): Promise<void> => {
    const correlationHeader = req.headers['x-correlation-id'];
    const correlationStr = (Array.isArray(correlationHeader) ? correlationHeader[0] : correlationHeader) as string | undefined;
    const cid = CorrelationId.fromString(correlationStr);
    res.setHeader('x-correlation-id', cid.value);

    try {
      const printJobId = parseInt(req.params.id as string);
      const user = (req as any).user;
      if (!user || !user.id) {
        res.status(401).json({ error: 'Unauthorized: Authentication required' });
        return;
      }

      const result = await this.service.acceptJob(printJobId, user.id, cid);
      res.status(200).json(result);
    } catch (err: any) {
      console.error(`[${cid.value}] [PrintProductionController] Accept job failed:`, err.message);
      this.handleError(err, res);
    }
  };

  public startPrint = async (req: Request, res: Response): Promise<void> => {
    const correlationHeader = req.headers['x-correlation-id'];
    const correlationStr = (Array.isArray(correlationHeader) ? correlationHeader[0] : correlationHeader) as string | undefined;
    const cid = CorrelationId.fromString(correlationStr);
    res.setHeader('x-correlation-id', cid.value);

    try {
      const printJobId = parseInt(req.params.id as string);
      const user = (req as any).user;
      if (!user || !user.id) {
        res.status(401).json({ error: 'Unauthorized: Authentication required' });
        return;
      }

      const result = await this.service.startPrinting(printJobId, user.id, cid);
      res.status(200).json(result);
    } catch (err: any) {
      console.error(`[${cid.value}] [PrintProductionController] Start print failed:`, err.message);
      this.handleError(err, res);
    }
  };

  public markReady = async (req: Request, res: Response): Promise<void> => {
    const correlationHeader = req.headers['x-correlation-id'];
    const correlationStr = (Array.isArray(correlationHeader) ? correlationHeader[0] : correlationHeader) as string | undefined;
    const cid = CorrelationId.fromString(correlationStr);
    res.setHeader('x-correlation-id', cid.value);

    try {
      const printJobId = parseInt(req.params.id as string);
      const user = (req as any).user;
      if (!user || !user.id) {
        res.status(401).json({ error: 'Unauthorized: Authentication required' });
        return;
      }

      const result = await this.service.markJobReady(printJobId, user.id, cid);
      res.status(200).json(result);
    } catch (err: any) {
      console.error(`[${cid.value}] [PrintProductionController] Mark ready failed:`, err.message);
      this.handleError(err, res);
    }
  };

  public cancel = async (req: Request, res: Response): Promise<void> => {
    const correlationHeader = req.headers['x-correlation-id'];
    const correlationStr = (Array.isArray(correlationHeader) ? correlationHeader[0] : correlationHeader) as string | undefined;
    const cid = CorrelationId.fromString(correlationStr);
    res.setHeader('x-correlation-id', cid.value);

    try {
      const printJobId = parseInt(req.params.id as string);
      const { reasonCode, reasonDescription } = req.body;
      const user = (req as any).user;
      if (!user || !user.id) {
        res.status(401).json({ error: 'Unauthorized: Authentication required' });
        return;
      }

      const dto: TransitionPrintJobDTO = {
        printJobId,
        reasonCode,
        reasonDescription
      };

      const result = await this.service.cancelJob(dto, user.id, cid);
      res.status(200).json(result);
    } catch (err: any) {
      console.error(`[${cid.value}] [PrintProductionController] Cancel job failed:`, err.message);
      this.handleError(err, res);
    }
  };

  public updateScheduling = async (req: Request, res: Response): Promise<void> => {
    const correlationHeader = req.headers['x-correlation-id'];
    const correlationStr = (Array.isArray(correlationHeader) ? correlationHeader[0] : correlationHeader) as string | undefined;
    const cid = CorrelationId.fromString(correlationStr);
    res.setHeader('x-correlation-id', cid.value);

    try {
      const printJobId = parseInt(req.params.id as string);
      const { priority, estimatedCompletionAt } = req.body;
      const user = (req as any).user;
      if (!user || !user.id) {
        res.status(401).json({ error: 'Unauthorized: Authentication required' });
        return;
      }

      const dto: UpdatePrintJobSchedulingDTO = {
        printJobId,
        priority,
        estimatedCompletionAt: estimatedCompletionAt ? new Date(estimatedCompletionAt) : undefined
      };

      const result = await this.service.updateScheduling(dto, user.id, cid);
      res.status(200).json(result);
    } catch (err: any) {
      console.error(`[${cid.value}] [PrintProductionController] Update scheduling failed:`, err.message);
      this.handleError(err, res);
    }
  };

  private handleError(err: any, res: Response): void {
    const msg = err.message || 'Internal server error';
    if (msg.includes('Forbidden') || msg.includes('access denied')) {
      res.status(403).json({ error: msg });
    } else if (msg.includes('Concurrency update') || msg.includes('database is locked')) {
      res.status(409).json({ error: msg });
    } else if (msg.includes('not found')) {
      res.status(404).json({ error: msg });
    } else if (msg.includes('Invalid') || msg.includes('forbidden') || msg.includes('expected status')) {
      res.status(400).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
}
