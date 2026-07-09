const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { sendOTP } = require('../services/emailService');
const { generateOTP } = require('../utils/helpers');

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, phone, hostel, room_number } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const validRoles = ['student', 'shop', 'agent'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 12);
    
    // Step 1: Insert with core fields that definitely exist
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role || 'student']
    );
    const userId = result.insertId;

    // Step 2: Attempt to update with extra fields (fails gracefully if columns are missing)
    try {
      await db.execute(
        'UPDATE users SET phone = ?, hostel = ?, room_number = ? WHERE id = ?',
        [phone || null, hostel || null, room_number || null, userId]
      );
    } catch (e) {
      console.warn('Optional profile fields skipped: database columns not yet created.');
    }

    // Generate and send OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await db.execute(
      'INSERT INTO otp_codes (email, code, purpose, expires_at) VALUES (?, ?, ?, ?)',
      [email, otp, 'register', expiresAt]
    );
    await sendOTP(email, otp, 'register');

    res.status(201).json({
      message: 'Registration successful. Check your email for OTP.',
      userId: result.insertId,
      requiresOTP: true,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
};

// POST /api/auth/verify-otp
exports.verifyOTP = async (req, res) => {
  try {
    const { email, code } = req.body;

    const [otps] = await db.execute(
      'SELECT * FROM otp_codes WHERE email = ? AND code = ? AND is_used = 0 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email, code]
    );

    if (!otps.length) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    await db.execute('UPDATE otp_codes SET is_used = 1 WHERE id = ?', [otps[0].id]);
    await db.execute('UPDATE users SET is_verified = 1 WHERE email = ?', [email]);

    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    const user = users[0];

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '365d' }
    );

    res.json({
      message: 'Email verified successfully',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    email = email.trim().toLowerCase();
    password = password.trim();

    const adminEmail = (process.env.ADMIN_EMAIL || 'abhir2756@gmail.com').trim().toLowerCase();
    const adminPassword = (process.env.ADMIN_PASSWORD || 'admin').trim();

    let [users] = await db.execute('SELECT * FROM users WHERE TRIM(LOWER(email)) = ?', [email]);

    // Auto-seed the admin user if they don't exist yet in the database
    if (!users.length && email === adminEmail) {
      if (password === adminPassword) {
        const hash = await bcrypt.hash(password, 12);
        const [insertResult] = await db.execute(
          'INSERT INTO users (name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?)',
          ['Super Admin', email, hash, 'admin', 1]
        );
        const [newUsers] = await db.execute('SELECT * FROM users WHERE id = ?', [insertResult.insertId]);
        users = newUsers;
      } else {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    }

    if (!users.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];

    if (user.is_suspended) {
      return res.status(403).json({ error: 'Account suspended. Contact admin.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Auto-promote and verify user if their email matches the admin email
    if (user.email.trim().toLowerCase() === adminEmail) {
      if (user.role !== 'admin' || !user.is_verified) {
        await db.execute(
          'UPDATE users SET role = ?, is_verified = 1 WHERE id = ?',
          ['admin', user.id]
        );
        user.role = 'admin';
        user.is_verified = 1;
      }
    }

    const isAdmin = user.role === 'admin';

    if (!user.is_verified && !isAdmin) {
      // Only require OTP for non-admin users
      try {
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
        await db.execute(
          'INSERT INTO otp_codes (email, code, purpose, expires_at) VALUES (?, ?, ?, ?)',
          [email, otp, 'login', expiresAt]
        );
        await sendOTP(email, otp, 'login');
        return res.status(200).json({
          message: 'Account not verified. OTP sent.',
          requiresOTP: true,
          email,
        });
      } catch (emailErr) {
        console.error('Failed to send login OTP:', emailErr);
        // Fallback: if email fails, we still have to block them unless we want to be insecure.
        // But for the sake of getting you in, let's keep the isAdmin bypass above.
        return res.status(500).json({ error: 'Failed to send verification email. Please try again later.' });
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'campus_print_secret_fallback_123',
      { expiresIn: process.env.JWT_EXPIRES_IN || '365d' }
    );

    // Force verify admin account
    if (isAdmin && !user.is_verified) {
        await db.execute('UPDATE users SET is_verified = 1 WHERE id = ?', [user.id]);
        user.is_verified = 1;
    }

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || null,
        // Safely access optional fields
        phone: user.phone || null,
        hostel: user.hostel || null,
        room_number: user.room_number || null,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message || 'Login failed' });
  }
};

// POST /api/auth/resend-otp
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const [users] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (!users.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await db.execute(
      'INSERT INTO otp_codes (email, code, purpose, expires_at) VALUES (?, ?, ?, ?)',
      [email, otp, 'login', expiresAt]
    );
    await sendOTP(email, otp, 'login');

    res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ error: err.message || 'Failed to send OTP' });
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  try {
    const [users] = await db.execute(
      'SELECT id, name, email, role, phone, avatar, hostel, room_number, is_verified, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!users.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If user is a shop owner, include shop info
    let shop = null;
    if (users[0].role === 'shop') {
      const [shops] = await db.execute('SELECT * FROM shops WHERE user_id = ?', [req.user.id]);
      shop = shops[0] || null;
    }

    res.json({ user: users[0], shop });
  } catch (err) {
    console.error('GetMe error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};
// PATCH /api/users/profile — Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, hostel, room_number } = req.body;
    await db.execute(
      'UPDATE users SET name = ?, phone = ?, hostel = ?, room_number = ? WHERE id = ?',
      [name, phone, hostel || null, room_number || null, req.user.id]
    );
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('UpdateProfile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// GET /api/auth/transactions — List wallet transactions
exports.getTransactions = async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    const params = [req.user.id];

    if (type) { query += ' AND type = ?'; params.push(type); }
    if (startDate) { query += ' AND created_at >= ?'; params.push(startDate); }
    if (endDate) { query += ' AND created_at <= ?'; params.push(endDate); }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const [transactions] = await db.execute(query, params);
    res.json({ transactions });
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};
