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

  public async handleFulfillmentAssigned(payload: any): Promise<void> {
    const { orderId, studentId, assignedAgentId, rawOtp } = payload;
    console.log(`[NotificationConsumer] Processing FULFILLMENT_ASSIGNED for Order #${orderId}`);

    // Notify student
    try {
      await sendPushToUser(studentId, {
        title: 'Delivery Agent Assigned',
        message: `Your print order #${orderId} is being processed for delivery. Your OTP is ${rawOtp || 'N/A'}.`
      });
    } catch (e: any) {
      console.error(`[NotificationConsumer] Failed to send push to student ${studentId}:`, e.message);
    }

    // Notify agent
    try {
      await sendPushToUser(assignedAgentId, {
        title: 'New Delivery Assigned',
        message: `You have been assigned to deliver order #${orderId}. Please pick it up from the shop.`
      });
    } catch (e: any) {
      console.error(`[NotificationConsumer] Failed to send push to agent ${assignedAgentId}:`, e.message);
    }
  }

  public async handleFulfillmentStarted(payload: any): Promise<void> {
    const { orderId, studentId } = payload;
    console.log(`[NotificationConsumer] Processing FULFILLMENT_STARTED for Order #${orderId}`);
    try {
      await sendPushToUser(studentId, {
        title: 'Order Out For Delivery',
        message: `Your print order #${orderId} is now out for delivery!`
      });
    } catch (e: any) {
      console.error(`[NotificationConsumer] Failed to send push to student ${studentId}:`, e.message);
    }
  }

  public async handleDeliveryCompleted(payload: any): Promise<void> {
    const { orderId, studentId, proofOfDeliveryReference } = payload;
    console.log(`[NotificationConsumer] Processing DELIVERY_COMPLETED for Order #${orderId}`);
    try {
      await sendPushToUser(studentId, {
        title: 'Order Delivered',
        message: `Your print order #${orderId} has been successfully delivered. Proof: ${proofOfDeliveryReference || 'N/A'}`
      });
    } catch (e: any) {
      console.error(`[NotificationConsumer] Failed to send push to student ${studentId}:`, e.message);
    }
  }

  public async handlePickupCompleted(payload: any): Promise<void> {
    const { orderId, studentId } = payload;
    console.log(`[NotificationConsumer] Processing PICKUP_COMPLETED for Order #${orderId}`);
    try {
      await sendPushToUser(studentId, {
        title: 'Order Picked Up',
        message: `Your print order #${orderId} has been picked up from the shop.`
      });
    } catch (e: any) {
      console.error(`[NotificationConsumer] Failed to send push to student ${studentId}:`, e.message);
    }
  }

  public async handleDeliveryFailed(payload: any): Promise<void> {
    const { orderId, studentId, reason } = payload;
    console.log(`[NotificationConsumer] Processing DELIVERY_FAILED for Order #${orderId}`);
    try {
      await sendPushToUser(studentId, {
        title: 'Delivery Failed',
        message: `Delivery attempt failed for order #${orderId}. Reason: ${reason || 'Unavailable'}`
      });
    } catch (e: any) {
      console.error(`[NotificationConsumer] Failed to send push to student ${studentId}:`, e.message);
    }
  }

  public async handleOtpRegenerated(payload: any): Promise<void> {
    const { orderId, studentId, rawOtp } = payload;
    console.log(`[NotificationConsumer] Processing OTP_REGENERATED for Order #${orderId}`);
    try {
      await sendPushToUser(studentId, {
        title: 'New Delivery OTP',
        message: `Your new OTP for order #${orderId} is ${rawOtp || 'N/A'}.`
      });
    } catch (e: any) {
      console.error(`[NotificationConsumer] Failed to send push to student ${studentId}:`, e.message);
    }
  }
}

