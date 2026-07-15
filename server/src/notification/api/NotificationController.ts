import { Request, Response } from 'express';
import { INotificationRepository } from '../interfaces/INotificationRepository';
import { INotificationTemplateRepository } from '../interfaces/INotificationTemplateRepository';
import { INotificationPreferenceRepository } from '../interfaces/INotificationPreferenceRepository';
import { NotificationPreference } from '../domain/entities/NotificationPreference';
import { NotificationTemplate } from '../domain/entities/NotificationTemplate';
import { NotificationMapper } from './NotificationMapper';
import { NotificationPriority } from '../domain/enums/NotificationPriority';
import { NotificationMetricsService } from '../application/metrics/NotificationMetricsService';
import { NotificationReplayService } from '../application/replay/NotificationReplayService';
import { ReplayProgressTracker } from '../application/replay/ReplayProgressTracker';
import db from '../../config/database';

/**
 * NotificationController — exposes REST endpoints for RFC-009 with strict role authentication checks.
 *
 * RFC-009 Specification
 */
export class NotificationController {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly templateRepo: INotificationTemplateRepository,
    private readonly preferenceRepo: INotificationPreferenceRepository,
    private readonly metricsService: NotificationMetricsService,
    private readonly replayService: NotificationReplayService,
    private readonly progressTracker: ReplayProgressTracker
  ) {}

  public getNotifications = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const list = await this.notificationRepo.findByUserId(user.id);
      res.status(200).json(list.map(n => NotificationMapper.toNotificationDTO(n)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getNotificationById = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    const id = Number(req.params.id);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const n = await this.notificationRepo.findById(id);
      if (!n) {
        res.status(404).json({ error: 'Notification not found' });
        return;
      }

      // Check ownership
      if (n.userId !== user.id && user.role !== 'admin') {
        res.status(403).json({ error: 'Access denied: cannot view another user\'s notifications' });
        return;
      }

      res.status(200).json(NotificationMapper.toNotificationDTO(n));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public markAsRead = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    const id = Number(req.params.id);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const n = await this.notificationRepo.findById(id);
      if (!n) {
        res.status(404).json({ error: 'Notification not found' });
        return;
      }

      // Check ownership
      if (n.userId !== user.id && user.role !== 'admin') {
        res.status(403).json({ error: 'Access denied: cannot modify another user\'s notifications' });
        return;
      }

      n.markAsRead();
      await this.notificationRepo.update(n);
      res.status(200).json({ message: 'Notification marked as read successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public markAllAsRead = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      await db.execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [user.id]);
      res.status(200).json({ message: 'All notifications marked as read successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getPreferences = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      let pref = await this.preferenceRepo.findByUserId(user.id);
      if (!pref) {
        // Return default unsaved object
        pref = new NotificationPreference(
          null,
          user.id,
          true,
          true,
          null,
          null,
          NotificationPriority.LOW
        );
      }
      res.status(200).json(NotificationMapper.toPreferenceDTO(pref));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public updatePreferences = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { emailEnabled, inAppEnabled, quietHoursStart, quietHoursEnd, minPriority } = req.body;

    try {
      let pref = await this.preferenceRepo.findByUserId(user.id);

      if (!pref) {
        pref = new NotificationPreference(
          null,
          user.id,
          emailEnabled !== false,
          inAppEnabled !== false,
          quietHoursStart || null,
          quietHoursEnd || null,
          (minPriority as NotificationPriority) || NotificationPriority.LOW
        );
        await this.preferenceRepo.create(pref);
      } else {
        pref.update(
          emailEnabled !== undefined ? emailEnabled : pref.emailEnabled,
          inAppEnabled !== undefined ? inAppEnabled : pref.inAppEnabled,
          quietHoursStart !== undefined ? quietHoursStart : pref.quietHoursStart,
          quietHoursEnd !== undefined ? quietHoursEnd : pref.quietHoursEnd,
          (minPriority as NotificationPriority) || pref.minPriority
        );
        await this.preferenceRepo.update(pref);
      }

      res.status(200).json(NotificationMapper.toPreferenceDTO(pref));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public createTemplate = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Admin privileges required' });
      return;
    }

    const { name, subject, bodyMarkdown, bodyHtml, version } = req.body;

    try {
      const template = new NotificationTemplate(
        null,
        name,
        subject || null,
        bodyMarkdown,
        bodyHtml,
        version || 1
      );
      await this.templateRepo.create(template);
      res.status(201).json(NotificationMapper.toTemplateDTO(template));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getTemplates = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Admin privileges required' });
      return;
    }

    const name = String(req.params.name);
    try {
      const template = await this.templateRepo.findByName(name);
      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }
      res.status(200).json(NotificationMapper.toTemplateDTO(template));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public triggerReplay = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Admin privileges required' });
      return;
    }

    try {
      this.replayService.triggerReplay();
      res.status(202).json({ message: 'Notification replay triggered successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getReplayStatus = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Admin privileges required' });
      return;
    }

    const progress = this.progressTracker.getProgress();
    res.status(200).json(progress);
  };

  public getMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
      const metrics = await this.metricsService.getMetricsString();
      res.set('Content-Type', 'text/plain');
      res.status(200).send(metrics);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
}
