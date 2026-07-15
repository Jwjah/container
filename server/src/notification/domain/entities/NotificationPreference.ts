import { NotificationPriority } from '../enums/NotificationPriority';
import { NotificationChannel } from '../enums/NotificationChannel';

export class NotificationPreference {
  constructor(
    public readonly id: number | null,
    public readonly userId: number,
    public emailEnabled: boolean = true,
    public inAppEnabled: boolean = true,
    public quietHoursStart: string | null = null, // "HH:MM"
    public quietHoursEnd: string | null = null, // "HH:MM"
    public minPriority: NotificationPriority = NotificationPriority.LOW,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  public isChannelEnabled(channel: NotificationChannel): boolean {
    if (channel === NotificationChannel.EMAIL) return this.emailEnabled;
    if (channel === NotificationChannel.IN_APP) return this.inAppEnabled;
    return false; // Default disabled for future unsupported/unimplemented channels
  }

  public isInQuietHours(date: Date): boolean {
    if (!this.quietHoursStart || !this.quietHoursEnd) {
      return false;
    }

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${hours}:${minutes}`;

    const start = this.quietHoursStart;
    const end = this.quietHoursEnd;

    if (start < end) {
      return currentTimeStr >= start && currentTimeStr <= end;
    } else {
      // Spans midnight, e.g. "22:00" to "08:00"
      return currentTimeStr >= start || currentTimeStr <= end;
    }
  }

  public update(emailEnabled: boolean, inAppEnabled: boolean, quietHoursStart: string | null, quietHoursEnd: string | null, minPriority: NotificationPriority): void {
    this.emailEnabled = emailEnabled;
    this.inAppEnabled = inAppEnabled;
    this.quietHoursStart = quietHoursStart;
    this.quietHoursEnd = quietHoursEnd;
    this.minPriority = minPriority;
    this.updatedAt = new Date();
  }
}
