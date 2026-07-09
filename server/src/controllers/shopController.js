const db = require('../config/database');

// Simple in-memory queue for print jobs. 
// Keys are shop_ids, values are arrays of print jobs.
const printQueue = {};

// POST /api/shops — Register a new shop
exports.createShop = async (req, res) => {
  try {
    const { shop_name, description, location, price_bw, price_color, price_binding } = req.body;

    if (!shop_name) {
      return res.status(400).json({ error: 'Shop name is required' });
    }

    const [existing] = await db.execute('SELECT id FROM shops WHERE user_id = ?', [req.user.id]);
    if (existing.length) {
      return res.status(409).json({ error: 'You already have a registered shop' });
    }

    const [result] = await db.execute(
      'INSERT INTO shops (user_id, shop_name, description, location, price_bw, price_color, price_binding) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, shop_name, description || null, location || null, price_bw || 2.00, price_color || 5.00, price_binding || 30.00]
    );

    // Notify admins
    const [admins] = await db.execute("SELECT id FROM users WHERE role = 'admin'");
    for (const admin of admins) {
      await db.execute(
        'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
        [admin.id, '🏪 New Shop Registration', `"${shop_name}" is awaiting approval`, 'system']
      );
    }

    res.status(201).json({ message: 'Shop registered. Awaiting admin approval.', shopId: result.insertId });
  } catch (err) {
    console.error('Create shop error:', err);
    res.status(500).json({ error: 'Failed to register shop' });
  }
};

// GET /api/shops — List approved shops
exports.getShops = async (req, res) => {
  try {
    // Fetch all approved shops but group by name to avoid duplicates if users created multiple
    const [shops] = await db.execute(
      `SELECT s1.*, u.name as owner_name 
       FROM shops s1 
       JOIN users u ON s1.user_id = u.id 
       WHERE s1.is_approved = 1 
       AND s1.id = (
         SELECT MAX(id) FROM shops s2 WHERE s2.shop_name = s1.shop_name AND s2.is_approved = 1
       )
       ORDER BY s1.rating DESC`
    );
    res.json({ shops });
  } catch (err) {
    console.error('Get shops error:', err);
    res.status(500).json({ error: 'Failed to fetch shops' });
  }
};

// GET /api/shops/my — Get current user's shop
exports.getMyShop = async (req, res) => {
  try {
    const [shops] = await db.execute('SELECT * FROM shops WHERE user_id = ?', [req.user.id]);
    if (!shops.length) {
      return res.status(404).json({ error: 'No shop found' });
    }
    res.json({ shop: shops[0] });
  } catch (err) {
    console.error('Get my shop error:', err);
    res.status(500).json({ error: 'Failed to fetch shop' });
  }
};

// PATCH /api/shops/toggle — Toggle shop open/closed
exports.toggleShop = async (req, res) => {
  try {
    const [shops] = await db.execute('SELECT * FROM shops WHERE user_id = ?', [req.user.id]);
    if (!shops.length) {
      return res.status(404).json({ error: 'No shop found' });
    }

    const newStatus = shops[0].is_open ? 0 : 1;
    await db.execute('UPDATE shops SET is_open = ? WHERE id = ?', [newStatus, shops[0].id]);

    res.json({ message: `Shop is now ${newStatus ? 'OPEN' : 'CLOSED'}`, is_open: !!newStatus });
  } catch (err) {
    console.error('Toggle shop error:', err);
    res.status(500).json({ error: 'Failed to toggle shop' });
  }
};

// GET /api/shops/:id/stats — Shop statistics
exports.getShopStats = async (req, res) => {
  try {
    const shopId = req.params.id;

    const [[{ total }]] = await db.execute('SELECT COUNT(*) as total FROM orders WHERE shop_id = ?', [shopId]);
    const [[{ pending }]] = await db.execute("SELECT COUNT(*) as pending FROM orders WHERE shop_id = ? AND status = 'pending'", [shopId]);
    const [[{ printing }]] = await db.execute("SELECT COUNT(*) as printing FROM orders WHERE shop_id = ? AND status = 'printing'", [shopId]);
    const [[{ ready }]] = await db.execute("SELECT COUNT(*) as ready FROM orders WHERE shop_id = ? AND status = 'ready'", [shopId]);
    const [[{ delivered }]] = await db.execute("SELECT COUNT(*) as delivered FROM orders WHERE shop_id = ? AND status = 'delivered'", [shopId]);
    const [[{ revenue }]] = await db.execute("SELECT COALESCE(SUM(total_price), 0) as revenue FROM orders WHERE shop_id = ? AND status = 'delivered'", [shopId]);

    // Revenue by day (last 7 days)
    const [dailyRevenue] = await db.execute(
      `SELECT DATE(delivered_at) as date, SUM(total_price) as amount, COUNT(*) as count 
       FROM orders WHERE shop_id = ? AND status = 'delivered' AND delivered_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY DATE(delivered_at) ORDER BY date`,
      [shopId]
    );

    res.json({
      stats: { total, pending, printing, ready, delivered, revenue: parseFloat(revenue) },
      dailyRevenue,
    });
  } catch (err) {
    console.error('Shop stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};

// PATCH /api/shops/pricing — Update shop pricing
exports.updatePricing = async (req, res) => {
  try {
    const { price_bw, price_color, price_binding } = req.body;
    await db.execute(
      'UPDATE shops SET price_bw = ?, price_color = ?, price_binding = ? WHERE user_id = ?',
      [price_bw || 2.00, price_color || 5.00, price_binding || 30.00, req.user.id]
    );
    res.json({ message: 'Pricing updated' });
  } catch (err) {
    console.error('Update pricing error:', err);
    res.status(500).json({ error: 'Failed to update pricing' });
  }
};

// PUT /api/shops/:id — Update shop details
exports.updateShop = async (req, res) => {
  try {
    const { shop_name, description, location, price_bw, price_color, price_binding } = req.body;
    await db.execute(
      'UPDATE shops SET shop_name = ?, description = ?, location = ?, price_bw = ?, price_color = ?, price_binding = ? WHERE id = ? AND user_id = ?',
      [shop_name, description || null, location || null, price_bw || 2.0, price_color || 5.0, price_binding || 30.0, req.params.id, req.user.id]
    );
    res.json({ message: 'Shop settings updated successfully' });
  } catch (err) {
    console.error('Update shop error:', err);
    res.status(500).json({ error: 'Failed to update shop' });
  }
};

// POST /api/shops/:id/trigger-print — Add order to print queue
exports.triggerPrint = async (req, res) => {
  try {
    const shopId = req.params.id;
    const { orderId } = req.body;

    // Verify shop belongs to user
    const [shops] = await db.execute('SELECT * FROM shops WHERE id = ? AND user_id = ?', [shopId, req.user.id]);
    if (!shops.length) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get order files
    const [files] = await db.execute('SELECT * FROM order_files WHERE order_id = ?', [orderId]);
    if (!files.length) {
      return res.status(404).json({ error: 'No files found for this order' });
    }

    if (!printQueue[shopId]) {
      printQueue[shopId] = [];
    }

    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token || '';
    const baseUrl = (process.env.API_URL || 'http://localhost:5050/api');

    // Add each file to the queue
    for (const file of files) {
      printQueue[shopId].push({
        orderId,
        fileId: file.id,
        fileName: file.original_name,
        fileUrl: `${baseUrl}/orders/files/${file.id}/print-pdf?token=${token}`,
      });
    }

    // Also update order status to printing
    await db.execute("UPDATE orders SET status = 'printing' WHERE id = ?", [orderId]);

    res.json({ message: 'Print job sent to local agent!' });
  } catch (err) {
    console.error('Trigger print error:', err);
    res.status(500).json({ error: 'Failed to trigger print' });
  }
};

// GET /api/shops/:id/poll-print — Local agent polls this
exports.pollPrintJobs = async (req, res) => {
  try {
    const shopId = req.params.id;
    
    // In a real app, you'd use a dedicated agent token. For simplicity, 
    // we use the shop owner's JWT token to authenticate the agent.
    const [shops] = await db.execute('SELECT * FROM shops WHERE id = ? AND user_id = ?', [shopId, req.user.id]);
    if (!shops.length) {
      return res.status(403).json({ error: 'Unauthorized agent' });
    }

    const jobs = printQueue[shopId] || [];
    printQueue[shopId] = []; // Clear queue after fetching

    res.json({ jobs });
  } catch (err) {
    console.error('Poll print error:', err);
    res.status(500).json({ error: 'Failed to poll print jobs' });
  }
};

