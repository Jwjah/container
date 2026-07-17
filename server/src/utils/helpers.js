const crypto = require('crypto');
const QRCode = require('qrcode');

/**
 * Generate a secure hash for QR payloads
 */
const generateOrderHash = (orderId, userId) => {
  const payload = `${orderId}-${userId}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
};

/**
 * Generate a unique human-readable chronological sequential Order ID
 */
const generateOrderIdStr = async (connection) => {
  const db = require('../config/database');
  const executor = connection || db;
  const [result] = await executor.execute("REPLACE INTO order_number_sequence (stub) VALUES ('a')");
  const nextSeq = result.insertId || result.lastID;
  const suffix = String(nextSeq).padStart(6, '0');
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `CP-${year}${month}${day}-${hours}${minutes}${seconds}-${suffix}`;
};

/**
 * Generate QR code as data URL
 */
const generateQRCode = async (payload) => {
  const data = JSON.stringify(payload);
  return QRCode.toDataURL(data, {
    width: 300,
    margin: 2,
    color: { dark: '#1a1a3e', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });
};

/**
 * Generate a 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Calculate print pricing
 */
const calculatePrice = ({ pages, copies, printType, layout, binding, shop }) => {
  const pricePerPage = printType === 'color' ? parseFloat(shop.price_color) : parseFloat(shop.price_bw);
  const effectivePages = layout === 'double' ? Math.ceil(pages / 2) : pages;
  const printCost = effectivePages * copies * pricePerPage;
  const bindingCost = binding ? parseFloat(shop.price_binding) * copies : 0;
  return {
    printCost: parseFloat(printCost.toFixed(2)),
    bindingCost: parseFloat(bindingCost.toFixed(2)),
    total: parseFloat((printCost + bindingCost).toFixed(2)),
  };
};

module.exports = { generateOrderHash, generateOrderIdStr, generateQRCode, generateOTP, calculatePrice };
