import { PreferenceResolver } from './PreferenceResolver';
import { NotificationChannel } from '../../domain/enums/NotificationChannel';
import { NotificationPriority } from '../../domain/enums/NotificationPriority';

/**
 * ChannelRouter — coordinates with PreferenceResolver to decide delivery paths.
 *
 * RFC-009 Specification
 */
export class ChannelRouter {
  constructor(private readonly preferenceResolver: PreferenceResolver) {}

  /**
   * Resolves list of valid channels for delivery.
   */
  public async route(
    userId: number,
    priority: NotificationPriority,
    now: Date = new Date(),
    connection?: any
  ): Promise<NotificationChannel[]> {
    const channels: NotificationChannel[] = [];

    // Check In-App preference
    const shouldSendInApp = await this.preferenceResolver.shouldDeliver(
      userId,
      NotificationChannel.IN_APP,
      priority,
      now,
      connection
    );
    if (shouldSendInApp) {
      channels.push(NotificationChannel.IN_APP);
    }

    // Check Email preference
    const shouldSendEmail = await this.preferenceResolver.shouldDeliver(
      userId,
      NotificationChannel.EMAIL,
      priority,
      now,
      connection
    );
    if (shouldSendEmail) {
      channels.push(NotificationChannel.EMAIL);
    }

    return channels;
  }
}
