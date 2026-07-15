import { NotificationPreference } from '../domain/entities/NotificationPreference';

export interface INotificationPreferenceRepository {
  findByUserId(userId: number, connection?: any): Promise<NotificationPreference | null>;
  create(pref: NotificationPreference, connection?: any): Promise<void>;
  update(pref: NotificationPreference, connection?: any): Promise<void>;
  deleteAll(connection?: any): Promise<void>;
}
