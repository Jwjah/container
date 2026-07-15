import { Notification } from '../domain/entities/Notification';
import { NotificationPreference } from '../domain/entities/NotificationPreference';
import { NotificationTemplate } from '../domain/entities/NotificationTemplate';
import { NotificationDTO, NotificationPreferenceDTO, NotificationTemplateDTO } from './NotificationDTO';

export class NotificationMapper {
  public static toNotificationDTO(n: Notification): NotificationDTO {
    return {
      id: n.id || 0,
      userId: n.userId,
      type: n.type,
      priority: n.priority,
      title: n.title,
      content: n.content,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
      attempts: n.deliveryAttempts.map(a => ({
        channel: a.channel,
        status: a.status,
        errorMessage: a.errorMessage,
        attemptedAt: a.attemptedAt.toISOString()
      }))
    };
  }

  public static toPreferenceDTO(p: NotificationPreference): NotificationPreferenceDTO {
    return {
      userId: p.userId,
      emailEnabled: p.emailEnabled,
      inAppEnabled: p.inAppEnabled,
      quietHoursStart: p.quietHoursStart,
      quietHoursEnd: p.quietHoursEnd,
      minPriority: p.minPriority
    };
  }

  public static toTemplateDTO(t: NotificationTemplate): NotificationTemplateDTO {
    return {
      id: t.id,
      name: t.name,
      subject: t.subject,
      bodyMarkdown: t.bodyMarkdown,
      bodyHtml: t.bodyHtml,
      version: t.version
    };
  }
}
