const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token || req.query.token;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [users] = await db.execute('SELECT id, name, email, role, is_verified, is_suspended FROM users WHERE id = ?', [decoded.id]);
    
    if (!users.length) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (users[0].is_suspended) {
      return res.status(403).json({ error: 'Account suspended. Contact admin.' });
    }

    req.user = users[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = { authenticate, authorize };
