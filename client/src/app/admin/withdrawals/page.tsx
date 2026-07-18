'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { StaggerContainer, StaggerItem, HoverCard, TapButton, ModalOverlay } from '@/components/animations';
import { HiOutlineFilter } from 'react-icons/hi';

export default function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ role: '', status: '', search: '' });

  // Summary Stats State
  const [summary, setSummary] = useState<any>({
    pendingAmount: 0,
    pendingRequests: 0,
    completedToday: 0,
    totalPaidMonth: 0
  });

  // Completion Modal State
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  
  // Rejection Modal State
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const loadSummary = async () => {
    try {
      const { data } = await api.get('/admin/withdrawals/summary');
      setSummary(data);
    } catch (e) {
      console.error('Failed to load summary stats');
    }
  };

  const loadWithdrawals = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const [wRes] = await Promise.all([
        api.get('/admin/withdrawals', {
          params: {
            role: filters.role,
            status: filters.status,
            search: filters.search
          }
        }),
        loadSummary()
      ]);
      setWithdrawals(wRes.data.withdrawals || []);
    } catch (e) {
      toast.error('Failed to load withdrawals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWithdrawals();
    const interval = setInterval(() => loadWithdrawals(true), 10000);
    return () => clearInterval(interval);
  }, [filters]);

  const handleApprove = async (id: number) => {
    if (!confirm('Are you sure you want to APPROVE this withdrawal? This will lock funds for payment execution.')) return;
    if (!confirm('WARNING: Confirming approval is irreversible once payout is executed. Proceed?')) return;
    try {
      await api.post(`/admin/withdrawals/${id}/approve`);
      toast.success('Withdrawal approved!');
      loadWithdrawals(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve');
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingId) return;
    if (!confirm('Are you sure you want to REJECT this request? Held funds will be released back to the user\'s wallet.')) return;
    try {
      await api.post(`/admin/withdrawals/${rejectingId}/reject`, {
        reason: rejectionReason
      });
      toast.success('Withdrawal rejected, funds returned to available balance');
      setRejectingId(null);
      setRejectionReason('');
      loadWithdrawals(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to reject');
    }
  };

  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingId || !referenceNumber || !confirmCheckbox) return;
    try {
      await api.post(`/admin/withdrawals/${completingId}/complete`, {
        referenceNumber
      });
      toast.success('Payout completed! Settlement finalized.');
      setCompletingId(null);
      setReferenceNumber('');
      setConfirmCheckbox(false);
      loadWithdrawals(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to complete payout');
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await api.get('/admin/withdrawals/reconciliation', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `reconciliation_report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Reconciliation report downloaded successfully!');
    } catch (e) {
      toast.error('Failed to export reconciliation report');
    }
  };

  const parsePayoutDetails = (detailsStr: string) => {
    try {
      return JSON.parse(detailsStr);
    } catch {
      return {};
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'REQUESTED': return 'badge-pending';
      case 'APPROVED': return 'badge-printing';
      case 'COMPLETED': return 'badge-delivered';
      case 'REJECTED':
      case 'CANCELLED': return 'badge-cancelled';
      default: return 'badge-pending';
    }
  };

  return (
    <div>
      {/* Page Header with Reconciliation Export Action */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, margin: 0 }}>Withdrawal Requests</h1>
          <p style={{ color: 'var(--text-tertiary)', margin: 0 }}>Approve requests and manage settlements for Shops and Agents.</p>
        </div>
        <button 
          onClick={handleExportCSV} 
          className="btn btn-secondary" 
          style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          📊 Export Reconciliation CSV
        </button>
      </div>

      {/* Summary Statistics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 32 }}>
        <div className="glass-card" style={{ padding: 20, background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Pending Amount</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--error)' }}>₹{summary.pendingAmount?.toFixed(2)}</div>
        </div>
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Pending Requests</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-primary)' }}>{summary.pendingRequests}</div>
        </div>
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Completed Today</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--success)' }}>{summary.completedToday}</div>
        </div>
        <div className="glass-card" style={{ padding: 20, background: 'rgba(34, 197, 94, 0.03)', border: '1px solid rgba(34, 197, 94, 0.1)' }}>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Total Paid This Month</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--success)' }}>₹{summary.totalPaidMonth?.toFixed(2)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div className="input-group" style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Search User/Withdrawal ID</label>
          <input className="input" placeholder="Search..." value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} />
        </div>
        <div className="input-group">
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Role</label>
          <select className="input" value={filters.role} onChange={e => setFilters({...filters, role: e.target.value})}>
            <option value="">All Roles</option>
            <option value="shop">🏪 Shop Owner</option>
            <option value="agent">🚴 Delivery Agent</option>
          </select>
        </div>
        <div className="input-group">
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Status</label>
          <select className="input" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
            <option value="">All Statuses</option>
            <option value="REQUESTED">REQUESTED</option>
            <option value="APPROVED">APPROVED</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => loadWithdrawals()} style={{ height: 42 }}>
          <HiOutlineFilter /> Filter
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 140 }} />)}
        </div>
      ) : withdrawals.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-state-icon">💸</div>
          <h3>No withdrawal requests found</h3>
          <p>Adjust your filters or check back later.</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {withdrawals.map(w => {
              const details = parsePayoutDetails(w.payout_details);
              return (
                <StaggerItem key={w.id}>
                  <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}>
                    <HoverCard className="glass-card" style={{ padding: 24 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{w.withdrawal_id}</h3>
                            <span className={`badge ${getStatusBadgeClass(w.status)}`}>{w.status}</span>
                            <span className="badge badge-confirmed" style={{ textTransform: 'capitalize' }}>
                              {w.user_role === 'shop' ? '🏪 Shop Owner' : '🚴 Delivery Agent'}
                            </span>
                          </div>
                          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                            Requested by: <strong>{w.user_name}</strong> ({w.user_email})
                          </p>

                          {/* Payout Details */}
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', marginTop: 12 }}>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>
                              Method: {w.payout_method === 'BANK' ? '🏛️ Bank Transfer' : '📱 UPI'}
                            </div>
                            {w.payout_method === 'BANK' ? (
                              <div>
                                Holder: {details.accountHolderName || details.account_holder_name} · Bank: {details.bankName || details.bank_name}<br />
                                A/C: <strong>{details.accountNumber || details.account_number}</strong> · IFSC: {details.ifsc}
                              </div>
                            ) : (
                              <div>UPI ID: <strong>{details.upiId || details.upi_id}</strong></div>
                            )}
                          </div>

                          {w.rejection_reason && (
                            <p style={{ fontSize: 13, color: 'var(--error)', marginTop: 12 }}>
                              ❌ Rejection Reason: <strong>{w.rejection_reason}</strong>
                            </p>
                          )}

                          {w.reference_number && (
                            <p style={{ fontSize: 13, color: 'var(--success)', marginTop: 12 }}>
                              ✅ Completed by {w.admin_name || 'Admin'} UTR Ref: <strong>{w.reference_number}</strong> (at {new Date(w.completed_at).toLocaleString()})
                            </p>
                          )}
                        </div>

                        {/* Amount & Actions */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
                          <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--success)' }}>₹{parseFloat(w.amount).toFixed(2)}</span>
                          
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            {(w.status === 'REQUESTED' || w.status === 'APPROVED') && (
                              <TapButton className="btn btn-danger btn-sm" onClick={() => {
                                setRejectingId(w.id);
                                setRejectionReason('');
                              }}>
                                Reject
                              </TapButton>
                            )}

                            {w.status === 'REQUESTED' && (
                              <TapButton className="btn btn-success btn-sm" onClick={() => handleApprove(w.id)}>
                                Approve
                              </TapButton>
                            )}

                            {w.status === 'APPROVED' && (
                              <TapButton className="btn btn-primary btn-sm" onClick={() => {
                                setCompletingId(w.id);
                                setReferenceNumber('');
                                setConfirmCheckbox(false);
                              }} style={{ background: 'linear-gradient(135deg, var(--success), #16a34a)' }}>
                                Complete Payout
                              </TapButton>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 16, borderTop: '1px solid var(--border-light)', paddingTop: 12 }}>
                        Created: {new Date(w.created_at).toLocaleString()}
                      </div>
                    </HoverCard>
                  </motion.div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </AnimatePresence>
      )}

      {/* Completion Modal */}
      <ModalOverlay isOpen={completingId !== null} onClose={() => setCompletingId(null)}>
        <form onSubmit={handleCompleteSubmit} className="glass-card" style={{ padding: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Complete Withdrawal Payout</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
            Please enter the manual UTR, Bank Reference Number or Payout Transaction ID to finalize this settlement record.
          </p>

          <div className="input-group">
            <label>Transaction Reference / UTR *</label>
            <input 
              className="input" 
              type="text" 
              placeholder="e.g. UTR1029384756" 
              value={referenceNumber} 
              onChange={e => setReferenceNumber(e.target.value)} 
              required 
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
            <input 
              type="checkbox" 
              checked={confirmCheckbox} 
              onChange={e => setConfirmCheckbox(e.target.checked)} 
              style={{ width: 16, height: 16 }} 
            />
            <span>I confirm that the manual transfer has been successfully processed externally, and this action is irreversible.</span>
          </label>

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCompletingId(null)}>Cancel</button>
            <TapButton type="submit" className="btn btn-primary" style={{ flex: 1, background: 'linear-gradient(135deg, var(--success), #16a34a)' }} disabled={!referenceNumber || !confirmCheckbox}>
              Finalize Payout
            </TapButton>
          </div>
        </form>
      </ModalOverlay>

      {/* Rejection Modal */}
      <ModalOverlay isOpen={rejectingId !== null} onClose={() => setRejectingId(null)}>
        <form onSubmit={handleRejectSubmit} className="glass-card" style={{ padding: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Reject Withdrawal Request</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
            Funds will be released from Held Balance and returned back to the user's Available Balance.
          </p>

          <div className="input-group">
            <label>Rejection Reason *</label>
            <input 
              className="input" 
              type="text" 
              placeholder="e.g. Invalid account details or mismatch" 
              value={rejectionReason} 
              onChange={e => setRejectionReason(e.target.value)} 
              required 
            />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setRejectingId(null)}>Cancel</button>
            <TapButton type="submit" className="btn btn-danger" style={{ flex: 1 }} disabled={!rejectionReason}>
              Reject & Release Funds
            </TapButton>
          </div>
        </form>
      </ModalOverlay>
    </div>
  );
}
