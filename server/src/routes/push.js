const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

// POST /api/push/subscribe — Store a push subscription
router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const { subscription } = req.body;
    
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      console.warn('📬 [Push Subscribe] Invalid subscription payload received for user:', req.user.id);
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    const { endpoint, keys } = subscription;
    console.log(`📬 [Push Subscribe] Request from User ID: ${req.user.id}, Endpoint: ${endpoint.substring(0, 45)}...`);
    
    // Avoid duplicates
    const [existing] = await db.execute(
      'SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
      [req.user.id, endpoint]
    );
    
    if (existing.length > 0) {
      await db.execute(
        'UPDATE push_subscriptions SET p256dh = ?, auth = ? WHERE id = ?',
        [keys.p256dh, keys.auth, existing[0].id]
      );
      console.log(`📬 [Push Subscribe] Updated subscription details for User ID: ${req.user.id}`);
      return res.json({ message: 'Push subscription updated' });
    }
    
    await db.execute(
      'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
      [req.user.id, endpoint, keys.p256dh, keys.auth]
    );
    console.log(`📬 [Push Subscribe] Saved new subscription successfully for User ID: ${req.user.id}`);
    
    res.status(201).json({ message: 'Push subscription saved' });
  } catch (err) {
    console.error('📬 [Push Subscribe Error]:', err);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// DELETE /api/push/unsubscribe — Remove a push subscription
router.delete('/unsubscribe', authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }

    await db.execute(
      'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
      [req.user.id, endpoint]
    );
    
    res.json({ message: 'Unsubscribed successfully' });
  } catch (err) {
    console.error('Push unsubscribe error:', err);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

module.exports = router;
