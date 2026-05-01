'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { StaggerContainer, StaggerItem, HoverCard, TapButton, PulseDot } from '@/components/animations';

export default function AgentRadarPage() {
  const [gigs, setGigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const scanRadar = () => {
    // The backend route is /agent/available and it returns { deliveries: [...] }
    api.get('/agent/available')
      .then(({ data }) => {
        const available = data.deliveries || data.gigs || [];
        setGigs(available);
      })
      .catch((err) => {
        console.error('Radar scan error:', err);
        // If we already have gigs, don't show error, just keep current list.
        // If not, show error toast.
        if (gigs.length === 0) {
          toast.error('Failed to sync with radar. Checking connection...');
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { scanRadar(); const i = setInterval(scanRadar, 5000); return () => clearInterval(i); }, []);

  const acceptGig = async (id: number) => {
    try {
      // Backend route is POST /agent/accept/:orderId
      await api.post(`/agent/accept/${id}`);
      toast.success('Gig accepted! View in Missions.');
      scanRadar();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to accept gig');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Gig Radar 📡</h1>
          <p style={{ color: 'var(--text-tertiary)' }}>Live feed of available delivery gigs on campus.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--primary-glow)', borderRadius: 999, fontSize: 14, fontWeight: 600, color: 'var(--primary-light)' }}>
          <PulseDot /> Scanning Live
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 120 }} />)}
        </div>
      ) : gigs.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card empty-state" style={{ padding: 64 }}>
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ fontSize: 64, marginBottom: 24 }}
          >📡</motion.div>
          <h3>No gigs available right now</h3>
          <p>Radar is actively scanning. New gigs will pop up here instantly.</p>
        </motion.div>
      ) : (
        <AnimatePresence mode="popLayout">
          <StaggerContainer style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {gigs.map((gig) => (
              <StaggerItem key={gig.id}>
                <motion.div layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                  <HoverCard className="glass-card" style={{ padding: 24, border: '1px solid var(--primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div className="badge badge-ready">⚡ New Gig</div>
                      <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--success)' }}>₹{gig.delivery_fee}</div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20, fontSize: 14 }}>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ width: 24, textAlign: 'center' }}>🏪</div>
                        <div>
                          <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Pickup from</div>
                          <div style={{ fontWeight: 600 }}>{gig.shop_name}</div>
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {gig.shop_location || 'Address not provided'}
                          </div>
                        </div>
                      </div>
                      <div style={{ height: 20, borderLeft: '2px dashed var(--border)', marginLeft: 11 }}></div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ width: 24, textAlign: 'center' }}>🏠</div>
                        <div>
                          <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Deliver to</div>
                          <div style={{ fontWeight: 600 }}>{gig.student_name}</div>
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {gig.hostel_address || `${gig.hostel} - Room ${gig.room_number}`}
                          </div>
                        </div>
                      </div>
                    </div>

                    <TapButton className="btn btn-primary" style={{ width: '100%' }} onClick={() => acceptGig(gig.id)}>
                      Accept Gig
                    </TapButton>
                  </HoverCard>
                </motion.div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </AnimatePresence>
      )}
    </div>
  );
}
