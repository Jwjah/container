'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { StaggerContainer, StaggerItem, HoverCard } from '@/components/animations';
import { HiOutlineArrowCircleDown, HiOutlineArrowCircleUp, HiOutlineCheckCircle } from 'react-icons/hi';
import WithdrawalModal from '@/components/WithdrawalModal';

export default function AgentEarningsPage() {
  const [data, setData] = useState<any>({ total_earned: 0, total_deliveries: 0 });
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const loadData = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const [earnRes, transRes] = await Promise.all([
        api.get('/agent/earnings'),
        api.get('/auth/transactions')
      ]);
      setData(earnRes.data);
      setTransactions(transRes.data.transactions || []);
    } catch (e) {
      console.error(e);
    } finally {
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
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Earnings Dashboard</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 24 }}>Track your delivery payouts.</p>

      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 32 }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card" style={{ padding: 24 }}>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Total Earned</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--success)' }}>₹{parseFloat(data.total_earned || 0).toFixed(2)}</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card" style={{ padding: 24 }}>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Completed Deliveries</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-primary)' }}>{data.total_deliveries}</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card" style={{ padding: 24, background: 'rgba(34, 197, 94, 0.02)' }}>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Available for Withdrawal</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--success)', marginBottom: 12 }}>₹{parseFloat(data.wallet_balance || 0).toFixed(2)}</div>
              <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>Withdraw Earnings</button>
            </motion.div>
          </div>

          <WithdrawalModal 
            isOpen={modalOpen} 
            onClose={() => setModalOpen(false)} 
            availableBalance={parseFloat(data.wallet_balance || 0)} 
            onSuccess={() => loadData(true)} 
          />

          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Transaction Ledger</h3>

          {transactions.length === 0 ? (
            <div className="glass-card empty-state">No transactions yet. Complete a delivery to earn!</div>
          ) : (
            <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {transactions.map((t: any, i: number) => (
                <StaggerItem key={i}>
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
              ))}
            </StaggerContainer>
          )}
        </>
      )}
    </div>
  );
}
