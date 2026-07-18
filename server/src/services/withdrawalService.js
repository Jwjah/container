const db = require('../config/database');
const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.PAYOUT_ENCRYPTION_KEY || 'a_very_secure_32_byte_payout_key_12345';
const IV_LENGTH = 16;

const encrypt = (text) => {
  if (text === null || text === undefined) return null;
  const str = String(text);
  let key = Buffer.alloc(32);
  Buffer.from(ENCRYPTION_KEY).copy(key);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(str, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (text) => {
  if (text === null || text === undefined) return null;
  const str = String(text);
  try {
    let key = Buffer.alloc(32);
    Buffer.from(ENCRYPTION_KEY).copy(key);
    const parts = str.split(':');
    if (parts.length < 2) return str; // fallback for plaintext
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('[Decryption Error] Returning raw text:', err.message);
    return str;
  }
};

exports.encrypt = encrypt;
exports.decrypt = decrypt;

/**
 * Generate unique chronological human-readable sequential Withdrawal ID
 */
const generateWithdrawalIdStr = async (connection) => {
  const [result] = await connection.execute("REPLACE INTO withdrawal_number_sequence (stub) VALUES ('a')");
  const nextSeq = result.insertId || result.lastID;
  const suffix = String(nextSeq).padStart(6, '0');
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  return `WD-${year}${month}${day}-${suffix}`;
};

/**
 * Helper to stage outbox events
 */
const stageOutboxEvent = async (connection, eventType, aggregateId, payload, correlationId) => {
  const occurredAtStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await connection.execute(
    `INSERT INTO outbox_events (
      event_id, event_type, aggregate_type, aggregate_id, payload, 
      status, retry_count, error_log, correlation_id, event_version, occurred_at
    ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, NULL, ?, 1, ?)`,
    [
      crypto.randomUUID(),
      eventType,
      'WITHDRAWAL',
      aggregateId,
      JSON.stringify(payload),
      correlationId || crypto.randomUUID(),
      occurredAtStr
    ]
  );
};

/**
 * Request a withdrawal
 */
exports.requestWithdrawal = async ({ userId, role, amount, idempotencyKey }) => {
  if (!idempotencyKey) {
    throw new Error('Idempotency key is required');
  }
  if (!amount || amount <= 0) {
    throw new Error('Withdrawal amount must be greater than zero');
  }

  return await db.transaction(async (conn) => {
    // 1. Idempotency Check
    const [existing] = await conn.execute(
      'SELECT * FROM wallet_withdrawals WHERE idempotency_key = ?',
      [idempotencyKey]
    );
    if (existing && existing.length > 0) {
      return existing[0]; // Return already processed request
    }

    // Prevent double pending withdrawals for the same user
    const [pending] = await conn.execute(
      "SELECT id FROM wallet_withdrawals WHERE user_id = ? AND status IN ('REQUESTED', 'APPROVED')",
      [userId]
    );
    if (pending && pending.length > 0) {
      throw new Error('You already have a pending withdrawal request');
    }

    // 2. Fetch Payout Details from DB to Snapshot them
    const [payouts] = await conn.execute(
      'SELECT * FROM payout_accounts WHERE user_id = ?',
      [userId]
    );
    if (!payouts.length) {
      throw new Error('Please configure your payout details first.');
    }
    const payoutAccount = payouts[0];
    const payoutMethod = payoutAccount.method;
    const payoutDetails = {
      accountHolderName: payoutAccount.account_holder_name,
      bankName: payoutAccount.bank_name,
      accountNumber: decrypt(payoutAccount.account_number),
      ifsc: decrypt(payoutAccount.ifsc),
      upiId: decrypt(payoutAccount.upi_id)
    };

    let availableBalance = 0;
    let heldBalance = 0;
    let shopId = null;

    // 3. Lock and Fetch Balance
    if (role === 'shop') {
      const [shops] = await conn.execute(
        'SELECT id, wallet_balance, held_balance FROM shops WHERE user_id = ?',
        [userId]
      );
      if (!shops.length) {
        throw new Error('Shop not found');
      }
      availableBalance = parseFloat(shops[0].wallet_balance || 0);
      heldBalance = parseFloat(shops[0].held_balance || 0);
      shopId = shops[0].id;
    } else if (role === 'agent') {
      const [users] = await conn.execute(
        'SELECT wallet_balance, held_balance FROM users WHERE id = ?',
        [userId]
      );
      if (!users.length) {
        throw new Error('User not found');
      }
      availableBalance = parseFloat(users[0].wallet_balance || 0);
      heldBalance = parseFloat(users[0].held_balance || 0);
    } else {
      throw new Error('Unauthorized role for withdrawals');
    }

    // 4. Validate Available Funds
    if (availableBalance < amount) {
      throw new Error(`Insufficient funds: Requested ₹${amount.toFixed(2)}, Available ₹${availableBalance.toFixed(2)}`);
    }

    // 5. Calculate new balances
    const newAvailable = parseFloat((availableBalance - amount).toFixed(2));
    const newHeld = parseFloat((heldBalance + amount).toFixed(2));

    // 6. Update database balances
    if (role === 'shop') {
      await conn.execute(
        'UPDATE shops SET wallet_balance = ?, held_balance = ? WHERE id = ?',
        [newAvailable, newHeld, shopId]
      );
    } else {
      await conn.execute(
        'UPDATE users SET wallet_balance = ?, held_balance = ? WHERE id = ?',
        [newAvailable, newHeld, userId]
      );
    }

    // 7. Generate chronological withdrawal ID
    const withdrawalIdStr = await generateWithdrawalIdStr(conn);

    // 8. Insert withdrawal request record (Saving the full snapshot of payout details - ENCRYPTED at rest)
    const encryptedPayoutDetails = encrypt(JSON.stringify(payoutDetails));
    const [insertResult] = await conn.execute(
      `INSERT INTO wallet_withdrawals (
        withdrawal_id, idempotency_key, user_id, amount, status, payout_method, payout_details
      ) VALUES (?, ?, ?, ?, 'REQUESTED', ?, ?)`,
      [
        withdrawalIdStr,
        idempotencyKey,
        userId,
        amount,
        payoutMethod,
        encryptedPayoutDetails
      ]
    );

    const insertedDbId = insertResult.insertId || insertResult.lastID;

    // 9. Insert Ledger entry (Debit from available balance)
    await conn.execute(
      `INSERT INTO transactions (user_id, type, amount, description, reference_id, balance_after) 
       VALUES (?, 'debit', ?, ?, ?, ?)`,
      [
        userId,
        amount,
        `Withdrawal request (Held) ${withdrawalIdStr}`,
        withdrawalIdStr,
        newAvailable
      ]
    );

    // 10. Stage Outbox event
    const eventPayload = {
      id: insertedDbId,
      withdrawalId: withdrawalIdStr,
      userId,
      role,
      amount,
      payoutMethod,
      payoutDetails
    };
    await stageOutboxEvent(conn, 'WITHDRAWAL_REQUESTED', withdrawalIdStr, eventPayload);

    return {
      id: insertedDbId,
      withdrawal_id: withdrawalIdStr,
      user_id: userId,
      amount,
      status: 'REQUESTED',
      payout_method: payoutMethod,
      payout_details: JSON.stringify(payoutDetails)
    };
  });
};

/**
 * Approve a withdrawal (Status changes only)
 */
exports.approveWithdrawal = async (withdrawalId, adminId, ip = 'N/A', userAgent = 'N/A') => {
  return await db.transaction(async (conn) => {
    const [withdrawals] = await conn.execute(
      'SELECT * FROM wallet_withdrawals WHERE id = ?',
      [withdrawalId]
    );
    if (!withdrawals.length) {
      throw new Error('Withdrawal request not found');
    }
    const withdrawal = withdrawals[0];

    if (withdrawal.status !== 'REQUESTED') {
      throw new Error(`Cannot approve withdrawal in status: ${withdrawal.status}`);
    }

    await conn.execute(
      "UPDATE wallet_withdrawals SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [withdrawalId]
    );

    // Audit Trail Logging
    console.log(`[AUDIT] Action: APPROVE, AdminID: ${adminId}, WithdrawalID: ${withdrawal.withdrawal_id}, IP: ${ip}, UA: ${userAgent}, Timestamp: ${new Date().toISOString()}`);

    // Stage event
    const eventPayload = {
      id: withdrawal.id,
      withdrawalId: withdrawal.withdrawal_id,
      userId: withdrawal.user_id,
      amount: parseFloat(withdrawal.amount),
      adminId
    };
    await stageOutboxEvent(conn, 'WITHDRAWAL_APPROVED', withdrawal.withdrawal_id, eventPayload);

    return { ...withdrawal, status: 'APPROVED' };
  });
};

/**
 * Reject / Cancel a withdrawal (Move held back to available)
 */
exports.rejectWithdrawal = async (withdrawalId, adminId, reason = '', ip = 'N/A', userAgent = 'N/A') => {
  return await db.transaction(async (conn) => {
    const [withdrawals] = await conn.execute(
      'SELECT * FROM wallet_withdrawals WHERE id = ?',
      [withdrawalId]
    );
    if (!withdrawals.length) {
      throw new Error('Withdrawal request not found');
    }
    const withdrawal = withdrawals[0];

    if (withdrawal.status !== 'REQUESTED' && withdrawal.status !== 'APPROVED') {
      throw new Error(`Cannot reject withdrawal in status: ${withdrawal.status}`);
    }

    const userId = withdrawal.user_id;
    const amount = parseFloat(withdrawal.amount);

    // Resolve role of the withdrawing user
    const [users] = await conn.execute('SELECT role FROM users WHERE id = ?', [userId]);
    if (!users.length) {
      throw new Error('User who requested withdrawal not found');
    }
    const role = users[0].role;

    let newAvailable = 0;

    if (role === 'shop') {
      const [shops] = await conn.execute(
        'SELECT id, wallet_balance, held_balance FROM shops WHERE user_id = ?',
        [userId]
      );
      if (!shops.length) {
        throw new Error('Shop not found');
      }
      const available = parseFloat(shops[0].wallet_balance || 0);
      const held = parseFloat(shops[0].held_balance || 0);

      newAvailable = parseFloat((available + amount).toFixed(2));
      const newHeld = parseFloat(Math.max(0, held - amount).toFixed(2));

      await conn.execute(
        'UPDATE shops SET wallet_balance = ?, held_balance = ? WHERE id = ?',
        [newAvailable, newHeld, shops[0].id]
      );
    } else {
      const [userData] = await conn.execute(
        'SELECT wallet_balance, held_balance FROM users WHERE id = ?',
        [userId]
      );
      const available = parseFloat(userData[0].wallet_balance || 0);
      const held = parseFloat(userData[0].held_balance || 0);

      newAvailable = parseFloat((available + amount).toFixed(2));
      const newHeld = parseFloat(Math.max(0, held - amount).toFixed(2));

      await conn.execute(
        'UPDATE users SET wallet_balance = ?, held_balance = ? WHERE id = ?',
        [newAvailable, newHeld, userId]
      );
    }

    // Update status and rejection reason
    await conn.execute(
      "UPDATE wallet_withdrawals SET status = 'REJECTED', rejection_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [reason || 'Rejected by Admin', withdrawalId]
    );

    // Audit Trail Logging
    console.log(`[AUDIT] Action: REJECT, AdminID: ${adminId}, WithdrawalID: ${withdrawal.withdrawal_id}, IP: ${ip}, UA: ${userAgent}, Timestamp: ${new Date().toISOString()}`);

    // Insert reversal ledger entry (credit back to available)
    await conn.execute(
      `INSERT INTO transactions (user_id, type, amount, description, reference_id, balance_after) 
       VALUES (?, 'credit', ?, ?, ?, ?)`,
      [
        userId,
        amount,
        `Withdrawal Reversal ${withdrawal.withdrawal_id}`,
        withdrawal.withdrawal_id,
        newAvailable
      ]
    );

    // Stage event
    const eventPayload = {
      id: withdrawal.id,
      withdrawalId: withdrawal.withdrawal_id,
      userId,
      amount,
      adminId,
      reason
    };
    await stageOutboxEvent(conn, 'WITHDRAWAL_REJECTED', withdrawal.withdrawal_id, eventPayload);

    return { ...withdrawal, status: 'REJECTED', rejection_reason: reason };
  });
};

/**
 * Complete a withdrawal (Deduct held balance, write settlement audit log)
 */
exports.completeWithdrawal = async (withdrawalId, adminId, referenceNumber, ip = 'N/A', userAgent = 'N/A') => {
  if (!referenceNumber || referenceNumber.trim() === '') {
    throw new Error('Reference number (UTR/Transaction ID) is required to complete payout');
  }

  return await db.transaction(async (conn) => {
    const [withdrawals] = await conn.execute(
      'SELECT * FROM wallet_withdrawals WHERE id = ?',
      [withdrawalId]
    );
    if (!withdrawals.length) {
      throw new Error('Withdrawal request not found');
    }
    const withdrawal = withdrawals[0];

    if (withdrawal.status !== 'APPROVED') {
      throw new Error('Withdrawal must be in APPROVED status before completing payout');
    }

    const userId = withdrawal.user_id;
    const amount = parseFloat(withdrawal.amount);

    // Resolve role of the withdrawing user
    const [users] = await conn.execute('SELECT role FROM users WHERE id = ?', [userId]);
    if (!users.length) {
      throw new Error('User not found');
    }
    const role = users[0].role;

    let currentAvailable = 0;

    // Deduct held balance
    if (role === 'shop') {
      const [shops] = await conn.execute(
        'SELECT id, wallet_balance, held_balance FROM shops WHERE user_id = ?',
        [userId]
      );
      if (!shops.length) {
        throw new Error('Shop not found');
      }
      const held = parseFloat(shops[0].held_balance || 0);
      currentAvailable = parseFloat(shops[0].wallet_balance || 0);
      const newHeld = parseFloat(Math.max(0, held - amount).toFixed(2));

      await conn.execute(
        'UPDATE shops SET held_balance = ? WHERE id = ?',
        [newHeld, shops[0].id]
      );
    } else {
      const [userData] = await conn.execute(
        'SELECT wallet_balance, held_balance FROM users WHERE id = ?',
        [userId]
      );
      const held = parseFloat(userData[0].held_balance || 0);
      currentAvailable = parseFloat(userData[0].wallet_balance || 0);
      const newHeld = parseFloat(Math.max(0, held - amount).toFixed(2));

      await conn.execute(
        'UPDATE users SET held_balance = ? WHERE id = ?',
        [newHeld, userId]
      );
    }

    const completedAtStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Update status and completion metadata
    await conn.execute(
      `UPDATE wallet_withdrawals SET 
        status = 'COMPLETED', 
        completed_by = ?, 
        completed_at = ?, 
        reference_number = ?, 
        updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [adminId, completedAtStr, referenceNumber, withdrawalId]
    );

    // Audit Trail Logging
    console.log(`[AUDIT] Action: COMPLETE, AdminID: ${adminId}, WithdrawalID: ${withdrawal.withdrawal_id}, UTR: ${referenceNumber}, IP: ${ip}, UA: ${userAgent}, Timestamp: ${new Date().toISOString()}`);

    // Insert settlement ledger record (does not change available balance but logs final outcome)
    await conn.execute(
      `INSERT INTO transactions (user_id, type, amount, description, reference_id, balance_after) 
       VALUES (?, 'settlement', ?, ?, ?, ?)`,
      [
        userId,
        amount,
        `Withdrawal Settlement (Payout ID: ${withdrawal.withdrawal_id})`,
        withdrawal.withdrawal_id,
        currentAvailable
      ]
    );

    // Stage event
    const eventPayload = {
      id: withdrawal.id,
      withdrawalId: withdrawal.withdrawal_id,
      userId,
      amount,
      adminId,
      completedAt: completedAtStr,
      referenceNumber
    };
    await stageOutboxEvent(conn, 'WITHDRAWAL_COMPLETED', withdrawal.withdrawal_id, eventPayload);

    return {
      ...withdrawal,
      status: 'COMPLETED',
      completed_by: adminId,
      completed_at: completedAtStr,
      reference_number: referenceNumber
    };
  });
};

/**
 * Fetch saved payout details (returns decrypted values)
 */
exports.getPayoutDetails = async (userId) => {
  const [rows] = await db.execute(
    'SELECT * FROM payout_accounts WHERE user_id = ?',
    [userId]
  );
  if (rows && rows.length > 0) {
    const row = rows[0];
    return {
      ...row,
      account_number: decrypt(row.account_number),
      ifsc: decrypt(row.ifsc),
      upi_id: decrypt(row.upi_id)
    };
  }
  return null;
};

/**
 * Save / Update payout details (encrypts sensitive values)
 */
exports.savePayoutDetails = async (userId, method, details) => {
  if (method !== 'BANK' && method !== 'UPI') {
    throw new Error('Payout method must be BANK or UPI');
  }

  const { accountHolderName, bankName, accountNumber, ifsc, upiId } = details;
  const encAccountNumber = encrypt(accountNumber);
  const encIfsc = encrypt(ifsc);
  const encUpiId = encrypt(upiId);

  await db.transaction(async (conn) => {
    const [existing] = await conn.execute(
      'SELECT id FROM payout_accounts WHERE user_id = ?',
      [userId]
    );

    if (existing && existing.length > 0) {
      await conn.execute(
        `UPDATE payout_accounts SET 
          method = ?, 
          account_holder_name = ?, 
          bank_name = ?, 
          account_number = ?, 
          ifsc = ?, 
          upi_id = ?, 
          updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = ?`,
        [
          method,
          accountHolderName || null,
          bankName || null,
          encAccountNumber || null,
          encIfsc || null,
          encUpiId || null,
          userId
        ]
      );
    } else {
      await conn.execute(
        `INSERT INTO payout_accounts (
          user_id, method, account_holder_name, bank_name, account_number, ifsc, upi_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          method,
          accountHolderName || null,
          bankName || null,
          encAccountNumber || null,
          encIfsc || null,
          encUpiId || null
        ]
      );
    }
  });

  return this.getPayoutDetails(userId);
};
