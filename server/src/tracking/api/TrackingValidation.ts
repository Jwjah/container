import { Request, Response, NextFunction } from 'express';

export class TrackingValidation {
  /**
   * Middleware to validate numeric orderId parameter.
   */
  public static validateOrderId(req: Request, res: Response, next: NextFunction) {
    const orderId = Number(req.params.orderId);
    if (isNaN(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order ID. Must be a positive integer.' });
    }
    next();
  }

  /**
   * Middleware to validate query pagination and sorting parameters.
   */
  public static validatePagination(req: Request, res: Response, next: NextFunction) {
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const sort = req.query.sort ? String(req.query.sort).toUpperCase() : 'ASC';

    if (isNaN(page) || page <= 0) {
      return res.status(400).json({ error: 'Page number must be a positive integer.' });
    }

    if (isNaN(limit) || limit <= 0 || limit > 100) {
      return res.status(400).json({ error: 'Limit must be a positive integer between 1 and 100.' });
    }

    if (sort !== 'ASC' && sort !== 'DESC') {
      return res.status(400).json({ error: 'Sort direction must be either ASC or DESC.' });
    }

    req.query.page = String(page);
    req.query.limit = String(limit);
    req.query.sort = sort;
    next();
  }
}
