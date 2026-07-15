import { NotificationTemplate } from '../domain/entities/NotificationTemplate';

export interface INotificationTemplateRepository {
  findByName(name: string, connection?: any): Promise<NotificationTemplate | null>;
  create(template: NotificationTemplate, connection?: any): Promise<void>;
  update(template: NotificationTemplate, connection?: any): Promise<void>;
  deleteAll(connection?: any): Promise<void>;
}
