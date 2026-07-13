import { Request, Response, NextFunction } from 'express';

/**
 * SchedulingValidation — express validation middleware assertions.
 *
 * RFC-008 Part 8 Specification
 */
export class SchedulingValidation {
  public static validateShopId(req: Request, res: Response, next: NextFunction): void {
    const shopId = Number(req.params.shopId);
    if (isNaN(shopId) || shopId <= 0) {
      res.status(400).json({ error: 'Invalid shopId parameter. Must be a positive integer.' });
      return;
    }
    next();
  }

  public static validateOrderId(req: Request, res: Response, next: NextFunction): void {
    const orderId = Number(req.params.orderId);
    if (isNaN(orderId) || orderId <= 0) {
      res.status(400).json({ error: 'Invalid orderId parameter. Must be a positive integer.' });
      return;
    }
    next();
  }

  public static validateReplenish(req: Request, res: Response, next: NextFunction): void {
    const { type, variant, quantity } = req.body;
    
    if (!type || !['paper', 'ink'].includes(type)) {
      res.status(400).json({ error: "Invalid type. Must be 'paper' or 'ink'." });
      return;
    }
    if (!variant || typeof variant !== 'string') {
      res.status(400).json({ error: 'Invalid variant. Must be a non-empty string.' });
      return;
    }
    if (typeof quantity !== 'number' || quantity <= 0) {
      res.status(400).json({ error: 'Invalid quantity. Must be a positive number.' });
      return;
    }
    next();
  }
}
