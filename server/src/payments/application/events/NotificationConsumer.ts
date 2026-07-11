import db from '../../../config/database';
const { sendPushToUser } = require('../../../services/pushService');

export class NotificationConsumer {
  public async handleOrderFinalized(payload: any): Promise<void> {
    const { studentId, shopId, orderId, totalPrice } = payload;

    console.log(`[NotificationConsumer] Processing confirmation notifications for Order #${orderId}`);

    // 1. Send push to Student
    try {
      await sendPushToUser(studentId, {
        title: 'Order Confirmed',
        message: `Your payment of ₹${totalPrice} was successful. Order #${orderId} has been sent to the print queue.`
      });
    } catch (e: any) {
      console.error(`[NotificationConsumer] Failed to send push to student ${studentId}:`, e.message);
      throw e; // Propagate up so EventDispatcher aggregates it for outbox retry
    }

    // 2. Resolve Shop owner user_id dynamically from shopId
    const [shops] = await db.execute('SELECT user_id FROM shops WHERE id = ?', [shopId]);
    if (shops && shops.length > 0) {
      const managerUserId = shops[0].user_id;
      try {
        await sendPushToUser(managerUserId, {
          title: 'New Print Job Queued',
          message: `New paid order #${orderId} is confirmed. Please review your queue.`
        });
      } catch (e: any) {
        console.error(`[NotificationConsumer] Failed to send push to shop owner ${managerUserId}:`, e.message);
        throw e; // Propagate up so EventDispatcher aggregates it for outbox retry
      }
    } else {
      console.warn(`[NotificationConsumer] Shop not found for ID: ${shopId}`);
    }
  }
}
