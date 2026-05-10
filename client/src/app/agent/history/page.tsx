'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { StaggerContainer, StaggerItem, HoverCard } from '@/components/animations';
import { HiOutlineClock, HiOutlineCheckCircle, HiOutlineCurrencyDollar, HiOutlineLocationMarker } from 'react-icons/hi';

export default function AgentHistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/agent/earnings').then(({ data }) => {
      // Filter for delivered ones if not already filtered
      setHistory(data.recent?.filter((h: any) => h.status === 'delivered') || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Delivery History 🕒</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 32 }}>Your successfully completed deliveries and earnings.</p>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 100 }} />)}
        </div>
      ) : history.length === 0 ? (
        <div className="glass-card empty-state">
          <HiOutlineClock size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
          <h3>No delivery history yet</h3>
          <p>Complete your first mission to see it here.</p>
        </div>
      ) : (
        <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {history.map(h => (
            <StaggerItem key={h.id}>
              <HoverCard className="glass-card" style={{ padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <div style={{ width: 50, height: 50, borderRadius: 12, background: 'var(--success-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)' }}>
                    <HiOutlineCheckCircle size={28} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Order #{h.order_hash?.substring(0, 8)?.toUpperCase()}</h3>
                    <div style={{ display: 'flex', gap: 12, fontSize: 13, color: 'var(--text-tertiary)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <HiOutlineClock size={14} /> {new Date(h.delivery_time || h.updated_at).toLocaleDateString()}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <HiOutlineLocationMarker size={14} /> Delivered
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <HiOutlineCurrencyDollar size={20} /> ₹{parseFloat(h.earnings || 0).toFixed(0)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Earned</div>
                </div>
              </HoverCard>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}
    </div>
  );
}
