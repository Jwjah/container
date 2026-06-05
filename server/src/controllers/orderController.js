const db = require('../config/database');
const { generateOrderHash, generateQRCode, calculatePrice } = require('../utils/helpers');
const { PDFDocument } = require('pdf-lib');
const { uploadToCloudinary } = require('../middleware/upload');
const { sendPushToUser } = require('../services/pushService');

// POST /api/orders — Create a new order
exports.createOrder = async (req, res) => {
  try {
    const { shop_id, print_type, layout, copies, binding, delivery_type, hostel_address, notes } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'At least one file is required' });
    }

    if (!shop_id) {
      return res.status(400).json({ error: 'Shop selection is required' });
    }

    // Verify shop exists and is open
    const [shops] = await db.execute('SELECT * FROM shops WHERE id = ? AND is_approved = 1', [shop_id]);
    if (!shops.length) {
      return res.status(404).json({ error: 'Shop not found or not approved' });
    }
    const shop = shops[0];
    if (!shop.is_open) {
      return res.status(400).json({ error: 'This shop is currently closed. Please choose another shop.' });
    }

    // Extract page counts from PDFs and upload to Cloudinary
    let totalPages = 0;
    const fileRecords = [];

    for (const file of files) {
      let pageCount = 1;
      if (file.mimetype === 'application/pdf') {
        try {
          const pdfDoc = await PDFDocument.load(file.buffer);
          pageCount = pdfDoc.getPageCount();
        } catch (e) {
          console.warn('PDF page count failed for', file.originalname);
        }
      }
      totalPages += pageCount;

      // Upload to Cloudinary
      const cloudResult = await uploadToCloudinary(file.buffer, file.originalname);

      fileRecords.push({
        original_name: file.originalname,
        stored_name: cloudResult.public_id,
        file_path: cloudResult.url,
        file_size: file.size,
        mime_type: file.mimetype,
        page_count: pageCount,
      });
    }

    // Calculate price
    const pricing = calculatePrice({
      pages: totalPages,
      copies: parseInt(copies) || 1,
      printType: print_type || 'bw',
      layout: layout || 'single',
      binding: binding === 'true' || binding === true,
      shop,
    });

    const deliveryFee = delivery_type === 'hostel' ? 15.00 : 0.00;
    const totalPrice = pricing.total + deliveryFee;

    // Generate unique hash
    const orderHash = generateOrderHash(Date.now(), req.user.id);

    // Create order
    const [result] = await db.execute(
      `INSERT INTO orders (order_hash, student_id, shop_id, print_type, layout, copies, binding, delivery_type, hostel_address, total_pages, total_price, delivery_fee, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderHash, req.user.id, shop_id,
        print_type || 'bw', layout || 'single', parseInt(copies) || 1,
        binding === 'true' || binding === true ? 1 : 0,
        delivery_type || 'pickup', hostel_address || null,
        totalPages, totalPrice, deliveryFee, notes || null,
      ]
    );

    const orderId = result.insertId;

    // Insert file records
    for (const f of fileRecords) {
      await db.execute(
        'INSERT INTO order_files (order_id, original_name, stored_name, file_path, file_size, mime_type, page_count) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [orderId, f.original_name, f.stored_name, f.file_path, f.file_size, f.mime_type, f.page_count]
      );
    }

    // Generate pickup QR
    const pickupQR = await generateQRCode({
      type: 'pickup',
      orderId,
      hash: orderHash,
      action: 'verify_pickup',
    });
    await db.execute('UPDATE orders SET pickup_qr = ? WHERE id = ?', [pickupQR, orderId]);

    // Create notification for shop
    await db.execute(
      'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [shop.user_id, '🆕 New Order', `New print order #${orderHash.substring(0, 8).toUpperCase()} received`, 'order']
    );
    await sendPushToUser(shop.user_id, {
      title: '🆕 New Order',
      message: `New print order #${orderHash.substring(0, 8).toUpperCase()} received`,
      url: '/shop/queue',
      tag: `order-${orderId}`,
    });

    res.status(201).json({
      message: 'Order placed successfully',
      order: {
        id: orderId,
        hash: orderHash,
        totalPages,
        pricing,
        deliveryFee,
        totalPrice,
      },
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
};

// GET /api/orders — List orders for current user
exports.getOrders = async (req, res) => {
  try {
    const { role, id } = req.user;
    const { status, startDate, endDate } = req.query;
    let query, params = [];

    let whereClause = '';
    if (status) { whereClause += ' AND o.status = ?'; params.push(status); }
    if (startDate) { whereClause += ' AND o.created_at >= ?'; params.push(startDate); }
    if (endDate) { whereClause += ' AND o.created_at <= ?'; params.push(endDate); }

    if (role === 'student') {
      query = `SELECT o.*, s.shop_name, 
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', f.id, 'name', f.original_name, 'pages', f.page_count, 'size', f.file_size)) 
                 FROM order_files f WHERE f.order_id = o.id) as files
               FROM orders o JOIN shops s ON o.shop_id = s.id WHERE o.student_id = ? ${whereClause} ORDER BY o.created_at DESC`;
      params.unshift(id);
    } else if (role === 'shop') {
      const [shops] = await db.execute('SELECT id FROM shops WHERE user_id = ?', [id]);
      if (!shops.length) return res.json({ orders: [] });
      query = `SELECT o.*, u.name as student_name, u.hostel, u.room_number,
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', f.id, 'name', f.original_name, 'pages', f.page_count, 'path', f.file_path)) 
                 FROM order_files f WHERE f.order_id = o.id) as files
               FROM orders o JOIN users u ON o.student_id = u.id WHERE o.shop_id = ? ${whereClause} ORDER BY o.created_at DESC`;
      params.unshift(shops[0].id);
    } else if (role === 'agent') {
      query = `SELECT o.*, s.shop_name, s.location as shop_location, u.name as student_name, u.hostel, u.room_number
               FROM orders o JOIN shops s ON o.shop_id = s.id JOIN users u ON o.student_id = u.id
               WHERE o.agent_id = ? ${whereClause} ORDER BY o.created_at DESC`;
      params.unshift(id);
    } else if (role === 'admin') {
      query = `SELECT o.*, s.shop_name, u.name as student_name,
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', f.id, 'name', f.original_name, 'pages', f.page_count, 'size', f.file_size)) 
                 FROM order_files f WHERE f.order_id = o.id) as files
               FROM orders o JOIN shops s ON o.shop_id = s.id JOIN users u ON o.student_id = u.id 
               WHERE 1=1 ${whereClause} ORDER BY o.created_at DESC LIMIT 100`;
    } else {
      query = `SELECT o.*, s.shop_name, u.name as student_name 
               FROM orders o JOIN shops s ON o.shop_id = s.id JOIN users u ON o.student_id = u.id 
               WHERE 1=1 ${whereClause} ORDER BY o.created_at DESC LIMIT 100`;
    }

    const [orders] = await db.execute(query, params);

    // Safely parse JSON strings returned by SQLite adapter
    const parsedOrders = orders.map(o => {
      let parsedFiles = o.files;
      if (typeof o.files === 'string') {
        try { parsedFiles = JSON.parse(o.files); } catch (e) { parsedFiles = []; }
      }
      return { ...o, files: parsedFiles };
    });

    res.json({ orders: parsedOrders });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

// GET /api/orders/:id
exports.getOrder = async (req, res) => {
  try {
    const [orders] = await db.execute(
      `SELECT o.*, s.shop_name, s.location as shop_location, u.name as student_name, u.email as student_email, u.hostel, u.room_number,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', f.id, 'name', f.original_name, 'pages', f.page_count, 'size', f.file_size)) 
         FROM order_files f WHERE f.order_id = o.id) as files
       FROM orders o JOIN shops s ON o.shop_id = s.id JOIN users u ON o.student_id = u.id WHERE o.id = ?`,
      [req.params.id]
    );

    if (!orders.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order: orders[0] });
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
};

// PATCH /api/orders/:id/status — Update order status (shop)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['confirmed', 'printing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const [orders] = await db.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!orders.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orders[0];
    const updates = { status };

    if (status === 'delivered') {
      updates.delivered_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
      // Credit shop wallet
      const [shops] = await db.execute('SELECT * FROM shops WHERE id = ?', [order.shop_id]);
      if (shops.length) {
        const newBalance = parseFloat(shops[0].wallet_balance) + parseFloat(order.total_price) - parseFloat(order.delivery_fee);
        await db.execute('UPDATE shops SET wallet_balance = ?, total_orders = total_orders + 1 WHERE id = ?', [newBalance, order.shop_id]);
        await db.execute(
          'INSERT INTO transactions (user_id, type, amount, description, reference_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)',
          [shops[0].user_id, 'credit', order.total_price - order.delivery_fee, `Order #${order.order_hash.substring(0, 8).toUpperCase()}`, order.order_hash, newBalance]
        );
      }
    }

    if (status === 'ready' && order.delivery_type === 'hostel') {
      // Generate delivery QR
      const deliveryQR = await generateQRCode({
        type: 'delivery',
        orderId: order.id,
        hash: order.order_hash,
        action: 'verify_delivery',
      });
      updates.delivery_qr = deliveryQR;
    }

    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await db.execute(`UPDATE orders SET ${setClause} WHERE id = ?`, [...Object.values(updates), req.params.id]);

    // Notify student
    const statusMessages = {
      confirmed: '✅ Order confirmed by shop',
      printing: '🖨️ Your order is being printed',
      ready: '📦 Your order is ready',
      out_for_delivery: '🚀 Order is out for delivery',
      delivered: '🎉 Order delivered successfully',
      cancelled: '❌ Order has been cancelled',
    };
    await db.execute(
      'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [order.student_id, 'Order Update', statusMessages[status], 'order']
    );
    await sendPushToUser(order.student_id, {
      title: 'Order Update',
      message: statusMessages[status],
      url: '/student/orders',
      tag: `order-${req.params.id}`,
    });

    res.json({ message: 'Status updated', status });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
};

// POST /api/orders/:id/verify-pickup
exports.verifyPickupByStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { hash } = req.body;

    const [orders] = await db.execute(
      "SELECT * FROM orders WHERE id = ? AND student_id = ? AND status = 'ready' AND delivery_type = 'pickup'",
      [id, req.user.id]
    );

    if (!orders.length) {
      return res.status(404).json({ error: 'Order not found, not ready, or not yours' });
    }
    
    if (orders[0].order_hash !== hash) {
      // Check if this hash belongs to a different order
      const [otherOrders] = await db.execute("SELECT id FROM orders WHERE order_hash = ?", [hash]);
      if (otherOrders.length > 0) {
        return res.status(400).json({ error: 'Oops! This QR code belongs to a DIFFERENT order. Please scan the correct one.' });
      }
      return res.status(400).json({ error: 'Invalid QR code. This code is not recognized.' });
    }

    // Call internal logic to mark as delivered
    req.body.status = 'delivered';
    return await exports.updateOrderStatus(req, res);

  } catch (err) {
    console.error('Verify pickup error:', err);
    res.status(500).json({ error: 'Failed to verify pickup' });
  }
};

// POST /api/orders/:id/verify-delivery
exports.verifyDeliveryByStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { hash } = req.body;

    const [orders] = await db.execute(
      "SELECT * FROM orders WHERE id = ? AND student_id = ? AND status = 'out_for_delivery' AND delivery_type = 'hostel'",
      [id, req.user.id]
    );

    if (!orders.length) {
      return res.status(404).json({ error: 'Order not found, not out for delivery, or not yours' });
    }
    
    if (orders[0].order_hash !== hash) {
      // Check if this hash belongs to a different order
      const [otherOrders] = await db.execute("SELECT id FROM orders WHERE order_hash = ?", [hash]);
      if (otherOrders.length > 0) {
        return res.status(400).json({ error: 'Oops! This QR code belongs to a DIFFERENT order. Please scan the correct one.' });
      }
      return res.status(400).json({ error: 'Invalid QR code. This code is not recognized.' });
    }

    // Update agent delivery record
    await db.execute("UPDATE deliveries SET status = 'delivered', dropoff_verified = 1, delivery_time = CURRENT_TIMESTAMP WHERE order_id = ? AND agent_id = ?",
      [id, orders[0].agent_id]
    );

    // Credit agent wallet
    const [deliveries] = await db.execute('SELECT earnings FROM deliveries WHERE order_id = ? AND agent_id = ?', [id, orders[0].agent_id]);
    if (deliveries.length) {
      const earning = parseFloat(deliveries[0].earnings);
      await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [earning, orders[0].agent_id]);
      
      const [[{ wallet_balance }]] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [orders[0].agent_id]);
      
      await db.execute(
        'INSERT INTO transactions (user_id, type, amount, description, reference_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)',
        [orders[0].agent_id, 'credit', earning, `Delivery #${orders[0].order_hash.substring(0, 8).toUpperCase()}`, orders[0].order_hash, wallet_balance]
      );

      // NOTIFY AGENT
      await db.execute(
        'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
        [orders[0].agent_id, '✅ Delivery Confirmed!', `Student confirmed delivery #${orders[0].order_hash.substring(0, 8).toUpperCase()}. ₹${earning.toFixed(0)} credited.`, 'wallet']
      );
    }

    // Mark order as delivered via internal logic
    req.body.status = 'delivered';
    return await exports.updateOrderStatus(req, res);

  } catch (err) {
    console.error('Verify delivery error:', err);
    res.status(500).json({ error: 'Failed to verify delivery' });
  }
};

// GET /api/orders/files/:fileId/download
exports.downloadFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { role, id } = req.user;

    // Fetch file and order details to check permissions
    const [files] = await db.execute(
      `SELECT f.*, o.student_id, o.shop_id 
       FROM order_files f 
       JOIN orders o ON f.order_id = o.id 
       WHERE f.id = ?`,
      [fileId]
    );

    if (!files.length) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[0];
    let hasPermission = false;

    if (role === 'admin') {
      hasPermission = true;
    } else if (role === 'student' && file.student_id === id) {
      hasPermission = true;
    } else if (role === 'shop') {
      const [shops] = await db.execute('SELECT id FROM shops WHERE user_id = ?', [id]);
      if (shops.length && shops[0].id === file.shop_id) {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      return res.status(403).json({ error: 'Unauthorized to access this file' });
    }

    // Return full URL to ensure browser can find the file across domains
    const baseUrl = (process.env.API_URL || '').replace('/api', '');
    res.json({ url: `${baseUrl}${file.file_path}` });
  } catch (err) {
    console.error('Download file error:', err);
    res.status(500).json({ error: 'Failed to download file' });
  }
};
