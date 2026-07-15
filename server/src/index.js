const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const app = express();

// Trust reverse proxy headers (for Render, Vercel, etc.)
app.set('trust proxy', true);

// Security
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
app.use(cors({
  origin: true, // Allow all origins for the testing branch to ensure preview works
  credentials: true,
}));




// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/shops', require('./routes/shops'));
app.use('/api/agent', require('./routes/agent'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/export', require('./routes/export'));
app.use('/api/push', require('./routes/push'));
const paymentsRouter = require('./payments/routes/payments').default;
const { dispatcher } = require('./payments/routes/payments');

app.use('/api/payments', paymentsRouter);
app.use('/api/print-jobs', require('./payments/routes/print_jobs').default);

// Register Fulfillment Module
const { FulfillmentModule } = require('./fulfillment/fulfillment');
FulfillmentModule.register(app, dispatcher);

// Register Delivery Module
const { DeliveryModule } = require('./delivery/delivery');
DeliveryModule.register(app, dispatcher);

// Register Scheduling Bounded Context (RFC-008)
const { SchedulingModule } = require('./scheduling/scheduling');
SchedulingModule.register(app);

// Register Notification Bounded Context (RFC-009)
const { NotificationModule } = require('./notification/notification');
NotificationModule.register(app);

// Register Analytics Bounded Context (RFC-010)
const { AnalyticsModule } = require('./analytics/analytics');
AnalyticsModule.register(app);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum 50MB.' });
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 CampusPrint API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Client URL:  ${process.env.CLIENT_URL}\n`);
});
