const db = require('../config/database');
const { generateQRCode } = require('../utils/helpers');

// GET /api/agent/available — Get available deliveries (Gig Radar)
exports.getAvailableDeliveries = async (req, res) => {
  try {
    const [orders] = await db.execute(
      `SELECT o.*, s.shop_name, s.location as shop_location, u.name as student_name, u.hostel, u.room_number
       FROM orders o 
       JOIN shops s ON o.shop_id = s.id 
       JOIN users u ON o.student_id = u.id
       WHERE o.status = 'ready' AND o.delivery_type = 'hostel' AND o.agent_id IS NULL
       ORDER BY o.created_at ASC`
    );
    res.json({ deliveries: orders });
  } catch (err) {
    console.error('Available deliveries error:', err);
    res.status(500).json({ error: 'Failed to fetch deliveries' });
  }
};

// POST /api/agent/accept/:orderId — Accept a delivery
exports.acceptDelivery = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    // Check concurrent limit (max 5)
    const [[{ active }]] = await db.execute(
      "SELECT COUNT(*) as active FROM deliveries WHERE agent_id = ? AND status IN ('assigned','picked_up','in_transit')",
      [req.user.id]
    );
    if (active >= 5) {
      return res.status(400).json({ error: 'Maximum 5 concurrent deliveries reached' });
    }

    // Check order is still available
    const [orders] = await db.execute(
      "SELECT * FROM orders WHERE id = ? AND status = 'ready' AND delivery_type = 'hostel' AND agent_id IS NULL",
      [orderId]
    );
    if (!orders.length) {
      return res.status(404).json({ error: 'Delivery no longer available' });
    }

    const order = orders[0];

    // Assign agent to the order but keep status as 'ready'.
    // The order will only move to 'out_for_delivery' AFTER the agent
    // physically goes to the shop and scans the shop's QR code (verifyPickup).
    await db.execute('UPDATE orders SET agent_id = ? WHERE id = ?', [req.user.id, orderId]);

    // Create delivery record — starts in 'assigned' state
    const earnings = parseFloat(order.delivery_fee) * 0.8; // 80% to agent
    await db.execute(
      'INSERT INTO deliveries (order_id, agent_id, earnings) VALUES (?, ?, ?)',
      [orderId, req.user.id, earnings]
    );

    // Notify student that an agent has been assigned and is on the way to the shop
    await db.execute(
      'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [order.student_id, '\uD83D\uDE80 Delivery Agent Assigned', 'A delivery agent has accepted your order and will collect it from the shop shortly.', 'delivery']
    );

    res.json({ message: 'Delivery accepted', orderId, earnings });
  } catch (err) {
    console.error('Accept delivery error:', err);
    res.status(500).json({ error: 'Failed to accept delivery' });
  }
};

// POST /api/agent/missions/:orderId/drop — Drop an accepted delivery
exports.dropDelivery = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    
    // Check if the order is assigned to this agent and not yet delivered
    const [orders] = await db.execute(
      'SELECT * FROM orders WHERE id = ? AND agent_id = ? AND status != "delivered"',
      [orderId, req.user.id]
    );
    
    if (!orders.length) {
      return res.status(404).json({ error: 'Order not found or not assigned to you' });
    }

    // Reset order
    await db.execute('UPDATE orders SET agent_id = NULL, status = "ready" WHERE id = ?', [orderId]);
    
    // Update delivery record to dropped
    await db.execute("UPDATE deliveries SET status = 'cancelled' WHERE order_id = ? AND agent_id = ?", [orderId, req.user.id]);
    
    res.json({ message: 'Mission dropped successfully' });
  } catch (err) {
    console.error('Drop delivery error:', err);
    res.status(500).json({ error: 'Failed to drop mission' });
  }
};

// GET /api/agent/missions — Get active missions
exports.getActiveMissions = async (req, res) => {
  try {
    const [missions] = await db.execute(
      `SELECT 
              d.id as delivery_id, d.order_id, d.agent_id, d.status, d.pickup_verified, d.dropoff_verified, d.earnings,
              o.id as order_id, o.order_hash, o.delivery_type, o.hostel_address, o.pickup_qr, o.delivery_qr, o.total_price,
              s.shop_name, s.location as shop_location,
              u.name as student_name, u.hostel, u.room_number, u.phone as student_phone
       FROM deliveries d
       JOIN orders o ON d.order_id = o.id
       JOIN shops s ON o.shop_id = s.id
       JOIN users u ON o.student_id = u.id
       WHERE d.agent_id = ? AND d.status IN ('assigned','picked_up','in_transit')
       ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json({ missions });
  } catch (err) {
    console.error('Active missions error:', err);
    res.status(500).json({ error: 'Failed to fetch missions' });
  }
};

// POST /api/agent/verify-pickup — Agent scans shop QR to confirm they have collected the printout
exports.verifyPickup = async (req, res) => {
  try {
    const { orderId, hash } = req.body;

    // Check if this hash exists at all
    const [anyOrderWithHash] = await db.execute('SELECT id, agent_id, status FROM orders WHERE order_hash = ?', [hash]);
    
    if (!anyOrderWithHash.length) {
      return res.status(400).json({ error: 'Invalid QR code. This code is not recognized in the system.' });
    }

    if (anyOrderWithHash[0].id != orderId) {
      return res.status(400).json({ error: 'Oops! This QR code belongs to a DIFFERENT order. Please scan the correct one.' });
    }

    // Now find the exact order for this agent in 'ready' state
    const [orders] = await db.execute(
      `SELECT * FROM orders 
       WHERE id = ? 
       AND agent_id = ? 
       AND status = 'ready'
       AND delivery_type = 'hostel'
       AND order_hash = ?`,
      [orderId, req.user.id, hash]
    );

    if (!orders.length) {
      return res.status(400).json({ 
        error: 'Order is not in a valid state for pickup. Make sure you accepted it and it is ready.' 
      });
    }

    // Update the delivery record to in_transit
    await db.execute(
      "UPDATE deliveries SET status = 'in_transit', pickup_verified = 1, pickup_time = CURRENT_TIMESTAMP WHERE order_id = ? AND agent_id = ?",
      [orderId, req.user.id]
    );

    // Update the order status to out_for_delivery so the student can see it's coming
    await db.execute(
      "UPDATE orders SET status = 'out_for_delivery' WHERE id = ?",
      [orderId]
    );

    // Notify the student
    await db.execute(
      'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [orders[0].student_id, '\uD83D\uDE80 Order Out for Delivery', 'The delivery agent has picked up your printout and is on the way to you!', 'delivery']
    );

    res.json({ message: 'Pickup verified. Head to the student now.' });
  } catch (err) {
    console.error('Verify pickup error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
};

// POST /api/agent/verify-delivery — Verify delivery with QR
exports.verifyDelivery = async (req, res) => {
  try {
    const { orderId, hash } = req.body;

    // Check if this hash exists at all
    const [anyOrderWithHash] = await db.execute('SELECT id, agent_id, status FROM orders WHERE order_hash = ?', [hash]);
    
    if (!anyOrderWithHash.length) {
      return res.status(400).json({ error: 'Invalid QR code. This code is not recognized in the system.' });
    }

    if (anyOrderWithHash[0].id != orderId) {
      return res.status(400).json({ error: 'Oops! This QR code belongs to a DIFFERENT order. Please scan the correct one.' });
    }

    const [orders] = await db.execute(
      "SELECT * FROM orders WHERE id = ? AND order_hash = ? AND agent_id = ? AND status = 'out_for_delivery'",
      [orderId, hash, req.user.id]
    );
    if (!orders.length) {
      return res.status(400).json({ error: 'Order is not in out_for_delivery state or not assigned to you.' });
    }

    await db.execute("UPDATE deliveries SET status = 'delivered', dropoff_verified = 1, delivery_time = CURRENT_TIMESTAMP WHERE order_id = ? AND agent_id = ?",
      [orderId, req.user.id]
    );
    await db.execute("UPDATE orders SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP WHERE id = ?", [orderId]);

    // Credit agent wallet
    const [deliveries] = await db.execute('SELECT earnings FROM deliveries WHERE order_id = ? AND agent_id = ?', [orderId, req.user.id]);
    if (deliveries.length) {
      const earning = parseFloat(deliveries[0].earnings);
      await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [earning, req.user.id]);
      
      const [[{ wallet_balance }]] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
      
      await db.execute(
        'INSERT INTO transactions (user_id, type, amount, description, reference_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, 'credit', earning, `Delivery #${orders[0].order_hash.substring(0, 8).toUpperCase()}`, orders[0].order_hash, wallet_balance]
      );

      // NOTIFY AGENT
      await db.execute(
        'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
        [req.user.id, '💰 Earnings Credited!', `You earned ₹${earning.toFixed(0)} for delivery #${orders[0].order_hash.substring(0, 8).toUpperCase()}.`, 'wallet']
      );
    }

    res.json({ message: 'Delivery verified! Earnings credited.' });
  } catch (err) {
    console.error('Verify delivery error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
};

// GET /api/agent/earnings — Agent earnings summary
exports.getEarnings = async (req, res) => {
  try {
    const agentId = parseInt(req.user.id);
    // FAIL-SAFE: Pull earnings from deliveries, but wallet from users
    const [earnRows] = await db.execute(
      `SELECT 
        (SELECT COALESCE(SUM(earnings), 0) FROM deliveries WHERE agent_id = ? AND status = 'delivered') as total_earned_deliveries,
        (SELECT COUNT(*) FROM deliveries WHERE agent_id = ? AND status = 'delivered') as total_deliveries,
        (SELECT wallet_balance FROM users WHERE id = ?) as current_wallet
      `,
      [agentId, agentId, agentId]
    );
    const stats = earnRows[0] || { total_earned_deliveries: 0, total_deliveries: 0, current_wallet: 0 };
    
    const [recent] = await db.execute(
      `SELECT d.id as delivery_id, d.status, d.earnings, d.delivery_time, d.created_at as delivery_date,
              o.order_hash, o.hostel_address, s.shop_name, u.name as student_name, u.hostel, u.room_number
       FROM deliveries d 
       JOIN orders o ON d.order_id = o.id 
       JOIN shops s ON o.shop_id = s.id
       JOIN users u ON o.student_id = u.id
       WHERE d.agent_id = ? ORDER BY d.created_at DESC LIMIT 50`,
      [agentId]
    );

    res.json({
      earnings: { 
        total_earned: parseFloat(stats.current_wallet || stats.total_earned_deliveries || 0), 
        total_deliveries: parseInt(stats.total_deliveries || 0) 
      },
      recent,
    });
  } catch (err) {
    console.error('Earnings error:', err);
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
};
