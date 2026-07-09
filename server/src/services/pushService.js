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
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('📣 [Push Service] Skip sending notification: VAPID keys not configured in server env');
    return;
  }

  try {
    const [subs] = await db.execute(
      'SELECT * FROM push_subscriptions WHERE user_id = ?',
      [userId]
    );

    console.log(`📣 [Push Service] Found ${subs ? subs.length : 0} device subscriptions for User ID: ${userId}`);

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
        console.log(`📣 [Push Service] Attempting delivery to endpoint: ${sub.endpoint.substring(0, 45)}...`);
        const result = await webpush.sendNotification(subscription, pushPayload);
        console.log(`📣 [Push Service] Delivery SUCCESS to User ID: ${userId}, Status Code: ${result.statusCode}`);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.warn(`📣 [Push Service] Subscription expired (Status: ${err.statusCode}). Cleaning up subscription ID: ${sub.id}`);
          await db.execute('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
        } else {
          console.error(`📣 [Push Service] Delivery FAILURE to endpoint ${sub.endpoint.substring(0, 45)}... Error:`, err.message || err);
        }
      }
    }
  } catch (err) {
    console.error('📣 [Push Service Database Error]:', err);
  }
}

module.exports = { sendPushToUser };
