import { Request, Response } from 'express';
import { FulfillmentService } from '../../application/services/FulfillmentService';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';
import { FulfillmentFailureReason } from '../../domain/enums/FulfillmentFailureReason';

export class FulfillmentController {
  constructor(private readonly service: FulfillmentService) {}

  private getCorrelationId(req: Request, res: Response): CorrelationId {
    const correlationHeader = req.headers['x-correlation-id'];
    const correlationStr = (Array.isArray(correlationHeader) ? correlationHeader[0] : correlationHeader) as string | undefined;
    const cid = CorrelationId.fromString(correlationStr);
    res.setHeader('x-correlation-id', cid.value);
    return cid;
  }

  private getAuthenticatedUser(req: Request, res: Response): any | null {
    const user = (req as any).user;
    if (!user || !user.id) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return null;
    }
    return user;
  }

  public assignAgent = async (req: Request, res: Response): Promise<void> => {
    const cid = this.getCorrelationId(req, res);
    const user = this.getAuthenticatedUser(req, res);
    if (!user) return;

    try {
      const fulfillmentId = parseInt(req.params.id as string);
      const { agentId } = req.body;
      if (!agentId) {
        res.status(400).json({ error: 'agentId is required' });
        return;
      }

      const result = await this.service.assignAgent(fulfillmentId, parseInt(agentId as string), user.id, cid);
      res.status(200).json(result);
    } catch (err: any) {
      console.error(`[${cid.value}] [FulfillmentController] Assign agent failed:`, err.message);
      this.handleError(err, res);
    }
  };

  public startDelivery = async (req: Request, res: Response): Promise<void> => {
    const cid = this.getCorrelationId(req, res);
    const user = this.getAuthenticatedUser(req, res);
    if (!user) return;

    try {
      const fulfillmentId = parseInt(req.params.id as string);
      const result = await this.service.startDelivery(fulfillmentId, user.id, cid);
      res.status(200).json(result);
    } catch (err: any) {
      console.error(`[${cid.value}] [FulfillmentController] Start delivery failed:`, err.message);
      this.handleError(err, res);
    }
  };

  public verifyOtp = async (req: Request, res: Response): Promise<void> => {
    const cid = this.getCorrelationId(req, res);
    const user = this.getAuthenticatedUser(req, res);
    if (!user) return;

    try {
      const fulfillmentId = parseInt(req.params.id as string);
      const { otp } = req.body;
      if (!otp) {
        res.status(400).json({ error: 'otp is required' });
        return;
      }

      const result = await this.service.verifyOtp(fulfillmentId, otp.toString(), user.id, cid);
      res.status(200).json(result);
    } catch (err: any) {
      console.error(`[${cid.value}] [FulfillmentController] Verify OTP failed:`, err.message);
      this.handleError(err, res);
    }
  };

  public completeDelivery = async (req: Request, res: Response): Promise<void> => {
    const cid = this.getCorrelationId(req, res);
    const user = this.getAuthenticatedUser(req, res);
    if (!user) return;

    try {
      const fulfillmentId = parseInt(req.params.id as string);
      const { proofOfDeliveryReference } = req.body;
      if (!proofOfDeliveryReference) {
        res.status(400).json({ error: 'proofOfDeliveryReference is required' });
        return;
      }

      const result = await this.service.completeDelivery(fulfillmentId, proofOfDeliveryReference, user.id, cid);
      res.status(200).json(result);
    } catch (err: any) {
      console.error(`[${cid.value}] [FulfillmentController] Complete delivery failed:`, err.message);
      this.handleError(err, res);
    }
  };

  public completePickup = async (req: Request, res: Response): Promise<void> => {
    const cid = this.getCorrelationId(req, res);
    const user = this.getAuthenticatedUser(req, res);
    if (!user) return;

    try {
      const fulfillmentId = parseInt(req.params.id as string);
      const result = await this.service.completePickup(fulfillmentId, user.id, cid);
      res.status(200).json(result);
    } catch (err: any) {
      console.error(`[${cid.value}] [FulfillmentController] Complete pickup failed:`, err.message);
      this.handleError(err, res);
    }
  };

  public failDelivery = async (req: Request, res: Response): Promise<void> => {
    const cid = this.getCorrelationId(req, res);
    const user = this.getAuthenticatedUser(req, res);
    if (!user) return;

    try {
      const fulfillmentId = parseInt(req.params.id as string);
      const { reason } = req.body;
      if (!reason) {
        res.status(400).json({ error: 'reason is required' });
        return;
      }

      const result = await this.service.failDelivery(fulfillmentId, reason as FulfillmentFailureReason, user.id, cid);
      res.status(200).json(result);
    } catch (err: any) {
      console.error(`[${cid.value}] [FulfillmentController] Fail delivery failed:`, err.message);
      this.handleError(err, res);
    }
  };

  public regenerateOtp = async (req: Request, res: Response): Promise<void> => {
    const cid = this.getCorrelationId(req, res);
    const user = this.getAuthenticatedUser(req, res);
    if (!user) return;

    try {
      const fulfillmentId = parseInt(req.params.id as string);
      const result = await this.service.regenerateOtp(fulfillmentId, user.id, cid);
      res.status(200).json(result);
    } catch (err: any) {
      console.error(`[${cid.value}] [FulfillmentController] Regenerate OTP failed:`, err.message);
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
    } else if (msg.includes('Invalid') || msg.includes('forbidden') || msg.includes('expected status') || msg.includes('expired') || msg.includes('required') || msg.includes('lockout')) {
      res.status(400).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
}
