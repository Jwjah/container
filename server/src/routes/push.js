const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

// POST /api/push/subscribe — Store a push subscription
router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const { subscription } = req.body;
    
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    const { endpoint, keys } = subscription;
    
    // Avoid duplicates
    const [existing] = await db.execute(
      'SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
      [req.user.id, endpoint]
    );
    
    if (existing.length > 0) {
      // Update existing if keys changed, though usually endpoint changes when keys change
      await db.execute(
        'UPDATE push_subscriptions SET p256dh = ?, auth = ? WHERE id = ?',
        [keys.p256dh, keys.auth, existing[0].id]
      );
      return res.json({ message: 'Push subscription updated' });
    }
    
    await db.execute(
      'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
      [req.user.id, endpoint, keys.p256dh, keys.auth]
    );
    
    res.status(201).json({ message: 'Push subscription saved' });
  } catch (err) {
    console.error('Push subscribe error:', err);
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
