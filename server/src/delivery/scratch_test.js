const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve(__dirname, '../../data/campus.db');

console.log('Connecting to:', dbPath);
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// Query existing records to confirm
console.log('USERS:', db.prepare('SELECT id, role FROM users').all());
console.log('SHOPS:', db.prepare('SELECT id FROM shops').all());
console.log('ORDERS:', db.prepare('SELECT id FROM orders').all());
console.log('FULFILLMENTS:', db.prepare('SELECT id, order_id FROM fulfillments').all());

try {
  console.log('Attempting manual insert inside transaction...');
  db.transaction(() => {
    db.prepare(`
      INSERT INTO delivery_assignments (
        fulfillment_id, order_id, shop_id, student_id, agent_id, status, correlation_id, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(27, 1001, 400, 200, 702, 'ASSIGNED', 'scratch-cid', 1);
  })();
  console.log('Transaction succeeded!');
} catch (err) {
  console.error('Insert failed:', err.message);
  // Run foreign key check
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  console.log('VIOLATIONS:', violations);
}

db.close();
