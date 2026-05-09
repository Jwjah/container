'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { StaggerContainer, StaggerItem, ModalOverlay } from '@/components/animations';

export default function AgentHistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = () => {
    setLoading(true);
    // Since recent transactions in earnings has limit 10, let's just use it or implement a full history endpoint
    api.get('/agent/earnings').then(({ data }) => setHistory(data.recent || data.earnings.recent_transactions || [])).catch(() => toast.error('Failed to load history')).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Delivery History</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 24 }}>Log of all your past deliveries.</p>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
        </div>
      ) : history.length === 0 ? (
        <div className="glass-card empty-state">No deliveries found.</div>
      ) : (
        <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {history.map((t: any, i: number) => (
            <StaggerItem key={i}>
              <div className="glass-card" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    ✅
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Order #{t.order_hash?.substring(0, 8)?.toUpperCase()}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      {new Date(t.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--success)' }}>+ ₹{parseFloat(t.earnings).toFixed(0)}</div>
                  <span className={`badge badge-delivered`} style={{ marginTop: 8 }}>Delivered</span>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}
    </div>
  );
}
