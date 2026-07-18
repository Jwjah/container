const withdrawalService = require('../services/withdrawalService');
const db = require('../config/database');

/**
 * Mask PII helper
 */
const maskPayoutDetails = (details) => {
  if (!details) return null;
  const masked = { ...details };
  
  // Mask account number
  if (masked.accountNumber) {
    masked.accountNumber = '********' + String(masked.accountNumber).slice(-4);
  }
  if (masked.account_number) {
    masked.account_number = '********' + String(masked.account_number).slice(-4);
  }
  
  // Mask UPI ID
  if (masked.upiId) {
    const parts = String(masked.upiId).split('@');
    if (parts.length === 2) {
      const name = parts[0];
      const domain = parts[1];
      const prefix = name.substring(0, Math.min(4, name.length));
      masked.upiId = prefix + '****@' + domain;
    }
  }
  if (masked.upi_id) {
    const parts = String(masked.upi_id).split('@');
    if (parts.length === 2) {
      const name = parts[0];
      const domain = parts[1];
      const prefix = name.substring(0, Math.min(4, name.length));
      masked.upi_id = prefix + '****@' + domain;
    }
  }
  
  return masked;
};

/**
 * Decrypt and parse snapshot helper
 */
const decryptAndParsePayoutDetails = (payoutDetailsStr) => {
  if (!payoutDetailsStr) return {};
  try {
    const decrypted = withdrawalService.decrypt(payoutDetailsStr);
    return JSON.parse(decrypted);
  } catch (e) {
    try {
      return JSON.parse(payoutDetailsStr);
    } catch {
      return {};
    }
  }
};

/**
 * GET /api/withdrawals/payout-details
 */
exports.getPayoutDetails = async (req, res) => {
  try {
    const details = await withdrawalService.getPayoutDetails(req.user.id);
    res.json({ payoutDetails: maskPayoutDetails(details) });
  } catch (err) {
    console.error('Get payout details error:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve payout details' });
  }
};

/**
 * POST /api/withdrawals/payout-details
 */
exports.savePayoutDetails = async (req, res) => {
  try {
    const { method, accountHolderName, bankName, accountNumber, ifsc, upiId } = req.body;
    if (!method) {
      return res.status(400).json({ error: 'Payout method is required' });
    }

    const details = await withdrawalService.savePayoutDetails(req.user.id, method, {
      accountHolderName,
      bankName,
      accountNumber,
      ifsc,
      upiId
    });

    res.json({ message: 'Payout details saved successfully', payoutDetails: maskPayoutDetails(details) });
  } catch (err) {
    console.error('Save payout details error:', err);
    res.status(500).json({ error: err.message || 'Failed to save payout details' });
  }
};

/**
 * POST /api/withdrawals/request
 */
exports.requestWithdrawal = async (req, res) => {
  try {
    const { amount, idempotencyKey } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than zero' });
    }
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Idempotency key is required' });
    }

    const result = await withdrawalService.requestWithdrawal({
      userId: req.user.id,
      role: req.user.role,
      amount: parseFloat(amount),
      idempotencyKey
    });

    // Parse and mask payout snapshot for response
    const snap = decryptAndParsePayoutDetails(result.payout_details);

    const maskedResult = {
      ...result,
      payout_details: JSON.stringify(maskPayoutDetails(snap))
    };

    res.status(201).json({ message: 'Withdrawal request submitted successfully', withdrawal: maskedResult });
  } catch (err) {
    console.error('Request withdrawal error:', err);
    res.status(400).json({ error: err.message || 'Failed to request withdrawal' });
  }
};

/**
 * GET /api/withdrawals/history
 */
exports.getHistory = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM wallet_withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      [req.user.id]
    );

    const masked = rows.map(r => {
      const snap = decryptAndParsePayoutDetails(r.payout_details);
      return {
        ...r,
        payout_details: JSON.stringify(maskPayoutDetails(snap))
      };
    });

    res.json({ withdrawals: masked });
  } catch (err) {
    console.error('Get withdrawal history error:', err);
    res.status(500).json({ error: 'Failed to fetch withdrawal history' });
  }
};

/**
 * GET /api/admin/withdrawals (with filters: role, status, startDate, endDate, amount)
 */
exports.getAdminWithdrawals = async (req, res) => {
  try {
    const { role, status, startDate, endDate, amount, search } = req.query;
    let query = `
      SELECT w.*, u.name as user_name, u.email as user_email, u.role as user_role,
             c.name as admin_name
      FROM wallet_withdrawals w
      JOIN users u ON w.user_id = u.id
      LEFT JOIN users c ON w.completed_by = c.id
      WHERE 1=1
    `;
    const params = [];

    if (role) {
      query += ' AND u.role = ?';
      params.push(role);
    }
    if (status) {
      query += ' AND w.status = ?';
      params.push(status);
    }
    if (startDate) {
      query += ' AND w.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND w.created_at <= ?';
      params.push(endDate);
    }
    if (amount) {
      query += ' AND w.amount = ?';
      params.push(parseFloat(amount));
    }
    if (search) {
      query += ' AND (u.name LIKE ? OR u.email LIKE ? OR w.withdrawal_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY w.created_at DESC LIMIT 100';

    const [rows] = await db.execute(query, params);

    const masked = rows.map(r => {
      const snap = decryptAndParsePayoutDetails(r.payout_details);
      return {
        ...r,
        payout_details: JSON.stringify(maskPayoutDetails(snap))
      };
    });

    res.json({ withdrawals: masked });
  } catch (err) {
    console.error('Admin get withdrawals error:', err);
    res.status(500).json({ error: 'Failed to retrieve withdrawal requests' });
  }
};

/**
 * GET /api/admin/withdrawals/summary
 */
exports.getAdminWithdrawalsSummary = async (req, res) => {
  try {
    // 1. Pending Amount & Requests (status IN ('REQUESTED', 'APPROVED'))
    const [[pendingStats]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) as pendingAmount, COUNT(*) as pendingRequests 
       FROM wallet_withdrawals 
       WHERE status IN ('REQUESTED', 'APPROVED')`
    );

    // 2. Completed Today
    const todayDateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const [[completedTodayStats]] = await db.execute(
      `SELECT COUNT(*) as completedToday 
       FROM wallet_withdrawals 
       WHERE status = 'COMPLETED' AND completed_at LIKE ?`,
      [`${todayDateStr}%`]
    );

    // 3. Total Paid This Month
    const currentYearMonth = todayDateStr.substring(0, 7); // YYYY-MM
    const [[paidMonthStats]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) as totalPaidMonth 
       FROM wallet_withdrawals 
       WHERE status = 'COMPLETED' AND completed_at LIKE ?`,
      [`${currentYearMonth}%`]
    );

    res.json({
      pendingAmount: parseFloat(pendingStats.pendingAmount),
      pendingRequests: parseInt(pendingStats.pendingRequests, 10),
      completedToday: parseInt(completedTodayStats.completedToday, 10),
      totalPaidMonth: parseFloat(paidMonthStats.totalPaidMonth)
    });
  } catch (err) {
    console.error('Summary stats error:', err);
    res.status(500).json({ error: 'Failed to retrieve stats summary' });
  }
};

/**
 * POST /api/admin/withdrawals/:id/approve
 */
exports.approveWithdrawal = async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'N/A';
    const userAgent = req.headers['user-agent'] || 'N/A';

    const withdrawal = await withdrawalService.approveWithdrawal(req.params.id, req.user.id, ip, userAgent);
    res.json({ message: 'Withdrawal request approved successfully', withdrawal });
  } catch (err) {
    console.error('Approve withdrawal error:', err);
    res.status(400).json({ error: err.message || 'Failed to approve withdrawal' });
  }
};

/**
 * POST /api/admin/withdrawals/:id/reject
 */
exports.rejectWithdrawal = async (req, res) => {
  try {
    const { reason } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'N/A';
    const userAgent = req.headers['user-agent'] || 'N/A';

    const withdrawal = await withdrawalService.rejectWithdrawal(req.params.id, req.user.id, reason, ip, userAgent);
    res.json({ message: 'Withdrawal request rejected successfully', withdrawal });
  } catch (err) {
    console.error('Reject withdrawal error:', err);
    res.status(400).json({ error: err.message || 'Failed to reject withdrawal' });
  }
};

/**
 * POST /api/admin/withdrawals/:id/complete
 */
exports.completeWithdrawal = async (req, res) => {
  try {
    const { referenceNumber } = req.body;
    if (!referenceNumber) {
      return res.status(400).json({ error: 'Reference number (UTR/Transaction ID) is required to complete payout' });
    }

    const ip = req.ip || req.socket.remoteAddress || 'N/A';
    const userAgent = req.headers['user-agent'] || 'N/A';

    const withdrawal = await withdrawalService.completeWithdrawal(req.params.id, req.user.id, referenceNumber, ip, userAgent);
    res.json({ message: 'Withdrawal request completed successfully', withdrawal });
  } catch (err) {
    console.error('Complete withdrawal error:', err);
    res.status(400).json({ error: err.message || 'Failed to complete withdrawal' });
  }
};

/**
 * GET /api/admin/withdrawals/reconciliation
 */
exports.exportReconciliation = async (req, res) => {
  try {
    const query = `
      SELECT w.withdrawal_id, u.name as user_name, u.email as user_email, 
             w.amount, w.status, w.reference_number, 
             c.name as admin_name, w.completed_at
      FROM wallet_withdrawals w
      JOIN users u ON w.user_id = u.id
      LEFT JOIN users c ON w.completed_by = c.id
      ORDER BY w.created_at DESC
    `;
    const [rows] = await db.execute(query);

    // Build CSV content
    let csv = 'Withdrawal ID,User,Amount,Status,Reference Number (UTR),Completed By,Completed At\n';
    for (const r of rows) {
      const uId = r.withdrawal_id || '';
      const userName = `${r.user_name || ''} (${r.user_email || ''})`.replace(/"/g, '""');
      const amount = parseFloat(r.amount || 0).toFixed(2);
      const status = r.status || '';
      const utr = r.reference_number || '';
      const completedBy = r.admin_name || '';
      const completedAt = r.completed_at || '';

      csv += `"${uId}","${userName}",${amount},"${status}","${utr}","${completedBy}","${completedAt}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=reconciliation_report_${new Date().toISOString().split('T')[0]}.csv`);
    res.status(200).send(csv);
  } catch (err) {
    console.error('Export reconciliation error:', err);
    res.status(500).json({ error: 'Failed to generate reconciliation report' });
  }
};
