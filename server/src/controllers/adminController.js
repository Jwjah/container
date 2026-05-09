const db = require('../config/database');

// GET /api/admin/stats — Dashboard analytics
exports.getStats = async (req, res) => {
  try {
    const [[{ totalUsers }]] = await db.execute("SELECT COUNT(*) as totalUsers FROM users");
    const [[{ totalStudents }]] = await db.execute("SELECT COUNT(*) as totalStudents FROM users WHERE role = 'student'");
    const [[{ totalShops }]] = await db.execute("SELECT COUNT(*) as totalShops FROM shops WHERE is_approved = 1");
    const [[{ pendingShops }]] = await db.execute("SELECT COUNT(*) as pendingShops FROM shops WHERE is_approved = 0");
    const [[{ totalAgents }]] = await db.execute("SELECT COUNT(*) as totalAgents FROM users WHERE role = 'agent'");
    const [[{ totalOrders }]] = await db.execute("SELECT COUNT(*) as totalOrders FROM orders");
    const [[{ activeOrders }]] = await db.execute("SELECT COUNT(*) as activeOrders FROM orders WHERE status NOT IN ('delivered','cancelled')");
    const [[{ totalRevenue }]] = await db.execute("SELECT COALESCE(SUM(total_price), 0) as totalRevenue FROM orders WHERE status = 'delivered'");

    // Orders by status
    const [ordersByStatus] = await db.execute(
      'SELECT status, COUNT(*) as count FROM orders GROUP BY status'
    );

    // Revenue by day (last 30 days)
    const [revenueByDay] = await db.execute(
      `SELECT DATE(created_at) as date, SUM(total_price) as revenue, COUNT(*) as orders 
       FROM orders WHERE status = 'delivered' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at) ORDER BY date`
    );

    // Top shops
    const [topShops] = await db.execute(
      `SELECT s.shop_name, s.total_orders, s.wallet_balance, s.rating
       FROM shops s WHERE s.is_approved = 1 ORDER BY s.total_orders DESC LIMIT 5`
    );

    res.json({
      stats: { totalUsers, totalStudents, totalShops, pendingShops, totalAgents, totalOrders, activeOrders, totalRevenue: parseFloat(totalRevenue) },
      ordersByStatus,
      revenueByDay,
      topShops,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};

// GET /api/admin/users — List all users
exports.getUsers = async (req, res) => {
  try {
    const { role, search, status, page = 1 } = req.query;
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = 'SELECT id, name, email, role, phone, is_verified, is_suspended, created_at FROM users WHERE 1=1';
    const params = [];

    if (role) { query += ' AND role = ?'; params.push(role); }
    if (status === 'suspended') { query += ' AND is_suspended = 1'; }
    if (status === 'active') { query += ' AND is_suspended = 0'; }
    if (search) { query += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [users] = await db.execute(query, params);
    const [[{ total }]] = await db.execute('SELECT COUNT(*) as total FROM users');

    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// PATCH /api/admin/users/:id/suspend — Suspend/restore user
exports.toggleSuspend = async (req, res) => {
  try {
    const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!users.length) return res.status(404).json({ error: 'User not found' });

    const newStatus = users[0].is_suspended ? 0 : 1;
    await db.execute('UPDATE users SET is_suspended = ? WHERE id = ?', [newStatus, req.params.id]);

    res.json({ message: `User ${newStatus ? 'suspended' : 'restored'}`, is_suspended: !!newStatus });
  } catch (err) {
    console.error('Toggle suspend error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// PATCH /api/admin/shops/:id/toggle-approval — Restrict/Approve shop
exports.toggleShopApproval = async (req, res) => {
  try {
    const [shops] = await db.execute('SELECT * FROM shops WHERE id = ?', [req.params.id]);
    if (!shops.length) return res.status(404).json({ error: 'Shop not found' });

    const newStatus = shops[0].is_approved ? 0 : 1;
    await db.execute('UPDATE shops SET is_approved = ? WHERE id = ?', [newStatus, req.params.id]);

    res.json({ message: `Shop ${newStatus ? 'approved' : 'restricted'}`, is_approved: !!newStatus });
  } catch (err) {
    console.error('Toggle shop approval error:', err);
    res.status(500).json({ error: 'Failed to update shop' });
  }
};

// GET /api/admin/shops/pending — Pending shop approvals
exports.getPendingShops = async (req, res) => {
  try {
    const [shops] = await db.execute(
      'SELECT s.*, u.name as owner_name, u.email as owner_email FROM shops s JOIN users u ON s.user_id = u.id WHERE s.is_approved = 0 ORDER BY s.created_at DESC'
    );
    res.json({ shops });
  } catch (err) {
    console.error('Pending shops error:', err);
    res.status(500).json({ error: 'Failed to fetch pending shops' });
  }
};

// PATCH /api/admin/shops/:id/approve — Approve/reject shop
exports.approveShop = async (req, res) => {
  try {
    const { approved } = req.body;
    if (approved) {
      await db.execute('UPDATE shops SET is_approved = 1 WHERE id = ?', [req.params.id]);
      const [shops] = await db.execute('SELECT user_id, shop_name FROM shops WHERE id = ?', [req.params.id]);
      if (shops.length) {
        await db.execute(
          'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
          [shops[0].user_id, '🎉 Shop Approved!', `"${shops[0].shop_name}" has been approved. You can start accepting orders!`, 'system']
        );
      }
    } else {
      await db.execute('DELETE FROM shops WHERE id = ?', [req.params.id]);
    }
    res.json({ message: approved ? 'Shop approved' : 'Shop rejected' });
  } catch (err) {
    console.error('Approve shop error:', err);
    res.status(500).json({ error: 'Failed to process shop' });
  }
};

// GET /api/admin/export/orders — CSV export
exports.exportOrders = async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    let query = `SELECT o.id, o.order_hash, u.name as student, s.shop_name as shop, o.status, o.print_type, o.copies, o.total_pages, o.total_price, o.delivery_type, o.created_at
       FROM orders o JOIN users u ON o.student_id = u.id JOIN shops s ON o.shop_id = s.id WHERE 1=1`;
    const params = [];

    if (status) { query += ' AND o.status = ?'; params.push(status); }
    if (startDate) { query += ' AND o.created_at >= ?'; params.push(startDate); }
    if (endDate) { query += ' AND o.created_at <= ?'; params.push(endDate); }

    query += ' ORDER BY o.created_at DESC';

    const [orders] = await db.execute(query, params);

    const headers = 'ID,Hash,Student,Shop,Status,Print Type,Copies,Pages,Price,Delivery,Created\n';
    const csv = orders.map(o =>
      `${o.id},${o.order_hash},${o.student},${o.shop_name},${o.status},${o.print_type},${o.copies},${o.total_pages},${o.total_price},${o.delivery_type},${o.created_at}`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=orders_export.csv');
    res.send(headers + csv);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
};

// GET /api/admin/orders — View all global orders
exports.getOrders = async (req, res) => {
  try {
    const { status, startDate, endDate, search } = req.query;
    let query = `SELECT o.*, u.name as student_name, s.shop_name,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', f.id, 'name', f.original_name, 'pages', f.page_count, 'size', f.file_size)) 
         FROM order_files f WHERE f.order_id = o.id) as files
       FROM orders o 
       JOIN users u ON o.student_id = u.id 
       JOIN shops s ON o.shop_id = s.id 
       WHERE 1=1`;
    
    const params = [];

    if (status) { query += ' AND o.status = ?'; params.push(status); }
    if (startDate) { query += ' AND o.created_at >= ?'; params.push(startDate); }
    if (endDate) { query += ' AND o.created_at <= ?'; params.push(endDate); }
    if (search) { query += ' AND (o.order_hash LIKE ? OR u.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    query += ' ORDER BY o.created_at DESC LIMIT 100';

    const [orders] = await db.execute(query, params);
    res.json({ orders });
  } catch (err) {
    console.error('Get admin orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

// PATCH /api/admin/orders/:id/cancel — Force cancel order (Admin)
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const [orders] = await db.execute('SELECT * FROM orders WHERE id = ?', [id]);
    if (!orders.length) return res.status(404).json({ error: 'Order not found' });

    await db.execute("UPDATE orders SET status = 'cancelled' WHERE id = ?", [id]);
    
    // Notify student and shop
    const order = orders[0];
    const [shops] = await db.execute('SELECT user_id FROM shops WHERE id = ?', [order.shop_id]);
    
    await db.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [order.student_id, 'Order Cancelled', `Your order #${order.order_hash.substring(0, 8).toUpperCase()} has been cancelled by Admin.`, 'order']
    );
    if (shops.length) {
      await db.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
        [shops[0].user_id, 'Order Cancelled', `Order #${order.order_hash.substring(0, 8).toUpperCase()} has been cancelled by Admin.`, 'order']
      );
    }

    res.json({ message: 'Order cancelled successfully' });
  } catch (err) {
    console.error('Admin cancel order error:', err);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
};

// DELETE /api/admin/danger — Wipe operations (Danger Zone)
exports.wipeOperations = async (req, res) => {
  try {
    const { target } = req.body;
    if (target === 'orders') {
      await db.execute('DELETE FROM deliveries');
      await db.execute('DELETE FROM order_files');
      await db.execute('DELETE FROM orders');
      res.json({ message: 'All orders wiped' });
    } else if (target === 'all') {
      await db.execute('DELETE FROM notifications');
      await db.execute('DELETE FROM deliveries');
      await db.execute('DELETE FROM order_files');
      await db.execute('DELETE FROM orders');
      await db.execute('DELETE FROM shops');
      await db.execute('DELETE FROM transactions');
      await db.execute('DELETE FROM otp_codes');
      await db.execute("DELETE FROM users WHERE role != 'admin'");
      res.json({ message: 'Factory reset complete' });
    } else {
      res.status(400).json({ error: 'Invalid wipe target' });
    }
  } catch (err) {
    console.error('Wipe error:', err);
    res.status(500).json({ error: 'Wipe failed' });
  }
};

// GET /api/notifications — User notifications
exports.getNotifications = async (req, res) => {
  try {
    const [notifications] = await db.execute(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    const [[{ unread }]] = await db.execute(
      'SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ notifications, unread });
  } catch (err) {
    console.error('Notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

// PATCH /api/notifications/read — Mark all as read
exports.markRead = async (req, res) => {
  try {
    await db.execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'All marked as read' });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark read' });
  }
};
