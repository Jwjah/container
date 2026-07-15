import { INotificationPreferenceRepository } from '../../interfaces/INotificationPreferenceRepository';
import { NotificationPreference } from '../../domain/entities/NotificationPreference';
import { NotificationPriority } from '../../domain/enums/NotificationPriority';
import db from '../../../config/database';

export class SqlNotificationPreferenceRepository implements INotificationPreferenceRepository {
  public async findByUserId(userId: number, connection?: any): Promise<NotificationPreference | null> {
    const executor = connection || db;
    try {
      const [rows] = await executor.execute('SELECT * FROM notification_preferences WHERE user_id = ?', [userId]);
      const row = (rows as any[])[0];
      if (!row) return null;

      return new NotificationPreference(
        row.id,
        row.user_id,
        row.email_enabled === 1,
        row.in_app_enabled === 1,
        row.quiet_hours_start,
        row.quiet_hours_end,
        row.min_priority as NotificationPriority,
        row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at)
      );
    } catch (err: any) {
      console.error('[SqlNotificationPreferenceRepository.findByUserId] Error:', err.message);
      throw err;
    }
  }

  public async create(pref: NotificationPreference, connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      const query = `
        INSERT INTO notification_preferences (
          user_id, email_enabled, in_app_enabled, quiet_hours_start, quiet_hours_end, min_priority
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;
      await executor.execute(query, [
        pref.userId,
        pref.emailEnabled ? 1 : 0,
        pref.inAppEnabled ? 1 : 0,
        pref.quietHoursStart,
        pref.quietHoursEnd,
        pref.minPriority
      ]);
    } catch (err: any) {
      console.error('[SqlNotificationPreferenceRepository.create] Error:', err.message);
      throw err;
    }
  }

  public async update(pref: NotificationPreference, connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      const query = `
        UPDATE notification_preferences 
        SET email_enabled = ?, in_app_enabled = ?, quiet_hours_start = ?, quiet_hours_end = ?, min_priority = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      await executor.execute(query, [
        pref.emailEnabled ? 1 : 0,
        pref.inAppEnabled ? 1 : 0,
        pref.quietHoursStart,
        pref.quietHoursEnd,
        pref.minPriority,
        pref.id
      ]);
    } catch (err: any) {
      console.error('[SqlNotificationPreferenceRepository.update] Error:', err.message);
      throw err;
    }
  }

  public async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      await executor.execute('DELETE FROM notification_preferences');
    } catch (err: any) {
      console.error('[SqlNotificationPreferenceRepository.deleteAll] Error:', err.message);
      throw err;
    }
  }
}
export const globalNotificationPreferenceRepository = new SqlNotificationPreferenceRepository();
