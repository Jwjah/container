import { INotificationPreferenceRepository } from '../../interfaces/INotificationPreferenceRepository';
import { NotificationPreference } from '../../domain/entities/NotificationPreference';
import { NotificationChannel } from '../../domain/enums/NotificationChannel';
import { NotificationPriority } from '../../domain/enums/NotificationPriority';

/**
 * PreferenceResolver — resolves user opt-out states, priority levels, and quiet hours constraints.
 *
 * RFC-009 Specification
 */
export class PreferenceResolver {
  constructor(private readonly preferenceRepo: INotificationPreferenceRepository) {}

  /**
   * Resolves whether a notification of specific priority should be dispatched to the recipient on the given channel.
   */
  public async shouldDeliver(
    userId: number,
    channel: NotificationChannel,
    priority: NotificationPriority,
    now: Date = new Date(),
    connection?: any
  ): Promise<boolean> {
    let pref = await this.preferenceRepo.findByUserId(userId, connection);

    // Fallback default preference if none stored
    if (!pref) {
      pref = new NotificationPreference(
        null,
        userId,
        true, // emailEnabled
        true, // inAppEnabled
        null, // quietHoursStart
        null, // quietHoursEnd
        NotificationPriority.LOW
      );
    }

    // 1. Check channel opt-in/opt-out toggle
    if (!pref.isChannelEnabled(channel)) {
      return false;
    }

    // 2. Check priority threshold filter
    const priorityWeights = {
      [NotificationPriority.LOW]: 1,
      [NotificationPriority.MEDIUM]: 2,
      [NotificationPriority.HIGH]: 3
    };
    if (priorityWeights[priority] < priorityWeights[pref.minPriority]) {
      return false;
    }

    // 3. Check quiet hours restriction
    if (pref.isInQuietHours(now)) {
      // High priority notifications always bypass quiet hours
      if (priority !== NotificationPriority.HIGH) {
        console.log(`🔇 [PreferenceResolver] Silenced notification for user ${userId} on channel ${channel} due to quiet hours`);
        return false;
      }
    }

    return true;
  }
}
