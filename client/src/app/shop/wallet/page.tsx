'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { motion } from 'framer-motion';
import { StaggerContainer, StaggerItem, HoverCard } from '@/components/animations';
import { HiOutlineFilter, HiOutlineCash, HiOutlineArrowCircleDown, HiOutlineArrowCircleUp, HiOutlineCheckCircle } from 'react-icons/hi';
import WithdrawalModal from '@/components/WithdrawalModal';

export default function ShopWalletPage() {
  const [shop, setShop] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: '', startDate: '', endDate: '' });
  const [modalOpen, setModalOpen] = useState(false);

  const loadData = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const [shopRes, transRes] = await Promise.all([
        api.get('/shops/my'),
        api.get('/auth/transactions', { params: filters })
      ]);
      setShop(shopRes.data.shop);
      setTransactions(transRes.data.transactions || []);
    } catch (e) {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Wallet & Revenue</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 24 }}>Track your shop's earnings.</p>

      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : (
        <>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: 48, textAlign: 'center', marginBottom: 32 }}>
            <div style={{ color: 'var(--text-tertiary)', fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Available Balance</div>
            <div style={{ fontSize: 64, fontWeight: 900, background: 'linear-gradient(135deg, var(--success), #16a34a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              ₹{parseFloat(shop?.wallet_balance || 0).toFixed(2)}
            </div>
            <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => setModalOpen(true)}>Withdraw Earnings</button>
          </motion.div>

          <WithdrawalModal 
            isOpen={modalOpen} 
            onClose={() => setModalOpen(false)} 
            availableBalance={parseFloat(shop?.wallet_balance || 0)} 
            onSuccess={() => loadData(true)} 
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>Transaction History</h3>
          </div>

          {/* Wallet Filters */}
          <div className="glass-card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="input-group">
              <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Type</label>
              <select className="input" style={{ height: 36, padding: '0 12px' }} value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})}>
                <option value="">All Types</option>
                <option value="credit">Credits</option>
                <option value="debit">Debits</option>
                <option value="settlement">Settlements</option>
              </select>
            </div>
            <div className="input-group" style={{ flex: 1, minWidth: 150 }}>
              <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Start Date</label>
              <input type="date" className="input" style={{ height: 36, padding: '0 12px' }} value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} />
            </div>
            <div className="input-group" style={{ flex: 1, minWidth: 150 }}>
              <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>End Date</label>
              <input type="date" className="input" style={{ height: 36, padding: '0 12px' }} value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} />
            </div>
            <button className="btn btn-primary" onClick={() => loadData()} style={{ height: 36, display: 'flex', alignItems: 'center', gap: 8 }}>
              <HiOutlineFilter /> Filter
            </button>
          </div>

          <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {transactions.length === 0 ? (
              <div className="glass-card empty-state">No transactions found.</div>
            ) : (
              transactions.map(t => (
                <StaggerItem key={t.id}>
                  <HoverCard className="glass-card" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ 
                        width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: t.type === 'credit' ? 'rgba(34, 197, 94, 0.1)' : (t.type === 'settlement' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)'),
                        color: t.type === 'credit' ? 'var(--success)' : (t.type === 'settlement' ? '#3b82f6' : 'var(--error)')
                      }}>
                        {t.type === 'credit' ? <HiOutlineArrowCircleUp size={20} /> : (t.type === 'settlement' ? <HiOutlineCheckCircle size={20} /> : <HiOutlineArrowCircleDown size={20} />)}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{t.description}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{new Date(t.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ 
                        fontSize: 15, fontWeight: 700, 
                        color: t.type === 'credit' ? 'var(--success)' : (t.type === 'settlement' ? '#3b82f6' : 'var(--error)')
                      }}>
                        {t.type === 'credit' ? '+' : (t.type === 'settlement' ? '' : '-')}₹{parseFloat(t.amount).toFixed(2)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Balance: ₹{parseFloat(t.balance_after || 0).toFixed(2)}</div>
                    </div>
                  </HoverCard>
                </StaggerItem>
              ))
            )}
          </StaggerContainer>
        </>
      )}
    </div>
  );
}
