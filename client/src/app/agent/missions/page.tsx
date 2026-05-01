'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { StaggerContainer, StaggerItem, HoverCard, TapButton } from '@/components/animations';
import toast from 'react-hot-toast';

export default function AgentMissionsPage() {
  const [missions, setMissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMissions = (background = false) => {
    if (!background) setLoading(true);
    api.get('/agent/missions').then(({ data }) => setMissions(data.missions || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { 
    loadMissions();
    const interval = setInterval(() => loadMissions(true), 3000);
    return () => clearInterval(interval);
  }, []);

  const dropMission = async (orderId: number) => {
    try {
      await api.post(`/agent/missions/${orderId}/drop`);
      toast.success('Mission dropped');
      loadMissions();
    } catch (err) { toast.error('Drop failed'); }
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>My Missions 🚚</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 32 }}>Manage your currently accepted deliveries.</p>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 140 }} />)}</div>
      ) : missions.length === 0 ? (
        <div className="glass-card empty-state"><h3>No active missions</h3><p>Accept gigs from the Radar to get started.</p></div>
      ) : (
        <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {missions.map(m => (
            <StaggerItem key={m.delivery_id}>
              <HoverCard className="glass-card" style={{ padding: 24, borderLeft: `4px solid ${m.status === 'assigned' ? 'var(--warning)' : 'var(--primary)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Order #{m.order_hash?.substring(0, 8)?.toUpperCase()}</h3>
                    <span className={`badge ${m.status === 'assigned' ? 'badge-pending' : m.status === 'picked_up' ? 'badge-printing' : 'badge-out_for_delivery'}`}>
                      {m.status?.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--success)' }}>Earn ₹{parseFloat(m.earnings || 0).toFixed(0)}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 14, marginBottom: 20, background: 'var(--bg-tertiary)', padding: 16, borderRadius: 12 }}>
                  <div>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 4 }}>Pickup From (Shop)</div>
                    <div style={{ fontWeight: 700 }}>{m.shop_name}</div>
                    {m.status === 'assigned' && <div style={{ fontSize: 12, color: 'var(--primary-light)', marginTop: 4 }}>Must scan Shop QR</div>}
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 4 }}>Deliver To (Student)</div>
                    <div style={{ fontWeight: 700 }}>{m.student_name}</div>
                    <div style={{ fontSize: 13 }}>{m.hostel} - Room {m.room_number}</div>
                    {m.status === 'picked_up' && <div style={{ fontSize: 12, color: 'var(--primary-light)', marginTop: 4 }}>Must scan Student QR</div>}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                  <TapButton className="btn btn-secondary" onClick={() => dropMission(m.order_id)}>Drop Mission</TapButton>
                </div>
              </HoverCard>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}
    </div>
  );
}
