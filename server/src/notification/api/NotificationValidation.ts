import { Request, Response, NextFunction } from 'express';

export class NotificationValidation {
  public static validateNotificationId(req: Request, res: Response, next: NextFunction): void {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ error: 'Notification ID must be a positive integer' });
      return;
    }
    next();
  }

  public static validateTemplatePayload(req: Request, res: Response, next: NextFunction): void {
    const { name, bodyMarkdown, bodyHtml } = req.body;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Template name must be a non-empty string' });
      return;
    }
    if (!bodyMarkdown || typeof bodyMarkdown !== 'string') {
      res.status(400).json({ error: 'Template bodyMarkdown must be a non-empty string' });
      return;
    }
    if (!bodyHtml || typeof bodyHtml !== 'string') {
      res.status(400).json({ error: 'Template bodyHtml must be a non-empty string' });
      return;
    }
    next();
  }

  public static validatePreferencesPayload(req: Request, res: Response, next: NextFunction): void {
    const { emailEnabled, inAppEnabled, quietHoursStart, quietHoursEnd, minPriority } = req.body;

    if (emailEnabled !== undefined && typeof emailEnabled !== 'boolean') {
      res.status(400).json({ error: 'emailEnabled must be a boolean' });
      return;
    }
    if (inAppEnabled !== undefined && typeof inAppEnabled !== 'boolean') {
      res.status(400).json({ error: 'inAppEnabled must be a boolean' });
      return;
    }

    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (quietHoursStart && !timeRegex.test(quietHoursStart)) {
      res.status(400).json({ error: 'quietHoursStart must match HH:MM format' });
      return;
    }
    if (quietHoursEnd && !timeRegex.test(quietHoursEnd)) {
      res.status(400).json({ error: 'quietHoursEnd must match HH:MM format' });
      return;
    }

    if (minPriority && !['low', 'medium', 'high'].includes(minPriority)) {
      res.status(400).json({ error: 'minPriority must be one of low, medium, or high' });
      return;
    }

    next();
  }
}
