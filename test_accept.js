const db = require('./server/src/config/database');

async function testAccept() {
  try {
    // 1. Get an agent
    const [agents] = await db.execute("SELECT id FROM users WHERE role = 'agent' LIMIT 1");
    if (!agents.length) return console.log("No agent found");
    const agentId = agents[0].id;
    console.log("Agent ID:", agentId);

    // 2. Get a ready hostel order
    const [orders] = await db.execute("SELECT id, delivery_fee, student_id FROM orders WHERE status = 'ready' AND delivery_type = 'hostel' AND agent_id IS NULL LIMIT 1");
    if (!orders.length) return console.log("No available orders found");
    const order = orders[0];
    const orderId = order.id;
    console.log("Order ID:", orderId);

    // 3. Simulate acceptDelivery
    console.log("Updating order agent_id...");
    await db.execute('UPDATE orders SET agent_id = ? WHERE id = ?', [agentId, orderId]);
    
    console.log("Inserting into deliveries...");
    const earnings = parseFloat(order.delivery_fee) * 0.8;
    await db.execute(
      'INSERT INTO deliveries (order_id, agent_id, earnings) VALUES (?, ?, ?)',
      [orderId, agentId, earnings]
    );

    console.log("Inserting into notifications...");
    await db.execute(
      'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [order.student_id, '🚀 Delivery Agent Assigned', 'A delivery agent has accepted your order and will collect it from the shop shortly.', 'delivery']
    );

    console.log("SUCCESS!");
    
    // Rollback for testing
    await db.execute('UPDATE orders SET agent_id = NULL WHERE id = ?', [orderId]);
    await db.execute('DELETE FROM deliveries WHERE order_id = ?', [orderId]);
    await db.execute('DELETE FROM notifications WHERE user_id = ?', [order.student_id]);
    
  } catch (err) {
    console.error("ERROR:", err);
  }
}

testAccept();
