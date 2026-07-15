import db from '../../../config/database';

/**
 * NotificationMetricsService — exposes Prometheus metrics for the notification context.
 *
 * RFC-009 Specification
 */
export class NotificationMetricsService {
  public static replayEventsProcessedCount = 0;

  /**
   * Serializes current metrics database totals into Prometheus scraping formatting.
   */
  public async getMetricsString(): Promise<string> {
    // 1. Total Notifications Created
    const [notifRows] = await db.execute('SELECT COUNT(*) AS total FROM notifications');
    const notifCount = Number((notifRows as any[])[0]?.total ?? 0);

    // 2. Unread Notifications Count
    const [unreadRows] = await db.execute('SELECT COUNT(*) AS total FROM notifications WHERE is_read = 0');
    const unreadCount = Number((unreadRows as any[])[0]?.total ?? 0);

    // 3. Email Attempts counts
    const [emailSentRows] = await db.execute(
      "SELECT COUNT(*) AS total FROM notification_delivery_attempts WHERE channel = 'email' AND status = 'sent'"
    );
    const emailSent = Number((emailSentRows as any[])[0]?.total ?? 0);

    const [emailFailedRows] = await db.execute(
      "SELECT COUNT(*) AS total FROM notification_delivery_attempts WHERE channel = 'email' AND status = 'failed'"
    );
    const emailFailed = Number((emailFailedRows as any[])[0]?.total ?? 0);

    // 4. In App Attempts counts
    const [inAppSentRows] = await db.execute(
      "SELECT COUNT(*) AS total FROM notification_delivery_attempts WHERE channel = 'in_app' AND status = 'sent'"
    );
    const inAppSent = Number((inAppSentRows as any[])[0]?.total ?? 0);

    return [
      '# HELP notification_created_total Cumulative count of alerts saved.',
      '# TYPE notification_created_total counter',
      `notification_created_total ${notifCount}`,
      '',
      '# HELP notification_unread_count Active unread alerts.',
      '# TYPE notification_unread_count gauge',
      `notification_unread_count ${unreadCount}`,
      '',
      '# HELP email_delivery_sent_total Successful email deliveries.',
      '# TYPE email_delivery_sent_total counter',
      `email_delivery_sent_total ${emailSent}`,
      '',
      '# HELP email_delivery_failed_total Failed email attempts.',
      '# TYPE email_delivery_failed_total counter',
      `email_delivery_failed_total ${emailFailed}`,
      '',
      '# HELP in_app_delivery_sent_total Successful saved internal notifications.',
      '# TYPE in_app_delivery_sent_total counter',
      `in_app_delivery_sent_total ${inAppSent}`,
      '',
      '# HELP notification_replay_processed_total Cumulative count of replayed events in this context.',
      '# TYPE notification_replay_processed_total counter',
      `notification_replay_processed_total ${NotificationMetricsService.replayEventsProcessedCount}`
    ].join('\n');
  }
}
