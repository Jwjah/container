import { Request, Response, NextFunction } from 'express';

/**
 * AnalyticsValidation — request validation middleware for the analytics API.
 * RFC-010 Specification
 */
export class AnalyticsValidation {
  public static validateDaysParam(req: Request, res: Response, next: NextFunction): void {
    const days = req.query.days;
    if (days !== undefined) {
      const n = Number(days);
      if (!Number.isInteger(n) || n < 1 || n > 365) {
        res.status(400).json({ error: 'days must be an integer between 1 and 365' });
        return;
      }
    }
    next();
  }

  public static validateShopId(req: Request, res: Response, next: NextFunction): void {
    const shopId = Number(req.params.shopId);
    if (!shopId || shopId <= 0) {
      res.status(400).json({ error: 'Invalid shopId' });
      return;
    }
    next();
  }
}
