const webpush = require('web-push');
const db = require('../config/database');

// Configure web-push with VAPID details
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.SMTP_USER || 'admin@campusprint.com'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('⚠️ Push notifications disabled: VAPID keys missing from .env');
}

/**
 * Send a push notification to all devices of a given user.
 * @param {number} userId - The ID of the user to notify
 * @param {Object} payload - Notification data
 * @param {string} payload.title - Notification title
 * @param {string} payload.message - Notification body
 * @param {string} [payload.url] - URL to open when clicked
 * @param {string} [payload.tag] - Tag to group/replace notifications
 */
async function sendPushToUser(userId, payload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  try {
    const [subs] = await db.execute(
      'SELECT * FROM push_subscriptions WHERE user_id = ?',
      [userId]
    );

    if (!subs || subs.length === 0) return;

    const pushPayload = JSON.stringify(payload);

    for (const sub of subs) {
      const subscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(subscription, pushPayload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription has expired or is no longer valid, remove it
          await db.execute('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
        } else {
          console.error(`[Push Error] Failed to send to endpoint ${sub.endpoint}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('[Push Error] Database query failed:', err);
  }
}

module.exports = { sendPushToUser };
