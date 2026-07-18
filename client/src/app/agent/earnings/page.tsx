'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { StaggerContainer, StaggerItem, HoverCard } from '@/components/animations';
import { HiOutlineArrowCircleDown, HiOutlineArrowCircleUp } from 'react-icons/hi';
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
      setData(earnRes.data.earnings || { total_earned: 0, total_deliveries: 0 });
      setTransactions(transRes.data.transactions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Earnings & Wallet 💰</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 32 }}>Track your delivery earnings and payouts.</p>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="skeleton" style={{ height: 160 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginBottom: 32 }}>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: 32, background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), transparent)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Available Balance</div>
              <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--success)', marginBottom: 16 }}>₹{parseFloat(data.total_earned || 0).toFixed(2)}</div>
              <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>Withdraw Earnings</button>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card" style={{ padding: 32 }}>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Total Deliveries</div>
              <div style={{ fontSize: 48, fontWeight: 900 }}>{data.total_deliveries || 0}</div>
            </motion.div>
          </div>

          <WithdrawalModal 
            isOpen={modalOpen} 
            onClose={() => setModalOpen(false)} 
            availableBalance={parseFloat(data.total_earned || 0)} 
            onSuccess={() => loadData(true)} 
          />

          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Transaction History</h3>
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
                        background: t.type === 'credit' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: t.type === 'credit' ? 'var(--success)' : 'var(--error)'
                      }}>
                        {t.type === 'credit' ? <HiOutlineArrowCircleUp size={20} /> : <HiOutlineArrowCircleDown size={20} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{t.description}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{new Date(t.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ 
                        fontSize: 15, fontWeight: 700, 
                        color: t.type === 'credit' ? 'var(--success)' : 'var(--error)'
                      }}>
                        {t.type === 'credit' ? '+' : '-'}₹{parseFloat(t.amount).toFixed(2)}
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
