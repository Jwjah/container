'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { ModalOverlay, TapButton } from '@/components/animations';
const generateUUID = () => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

interface WithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBalance: number;
  onSuccess: () => void;
}

export default function WithdrawalModal({ isOpen, onClose, availableBalance, onSuccess }: WithdrawalModalProps) {
  const [payoutDetails, setPayoutDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Form fields
  const [method, setMethod] = useState<'BANK' | 'UPI'>('BANK');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upiId, setUpiId] = useState('');

  // Withdrawal Amount
  const [amount, setAmount] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');

  // Fetch payout details when modal opens
  useEffect(() => {
    if (isOpen) {
      setFetching(true);
      setIdempotencyKey(generateUUID());
      api.get('/withdrawals/payout-details')
        .then(({ data }) => {
          if (data.payoutDetails) {
            const details = data.payoutDetails;
            setPayoutDetails(details);
            setMethod(details.method || 'BANK');
            setAccountHolderName(details.account_holder_name || '');
            setBankName(details.bank_name || '');
            setAccountNumber(details.account_number || '');
            setIfsc(details.ifsc || '');
            setUpiId(details.upi_id || '');
            setIsEditing(false);
          } else {
            setPayoutDetails(null);
            setIsEditing(true);
          }
        })
        .catch(() => {
          setIsEditing(true);
        })
        .finally(() => {
          setFetching(false);
        });
    }
  }, [isOpen]);

  const handleSavePayoutDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: any = { method };
      if (method === 'BANK') {
        if (!accountHolderName || !bankName || !accountNumber || !ifsc) {
          toast.error('All bank fields are required');
          setLoading(false);
          return;
        }
        payload.accountHolderName = accountHolderName;
        payload.bankName = bankName;
        payload.accountNumber = accountNumber;
        payload.ifsc = ifsc;
      } else {
        if (!upiId) {
          toast.error('UPI ID is required');
          setLoading(false);
          return;
        }
        payload.upiId = upiId;
      }

      const { data } = await api.post('/withdrawals/payout-details', payload);
      setPayoutDetails(data.payoutDetails);
      setIsEditing(false);
      toast.success('Payout details saved successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save payout details');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (parsedAmount > availableBalance) {
      toast.error('Cannot withdraw more than available balance');
      return;
    }

    setLoading(true);
    try {
      await api.post('/withdrawals/request', {
        amount: parsedAmount,
        idempotencyKey,
        payoutMethod: payoutDetails.method,
        payoutDetails: payoutDetails
      });
      toast.success('Withdrawal request submitted successfully! (Awaiting Admin Approval)');
      setAmount('');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to request withdrawal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="glass-card" style={{ padding: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: 'var(--text-primary)' }}>Withdraw Earnings</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
          Available Balance: <strong style={{ color: 'var(--success)' }}>₹{availableBalance.toFixed(2)}</strong>
        </p>

        {fetching ? (
          <div className="skeleton" style={{ height: 200 }} />
        ) : isEditing ? (
          <form onSubmit={handleSavePayoutDetails} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Configure Payout Details</h3>
            
            <div className="input-group">
              <label>Payout Method</label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value as 'BANK' | 'UPI')}>
                <option value="BANK">🏛️ Bank Transfer</option>
                <option value="UPI">📱 UPI</option>
              </select>
            </div>

            {method === 'BANK' ? (
              <>
                <div className="input-group">
                  <label>Account Holder Name</label>
                  <input className="input" type="text" placeholder="John Doe" value={accountHolderName} onChange={e => setAccountHolderName(e.target.value)} required />
                </div>
                <div className="input-group">
                  <label>Bank Name</label>
                  <input className="input" type="text" placeholder="State Bank of India" value={bankName} onChange={e => setBankName(e.target.value)} required />
                </div>
                <div className="input-group">
                  <label>Account Number</label>
                  <input className="input" type="text" placeholder="10009283749" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} required />
                </div>
                <div className="input-group">
                  <label>IFSC Code</label>
                  <input className="input" type="text" placeholder="SBIN0001234" value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} required />
                </div>
              </>
            ) : (
              <div className="input-group">
                <label>UPI ID</label>
                <input className="input" type="text" placeholder="johndoe@okhdfcbank" value={upiId} onChange={e => setUpiId(e.target.value)} required />
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              {payoutDetails && (
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsEditing(false)}>Cancel</button>
              )}
              <TapButton type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                {loading ? 'Saving...' : '💾 Save Payout Account'}
              </TapButton>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Payout Details Summary */}
            <div className="glass-card" style={{ padding: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                  {payoutDetails?.method === 'BANK' ? '🏛️ Bank Transfer Account' : '📱 UPI Payout'}
                </h4>
                <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setIsEditing(true)}>Edit</button>
              </div>

              {payoutDetails?.method === 'BANK' ? (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>Holder: <strong>{payoutDetails.account_holder_name}</strong></div>
                  <div>Bank: {payoutDetails.bank_name}</div>
                  <div>A/C No: *******{payoutDetails.account_number?.slice(-4)}</div>
                  <div>IFSC: {payoutDetails.ifsc}</div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  UPI ID: <strong>{payoutDetails?.upi_id}</strong>
                </div>
              )}
            </div>

            {/* Request Withdrawal */}
            <div className="input-group">
              <label>Amount to Withdraw (₹)</label>
              <input 
                className="input" 
                type="number" 
                placeholder="e.g. 500" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
                max={availableBalance}
                min={1}
                disabled={loading}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Close</button>
              <TapButton 
                className="btn btn-primary" 
                style={{ flex: 1, background: 'linear-gradient(135deg, var(--success), #16a34a)' }}
                onClick={handleWithdraw} 
                disabled={loading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > availableBalance}
              >
                {loading ? 'Processing...' : '📤 Confirm Withdraw'}
              </TapButton>
            </div>
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}
