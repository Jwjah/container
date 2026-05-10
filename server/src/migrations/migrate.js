const db = require('../config/database');
require('dotenv').config();
const bcrypt = require('bcryptjs');

const migrate = async () => {
  console.log('🔄 Running database migrations...\n');

  // Detect if using SQLite
  const isSQLite = process.env.DB_MODE === 'sqlite' || process.env.DB_HOST === 'mysql9.serv00.com';

  const sqliteQueries = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      phone TEXT DEFAULT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      avatar TEXT DEFAULT NULL,
      hostel TEXT DEFAULT NULL,
      room_number TEXT DEFAULT NULL,
      is_verified INTEGER DEFAULT 0,
      is_suspended INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS otp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'register',
      expires_at TEXT NOT NULL,
      is_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      shop_name TEXT NOT NULL,
      description TEXT,
      location TEXT,
      is_open INTEGER DEFAULT 0,
      is_approved INTEGER DEFAULT 0,
      price_bw REAL DEFAULT 2.00,
      price_color REAL DEFAULT 5.00,
      price_binding REAL DEFAULT 30.00,
      rating REAL DEFAULT 0.00,
      total_orders INTEGER DEFAULT 0,
      wallet_balance REAL DEFAULT 0.00,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_hash TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL,
      shop_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      delivery_type TEXT DEFAULT 'pickup',
      hostel_address TEXT DEFAULT NULL,
      print_type TEXT DEFAULT 'bw',
      layout TEXT DEFAULT 'single',
      copies INTEGER DEFAULT 1,
      binding INTEGER DEFAULT 0,
      total_pages INTEGER DEFAULT 0,
      total_price REAL DEFAULT 0.00,
      delivery_fee REAL DEFAULT 0.00,
      notes TEXT,
      agent_id INTEGER DEFAULT NULL,
      pickup_qr TEXT DEFAULT NULL,
      delivery_qr TEXT DEFAULT NULL,
      picked_up_at TEXT,
      delivered_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS order_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      mime_type TEXT DEFAULT 'application/pdf',
      page_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      status TEXT DEFAULT 'assigned',
      pickup_verified INTEGER DEFAULT 0,
      dropoff_verified INTEGER DEFAULT 0,
      pickup_time TEXT,
      delivery_time TEXT,
      earnings REAL DEFAULT 0.00,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      reference_id TEXT,
      balance_after REAL DEFAULT 0.00,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      type TEXT DEFAULT 'system',
      is_read INTEGER DEFAULT 0,
      metadata TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  const mysqlQueries = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      phone VARCHAR(20) DEFAULT NULL,
      role ENUM('student','shop','agent','admin') NOT NULL DEFAULT 'student',
      avatar VARCHAR(500) DEFAULT NULL,
      hostel VARCHAR(100) DEFAULT NULL,
      room_number VARCHAR(20) DEFAULT NULL,
      is_verified TINYINT(1) DEFAULT 0,
      is_suspended TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS otp_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      code VARCHAR(6) NOT NULL,
      purpose ENUM('register','login','reset') NOT NULL DEFAULT 'register',
      expires_at TIMESTAMP NOT NULL,
      is_used TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email_code (email, code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS shops (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      shop_name VARCHAR(200) NOT NULL,
      description TEXT,
      location VARCHAR(300),
      is_open TINYINT(1) DEFAULT 0,
      is_approved TINYINT(1) DEFAULT 0,
      price_bw DECIMAL(10,2) DEFAULT 2.00,
      price_color DECIMAL(10,2) DEFAULT 5.00,
      price_binding DECIMAL(10,2) DEFAULT 30.00,
      rating DECIMAL(3,2) DEFAULT 0.00,
      total_orders INT DEFAULT 0,
      wallet_balance DECIMAL(12,2) DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_hash VARCHAR(64) NOT NULL UNIQUE,
      student_id INT NOT NULL,
      shop_id INT NOT NULL,
      status ENUM('pending','confirmed','printing','ready','out_for_delivery','delivered','cancelled') DEFAULT 'pending',
      delivery_type ENUM('pickup','hostel') DEFAULT 'pickup',
      hostel_address VARCHAR(300) DEFAULT NULL,
      print_type ENUM('bw','color') DEFAULT 'bw',
      layout ENUM('single','double') DEFAULT 'single',
      copies INT DEFAULT 1,
      binding TINYINT(1) DEFAULT 0,
      total_pages INT DEFAULT 0,
      total_price DECIMAL(12,2) DEFAULT 0.00,
      delivery_fee DECIMAL(10,2) DEFAULT 0.00,
      notes TEXT,
      agent_id INT DEFAULT NULL,
      pickup_qr TEXT DEFAULT NULL,
      delivery_qr TEXT DEFAULT NULL,
      picked_up_at TIMESTAMP NULL,
      delivered_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id),
      FOREIGN KEY (shop_id) REFERENCES shops(id),
      INDEX idx_status (status),
      INDEX idx_student (student_id),
      INDEX idx_shop (shop_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS order_files (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      original_name VARCHAR(500) NOT NULL,
      stored_name VARCHAR(500) NOT NULL,
      file_path VARCHAR(1000) NOT NULL,
      file_size INT DEFAULT 0,
      mime_type VARCHAR(100) DEFAULT 'application/pdf',
      page_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS deliveries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      agent_id INT NOT NULL,
      status ENUM('assigned','picked_up','in_transit','delivered','failed') DEFAULT 'assigned',
      pickup_verified TINYINT(1) DEFAULT 0,
      dropoff_verified TINYINT(1) DEFAULT 0,
      pickup_time TIMESTAMP NULL,
      delivery_time TIMESTAMP NULL,
      earnings DECIMAL(10,2) DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (agent_id) REFERENCES users(id),
      INDEX idx_agent (agent_id),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type ENUM('credit','debit') NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      description VARCHAR(500),
      reference_id VARCHAR(100),
      balance_after DECIMAL(12,2) DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      INDEX idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      message TEXT,
      type ENUM('order','delivery','system','wallet') DEFAULT 'system',
      is_read TINYINT(1) DEFAULT 0,
      metadata JSON DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_read (user_id, is_read)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  ];

  const queries = isSQLite ? sqliteQueries : mysqlQueries;

  for (const q of queries) {
    try {
      await db.execute(q);
      const tableName = q.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
      console.log(`  ✅ Table "${tableName}" ready`);
    } catch (err) {
      console.error('  ❌ Migration error:', err.message);
    }
  }
  
  // Ensure new columns exist for existing databases
  const alterQueries = [
    `ALTER TABLE users ADD COLUMN phone TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN hostel TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN room_number TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN wallet_balance REAL DEFAULT 0.00`
  ];
  for (const q of alterQueries) {
    try { await db.execute(q); } catch (e) {} // Ignore if column already exists
  }

  // Seed super admin
  try {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [process.env.ADMIN_EMAIL]);
    
    if (!existing || existing.length === 0) {
      await db.execute(
        'INSERT INTO users (name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?)',
        ['Super Admin', process.env.ADMIN_EMAIL, hash, 'admin', 1]
      );
      console.log('\n  👑 Super Admin created:', process.env.ADMIN_EMAIL);
    } else {
      // Update existing admin to ensure password and role are correct
      await db.execute(
        'UPDATE users SET password = ?, role = ?, is_verified = 1 WHERE email = ?',
        [hash, 'admin', process.env.ADMIN_EMAIL]
      );
      console.log('\n  👑 Super Admin updated:', process.env.ADMIN_EMAIL);
    }
  } catch (err) {
    console.error('  ❌ Admin seed error:', err.message);
  }

  console.log('\n✅ All migrations complete!\n');
  process.exit(0);
};

migrate();
