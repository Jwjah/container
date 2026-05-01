'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { StaggerContainer, StaggerItem, HoverCard } from '@/components/animations';

export default function AgentEarningsPage() {
  const [data, setData] = useState<any>({ total_earned: 0, total_deliveries: 0, recent_transactions: [] });
  const [loading, setLoading] = useState(true);

  const loadData = (background = false) => {
    if (!background) setLoading(true);
    api.get('/agent/earnings').then(({ data }) => setData(data.earnings || {})).catch(() => {}).finally(() => setLoading(false));
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
              <div style={{ color: 'var(--text-tertiary)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Total Earnings</div>
              <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--success)' }}>₹{parseFloat(data.total_earned || 0).toFixed(0)}</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card" style={{ padding: 32 }}>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Total Deliveries</div>
              <div style={{ fontSize: 48, fontWeight: 900 }}>{data.total_deliveries || 0}</div>
            </motion.div>
          </div>

          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Recent Transactions</h3>
          {data.recent_transactions?.length === 0 ? (
            <div className="glass-card empty-state">No earnings yet. Complete a delivery to earn!</div>
          ) : (
            <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.recent_transactions?.map((t: any, i: number) => (
                <StaggerItem key={i}>
                  <HoverCard className="glass-card" style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                        +
                      </div>
                      <div>
                        <div style={{ fontWeight: 700 }}>Order #{t.order_hash?.substring(0, 8)?.toUpperCase()}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{new Date(t.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--success)' }}>₹{parseFloat(t.amount).toFixed(0)}</div>
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
