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

    const bindingType = req.body.binding_type || 'none';
    const allowedBindingTypes = ['none', 'staple', 'spiral', 'stick'];
    if (!allowedBindingTypes.includes(bindingType.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid binding option' });
    }

    // Calculate price
    const pricing = calculatePrice({
      pages: totalPages,
      copies: parseInt(copies) || 1,
      printType: print_type || 'bw',
      layout: layout || 'single',
      binding: binding === 'true' || binding === true,
      binding_type: bindingType,
      notes: notes || '',
      shop,
    });

    const deliveryFee = delivery_type === 'hostel' ? 15.00 : 0.00;
    const totalPrice = pricing.total + deliveryFee;

    // Generate unique hash
    const orderHash = generateOrderHash(Date.now(), req.user.id);

    // Create order
    const [result] = await db.execute(
      `INSERT INTO orders (order_hash, student_id, shop_id, print_type, layout, copies, binding, delivery_type, hostel_address, total_pages, total_price, delivery_fee, notes, payment_status, status, finishing_type, finishing_price, price_bw_used, price_color_used, price_binding_used, price_stick_file_used) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderHash, req.user.id, shop_id,
        print_type || 'bw', layout || 'single', parseInt(copies) || 1,
        binding === 'true' || binding === true ? 1 : 0,
        delivery_type || 'pickup', hostel_address || null,
        totalPages, totalPrice, deliveryFee, notes || null,
        'UNPAID', 'pending',
        bindingType, pricing.bindingCost,
        pricing.price_bw_used, pricing.price_color_used,
        pricing.price_binding_used, pricing.price_stick_file_used
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

    let deliveryQR = null;
    if (delivery_type === 'hostel') {
      deliveryQR = await generateQRCode({
        type: 'delivery',
        orderId,
        hash: orderHash,
        action: 'verify_delivery',
      });
    }
    await db.execute('UPDATE orders SET pickup_qr = ?, delivery_qr = ? WHERE id = ?', [pickupQR, deliveryQR, orderId]);

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
    const { status, startDate, endDate, search } = req.query;
    let query, params = [];

    let whereClause = '';
    if (status) { whereClause += ' AND o.status = ?'; params.push(status); }
    if (startDate) { whereClause += ' AND o.created_at >= ?'; params.push(startDate); }
    if (endDate) { whereClause += ' AND o.created_at <= ?'; params.push(endDate); }

    if (role === 'student') {
      if (search) {
        whereClause += ' AND (o.order_hash LIKE ? OR o.order_id LIKE ? OR s.shop_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      query = `SELECT o.*, s.shop_name, 
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', f.id, 'name', f.original_name, 'pages', f.page_count, 'size', f.file_size)) 
                 FROM order_files f WHERE f.order_id = o.id) as files
               FROM orders o JOIN shops s ON o.shop_id = s.id WHERE o.student_id = ? ${whereClause} ORDER BY o.created_at DESC`;
      params.unshift(id);
    } else if (role === 'shop') {
      const [shops] = await db.execute('SELECT id FROM shops WHERE user_id = ?', [id]);
      if (!shops.length) return res.json({ orders: [] });
      if (search) {
        whereClause += ' AND (o.order_hash LIKE ? OR o.order_id LIKE ? OR u.name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      query = `SELECT o.*, u.name as student_name, u.hostel, u.room_number,
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', f.id, 'name', f.original_name, 'pages', f.page_count, 'path', f.file_path)) 
                 FROM order_files f WHERE f.order_id = o.id) as files
               FROM orders o JOIN users u ON o.student_id = u.id 
               WHERE o.shop_id = ? AND o.payment_status = 'PAID' AND o.status != 'cancelled' ${whereClause} 
               ORDER BY o.created_at DESC`;
      params.unshift(shops[0].id);
    } else if (role === 'agent') {
      if (search) {
        whereClause += ' AND (o.order_hash LIKE ? OR o.order_id LIKE ? OR u.name LIKE ? OR s.shop_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      query = `SELECT o.*, s.shop_name, s.location as shop_location, u.name as student_name, u.hostel, u.room_number
               FROM orders o JOIN shops s ON o.shop_id = s.id JOIN users u ON o.student_id = u.id
               WHERE o.agent_id = ? ${whereClause} ORDER BY o.created_at DESC`;
      params.unshift(id);
    } else if (role === 'admin') {
      if (search) {
        whereClause += ' AND (o.order_hash LIKE ? OR o.order_id LIKE ? OR u.name LIKE ? OR s.shop_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      query = `SELECT o.*, s.shop_name, u.name as student_name,
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', f.id, 'name', f.original_name, 'pages', f.page_count, 'size', f.file_size)) 
                 FROM order_files f WHERE f.order_id = o.id) as files
               FROM orders o JOIN shops s ON o.shop_id = s.id JOIN users u ON o.student_id = u.id 
               WHERE 1=1 ${whereClause} ORDER BY o.created_at DESC LIMIT 100`;
    } else {
      if (search) {
        whereClause += ' AND (o.order_hash LIKE ? OR o.order_id LIKE ? OR u.name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
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

    const order = orders[0];

    // Shop security check:
    if (req.user.role === 'shop') {
      const [shops] = await db.execute('SELECT id FROM shops WHERE user_id = ?', [req.user.id]);
      if (!shops.length || shops[0].id !== order.shop_id) {
        return res.status(403).json({ error: 'Unauthorized to access this order' });
      }
      // Check if order is eligible for production (not unpaid/pending)
      if (order.payment_status !== 'PAID' && order.status !== 'confirmed') {
        return res.status(404).json({ error: 'Order not found' }); // Hide existence
      }
    }

    res.json({ order });
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
    updates.updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (status === 'ready') {
      if (!order.ready_at) {
        updates.ready_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
      }
    }

    if (status === 'delivered') {
      if (order.status === 'delivered') {
        return res.json({ message: 'Order is already delivered', status });
      }
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

    if (status === 'ready' && order.delivery_type === 'hostel') {
      // Notify all agents about the new delivery gig
      const [agents] = await db.execute("SELECT id FROM users WHERE role = 'agent'");
      for (const agent of agents) {
        await db.execute(
          'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
          [agent.id, '🆕 New Delivery Gig Available', `Order #${order.order_hash.substring(0, 8).toUpperCase()} is ready for delivery.`, 'delivery']
        );
        await sendPushToUser(agent.id, {
          title: '🆕 New Delivery Gig Available',
          message: `Order #${order.order_hash.substring(0, 8).toUpperCase()} is ready for delivery.`,
          url: '/agent/radar',
          tag: `gig-${req.params.id}`,
        });
      }
    }

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
      await sendPushToUser(orders[0].agent_id, {
        title: '✅ Delivery Confirmed!',
        message: `Student confirmed delivery #${orders[0].order_hash.substring(0, 8).toUpperCase()}. ₹${earning.toFixed(0)} credited.`,
        url: '/agent/earnings',
        tag: `delivery-${id}`,
      });
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
    const isRemote = file.file_path.startsWith('http://') || file.file_path.startsWith('https://');
    const downloadUrl = isRemote ? file.file_path : `${baseUrl}${file.file_path}`;
    res.json({ url: downloadUrl });
  } catch (err) {
    console.error('Download file error:', err);
    res.status(500).json({ error: 'Failed to download file' });
  }
};

// PATCH /api/orders/:id/change-fulfillment — Change delivery method (student)
exports.changeFulfillment = async (req, res) => {
  try {
    const { id } = req.params;
    const { delivery_type, hostel_address } = req.body;
    
    if (!['pickup', 'hostel'].includes(delivery_type)) {
      return res.status(400).json({ error: 'Invalid delivery type' });
    }

    let order;

    const result = await db.transaction(async (conn) => {
      // 1. Fetch order details inside transaction
      const [orders] = await conn.execute('SELECT * FROM orders WHERE id = ?', [id]);
      if (!orders.length) {
        throw new Error('Order not found');
      }
      order = orders[0];

      // Authorization check: Only the customer who placed the order can change it
      if (order.student_id !== req.user.id) {
        throw new Error('You are not authorized to change this order');
      }

      // Status validation: Disable once marked as Out for Delivery, Delivered/Picked Up, or Cancelled
      const allowedStatuses = ['pending', 'confirmed', 'printing', 'ready'];
      if (!allowedStatuses.includes(order.status)) {
        throw new Error(`Cannot change delivery method. Order is already ${order.status.replace(/_/g, ' ')}.`);
      }

      if (order.delivery_type === delivery_type) {
        throw new Error(`Order is already set to ${delivery_type === 'hostel' ? 'Delivery' : 'Pickup'}`);
      }

      let updatedFee = 0.00;
      let updatedPrice = order.total_price;
      let deliveryQR = order.delivery_qr;

      if (delivery_type === 'hostel') {
        if (!hostel_address || hostel_address.trim() === '') {
          throw new Error('Delivery address is required for hostel delivery');
        }
        updatedFee = 15.00;
        updatedPrice = parseFloat((parseFloat(order.total_price) + 15.00).toFixed(2));
        
        // Generate delivery QR if not already present
        if (!deliveryQR) {
          deliveryQR = await generateQRCode({
            type: 'delivery',
            orderId: order.id,
            hash: order.order_hash,
            action: 'verify_delivery',
          });
        }

        await conn.execute(
          'UPDATE orders SET delivery_type = ?, hostel_address = ?, delivery_fee = ?, total_price = ?, delivery_qr = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [delivery_type, hostel_address, updatedFee, updatedPrice, deliveryQR, id]
        );
      } else {
        // Switching to Pickup
        const originalFee = parseFloat(order.delivery_fee || 0);
        updatedFee = 0.00;
        updatedPrice = parseFloat((parseFloat(order.total_price) - originalFee).toFixed(2));
        deliveryQR = null;

        // Reset agent_id and cancel/delete active deliveries
        await conn.execute(
          'UPDATE orders SET delivery_type = ?, hostel_address = NULL, delivery_fee = ?, total_price = ?, delivery_qr = NULL, agent_id = NULL, delivery_timeout_notified = 0, ready_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [delivery_type, updatedFee, updatedPrice, id]
        );

        // Remove from deliveries table
        await conn.execute('DELETE FROM deliveries WHERE order_id = ?', [id]);

        // Idempotent Refund Check
        // If order has been paid (status is not pending) and there was a delivery fee
        if (order.status !== 'pending' && originalFee > 0) {
          // Lock user row and fetch latest balance
          const [users] = await conn.execute('SELECT wallet_balance FROM users WHERE id = ?', [order.student_id]);
          if (users.length) {
            const currentBalance = parseFloat(users[0].wallet_balance || 0);
            const newBalance = parseFloat((currentBalance + originalFee).toFixed(2));

            // Update user wallet balance
            await conn.execute('UPDATE users SET wallet_balance = ? WHERE id = ?', [newBalance, order.student_id]);

            // Insert transaction ledger record
            const shortHash = order.order_hash.substring(0, 8).toUpperCase();
            await conn.execute(
              `INSERT INTO transactions (user_id, type, amount, description, reference_id, balance_after) 
               VALUES (?, 'credit', ?, ?, ?, ?)`,
              [
                order.student_id,
                'credit',
                originalFee,
                `Refund: Delivery fee for order #${shortHash}`,
                order.order_hash,
                newBalance
              ]
            );
            console.log(`💰 [Refund] Refunded ₹${originalFee} delivery fee to student ${order.student_id} for order #${shortHash}`);
          }
        }

        // Publish outbox event for PickupConversion
        const crypto = require('crypto');
        const occurredAtStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const payload = {
          orderId: order.id,
          orderHash: order.order_hash,
          studentId: order.student_id,
          shopId: order.shop_id,
          previousFulfillment: 'hostel',
          newFulfillment: 'pickup'
        };
        await conn.execute(
          `INSERT INTO outbox_events (
            event_id, event_type, aggregate_type, aggregate_id, payload, 
            status, retry_count, error_log, correlation_id, event_version, occurred_at
          ) VALUES (?, 'PICKUP_CONVERSION', 'ORDER', ?, ?, 'PENDING', 0, NULL, ?, 1, ?)`,
          [
            crypto.randomUUID(),
            String(order.id),
            JSON.stringify(payload),
            crypto.randomUUID(),
            occurredAtStr
          ]
        );
      }

      return { updatedPrice, updatedFee };
    });

    // Create notifications
    // Notify customer
    const typeLabel = delivery_type === 'hostel' ? 'Hostel Delivery' : 'Self Pickup';
    await db.execute(
      'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [order.student_id, 'Delivery Method Changed', `Fulfillment method changed to ${typeLabel}. Updated Total: ₹${result.updatedPrice.toFixed(0)}`, 'order']
    );
    await sendPushToUser(order.student_id, {
      title: 'Delivery Method Changed',
      message: `Fulfillment method changed to ${typeLabel}. Updated Total: ₹${result.updatedPrice.toFixed(0)}`,
      url: '/student/orders',
      tag: `order-${id}`,
    });

    // Notify shop
    const [shops] = await db.execute('SELECT user_id FROM shops WHERE id = ?', [order.shop_id]);
    const shortHash = order.order_hash.substring(0, 8).toUpperCase();
    if (shops.length) {
      const shopUserId = shops[0].user_id;
      await db.execute(
        'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
        [shopUserId, '🔄 Order Update', `Order #${shortHash} changed to ${typeLabel}`, 'order']
      );
      await sendPushToUser(shopUserId, {
        title: '🔄 Order Update',
        message: `Order #${shortHash} changed to ${typeLabel}`,
        url: '/shop/queue',
        tag: `order-${id}`,
      });
    }

    // Notify admins
    const [admins] = await db.execute("SELECT id FROM users WHERE role = 'admin'");
    for (const admin of admins) {
      await db.execute(
        'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
        [admin.id, '🔄 Order Update', `Order #${shortHash} changed to ${typeLabel}`, 'order']
      );
    }

    res.json({ 
      message: 'Delivery method updated successfully', 
      delivery_type, 
      total_price: result.updatedPrice, 
      delivery_fee: result.updatedFee 
    });
  } catch (err) {
    console.error('Change fulfillment error:', err);
    res.status(400).json({ error: err.message || 'Failed to update delivery method' });
  }
};

// GET /api/orders/files/:fileId/print-pdf — Local print agent downloads modified PDF
exports.downloadPrintPdf = async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Fetch file details along with order details
    const [files] = await db.execute(
      `SELECT f.*, o.order_hash, o.order_id, o.shop_id, o.pickup_qr, o.delivery_qr, o.print_type, o.notes, o.payment_status, o.status 
       FROM order_files f 
       JOIN orders o ON f.order_id = o.id 
       WHERE f.id = ?`,
      [fileId]
    );

    if (!files.length) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[0];
    
    // Shop security check for downloading PDF:
    if (req.user.role === 'shop') {
      const [shops] = await db.execute('SELECT id FROM shops WHERE user_id = ?', [req.user.id]);
      if (!shops.length || shops[0].id !== file.shop_id) {
        return res.status(403).json({ error: 'Unauthorized to download this file' });
      }
      if (file.payment_status !== 'PAID' || (file.status && file.status.toUpperCase() === 'CANCELLED')) {
        return res.status(403).json({ error: 'Order is not paid or confirmed' });
      }
    }

    // Download original PDF from Cloudinary or read from local storage
    const fs = require('fs');
    const path = require('path');
    let pdfBuffer;
    const isRemote = file.file_path.startsWith('http://') || file.file_path.startsWith('https://');
    if (isRemote) {
      const axios = require('axios');
      try {
        const response = await axios.get(file.file_path, { responseType: 'arraybuffer' });
        pdfBuffer = Buffer.from(response.data);
      } catch (fetchErr) {
        console.error('Failed to download file from Cloudinary:', fetchErr.message);
        return res.status(500).json({ error: 'Failed to fetch original file from cloud storage' });
      }
    } else {
      try {
        let localPath = file.file_path;
        if (!path.isAbsolute(localPath)) {
          const isVercel = !!process.env.VERCEL;
          if (isVercel) {
            localPath = path.join('/tmp', localPath);
          } else {
            localPath = path.join(__dirname, '../..', localPath);
          }
        }
        pdfBuffer = fs.readFileSync(localPath);
      } catch (fetchErr) {
        console.error('Failed to read local file:', fetchErr.message);
        return res.status(500).json({ error: 'Failed to fetch original file from local storage' });
      }
    }
    
    // If not a PDF, send directly
    if (file.mime_type !== 'application/pdf') {
      res.contentType(file.mime_type);
      return res.send(pdfBuffer);
    }
    
    // Parse pages per sheet from notes format: e.g. "[Format: A4, portrait, 2 pg/sheet, Binding: none]"
    let pagesPerSheet = 1;
    if (file.notes && file.notes.includes('pg/sheet')) {
      const match = file.notes.match(/(\d+)\s*pg\/sheet/);
      if (match) {
        pagesPerSheet = parseInt(match[1], 10);
      }
    }
    
    // Modify PDF using helper
    const { modifyPdf } = require('../utils/pdfProcessor');
    let modifiedBuffer;
    try {
      modifiedBuffer = await modifyPdf(
        pdfBuffer,
        file.order_hash,
        file.id,
        file.pickup_qr,
        file.delivery_qr,
        file.print_type,
        pagesPerSheet,
        file.order_id
      );
    } catch (processErr) {
      console.error('PDF modifications failed, sending original:', processErr.message);
      modifiedBuffer = pdfBuffer; // fallback to original on failure
    }
    
    res.contentType('application/pdf');
    res.send(modifiedBuffer);
  } catch (err) {
    console.error('Download print PDF error:', err);
    res.status(500).json({ error: 'Failed to prepare PDF for printing' });
  }
};

// POST /api/orders/:id/reorder — Clone a previous order for reordering
exports.reorderOrder = async (req, res) => {
  const axios = require('axios');
  const { generateOrderHash, generateQRCode } = require('../utils/helpers');

  try {
    const orderId = req.params.id;

    // 1. Fetch original order
    const [orders] = await db.execute('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!orders.length) {
      return res.status(404).json({ error: 'Original order not found' });
    }
    const oldOrder = orders[0];

    // 2. Security Check: verify logged-in student matches
    if (Number(oldOrder.student_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'You are not authorized to reorder this print job' });
    }

    // 3. Shop availability checks
    const [shops] = await db.execute('SELECT * FROM shops WHERE id = ? AND is_approved = 1', [oldOrder.shop_id]);
    if (!shops.length) {
      return res.status(404).json({ error: 'Shop is no longer available' });
    }
    const shop = shops[0];
    if (!shop.is_open) {
      return res.status(400).json({ error: 'This shop is currently closed. Please choose another shop or check back later.' });
    }

    // 4. Fetch previous order files
    const [files] = await db.execute('SELECT * FROM order_files WHERE order_id = ?', [oldOrder.id]);
    if (!files.length) {
      return res.status(400).json({ error: 'Original order files not found' });
    }

    // 5. Cloudinary existence validation check
    for (const file of files) {
      try {
        const headRes = await axios.head(file.file_path, { timeout: 5000 });
        if (headRes.status !== 200) {
          return res.status(400).json({
            error: `File "${file.original_name}" is no longer available on the cloud storage. Please place a new order and upload your files again.`
          });
        }
      } catch (err) {
        if (err.response && (err.response.status === 404 || err.response.status === 410)) {
          return res.status(400).json({
            error: `File "${file.original_name}" is no longer available on the cloud storage. Please place a new order and upload your files again.`
          });
        }
        // Transient error (5xx, timeout, network failure, etc.)
        console.warn(`[Reorder] Transient error checking file ${file.file_path}:`, err.message);
        return res.status(503).json({
          error: `Temporary storage connection issue while checking "${file.original_name}". Please try again in a few moments.`
        });
      }
    }

    // 6. Calculate pricing dynamically
    let bindingType = 'none';
    if (oldOrder.binding) {
      const notes = oldOrder.notes || '';
      const match = notes.match(/Binding:\s*(\w+)/i);
      if (match) {
        bindingType = match[1].toLowerCase();
      } else {
        bindingType = 'spiral'; // fallback
      }
    }

    const pricing = calculatePrice({
      pages: oldOrder.total_pages,
      copies: oldOrder.copies,
      printType: oldOrder.print_type,
      layout: oldOrder.layout,
      binding: oldOrder.binding === 1 || oldOrder.binding === true,
      binding_type: bindingType,
      notes: oldOrder.notes || '',
      shop
    });

    const deliveryFee = oldOrder.delivery_type === 'hostel' ? 15.00 : 0.00;
    const totalPrice = pricing.total + deliveryFee;

    // 7. Insert new order in a transaction block
    const newOrderId = await db.transaction(async (conn) => {
      const newOrderHash = generateOrderHash(Date.now(), req.user.id);
      
      const [result] = await conn.execute(
        `INSERT INTO orders (order_hash, student_id, shop_id, print_type, layout, copies, binding, delivery_type, hostel_address, total_pages, total_price, delivery_fee, notes, payment_status, status, finishing_type, finishing_price, price_bw_used, price_color_used, price_binding_used, price_stick_file_used) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newOrderHash, req.user.id, oldOrder.shop_id,
          oldOrder.print_type, oldOrder.layout, oldOrder.copies,
          oldOrder.binding, oldOrder.delivery_type, oldOrder.hostel_address,
          oldOrder.total_pages, totalPrice, deliveryFee, oldOrder.notes,
          'UNPAID', 'pending',
          bindingType, pricing.bindingCost,
          pricing.price_bw_used, pricing.price_color_used,
          pricing.price_binding_used, pricing.price_stick_file_used
        ]
      );
      
      const insertId = result.insertId;

      // Duplicate file records
      for (const file of files) {
        await conn.execute(
          `INSERT INTO order_files (order_id, original_name, stored_name, file_path, file_size, mime_type, page_count)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            insertId, file.original_name, file.stored_name,
            file.file_path, file.file_size, file.mime_type, file.page_count
          ]
        );
      }

      // Generate unique new QRs
      const pickupQR = await generateQRCode({
        type: 'pickup',
        orderId: insertId,
        hash: newOrderHash,
        action: 'verify_pickup',
      });

      let deliveryQR = null;
      if (oldOrder.delivery_type === 'hostel') {
        deliveryQR = await generateQRCode({
          type: 'delivery',
          orderId: insertId,
          hash: newOrderHash,
          action: 'verify_delivery',
        });
      }

      await conn.execute('UPDATE orders SET pickup_qr = ?, delivery_qr = ? WHERE id = ?', [pickupQR, deliveryQR, insertId]);

      return insertId;
    });

    // 8. Fetch the new order details to return
    const [newOrders] = await db.execute('SELECT * FROM orders WHERE id = ?', [newOrderId]);
    const newOrder = newOrders[0];

    res.status(201).json({
      message: 'Order duplicated successfully',
      order: {
        id: newOrder.id,
        hash: newOrder.order_hash,
        totalPages: newOrder.total_pages,
        pricing,
        deliveryFee,
        totalPrice,
      }
    });

  } catch (err) {
    console.error('Reorder order error:', err);
    res.status(500).json({ error: 'Failed to process reorder request' });
  }
};
