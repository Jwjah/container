'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { StaggerContainer, StaggerItem, HoverCard, PulseDot } from '@/components/animations';
import { HiOutlineTruck, HiOutlineCurrencyDollar, HiOutlineCheckCircle, HiOutlineLightningBolt, HiOutlineX, HiOutlineSearch } from 'react-icons/hi';
import QRScanner from '@/components/QRScanner';

export default function AgentDashboard() {
  const [missions, setMissions] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any>({ total_earned: 0, total_deliveries: 0 });
  const [loading, setLoading] = useState(true);
  const [qrModalMission, setQrModalMission] = useState<any>(null);
  const [pickupQrMission, setPickupQrMission] = useState<any>(null);
  const [scannerOpen, setScannerOpen] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = (background = false) => {
    if (!background) setLoading(true);
    Promise.all([
      api.get('/agent/missions').then(({ data }) => setMissions(data.missions || [])),
      api.get('/agent/earnings').then(({ data }) => setEarnings(data.earnings)),
    ]).catch(() => {}).finally(() => setLoading(false));
  };

  const dropGig = async (orderId: number) => {
    if (!confirm("Are you sure you want to drop this order?")) return;
    try {
      await api.post(`/agent/missions/${orderId}/drop`);
      toast.success('Mission dropped');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to drop mission');
    }
  };

  const scanShopQR = async (rawText: string) => {
    let hash = rawText;
    let qrOrderId = null;
    try {
      const parsed = JSON.parse(rawText);
      hash = parsed.hash || rawText;
      qrOrderId = parsed.orderId;
    } catch (e) {}

    const orderId = scannerOpen;
    if (!orderId) {
      toast.error('No order selected for scan.');
      return;
    }

    // Close the scanner UI immediately so the camera shuts down
    setScannerOpen(null);

    try {
      await api.post(`/agent/verify-pickup`, { orderId, hash });
      toast.success('\u2705 Pickup verified! Head to the student now.');
      loadData();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Invalid QR code. Could not verify pickup.';
      toast.error(errorMsg);
      // Re-open scanner so agent can try again
      setScannerOpen(orderId);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Agent Dashboard 🚴</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
          <PulseDot /> Active & Ready
        </p>
      </motion.div>

      <StaggerContainer className="grid-3" style={{ marginBottom: 32 }}>
        {[
          { label: 'Active Missions', value: missions.length, icon: <HiOutlineTruck size={22} />, color: 'var(--warning)', max: '/5' },
          { label: 'Total Deliveries', value: earnings.total_deliveries, icon: <HiOutlineCheckCircle size={22} />, color: 'var(--success)' },
          { label: 'Total Earned', value: `₹${earnings.total_earned.toFixed(0)}`, icon: <HiOutlineCurrencyDollar size={22} />, color: 'var(--primary-light)' },
        ].map((s, i) => (
          <StaggerItem key={i}>
            <HoverCard className="glass-card stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span className="stat-label">{s.label}</span>
                <span style={{ color: s.color }}>{s.icon}</span>
              </div>
              <div className="stat-value">{s.value}<span style={{ fontSize: 16, opacity: 0.5 }}>{s.max || ''}</span></div>
            </HoverCard>
          </StaggerItem>
        ))}
      </StaggerContainer>

      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Active Missions</h2>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <HiOutlineSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input 
            type="text" 
            className="input" 
            style={{ paddingLeft: 36, width: '100%' }} 
            placeholder="Search missions by Order ID..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 100 }} />)}
        </div>
      ) : missions.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-state-icon"><HiOutlineLightningBolt size={48} /></div>
          <h3>No active missions</h3>
          <p>Check the Gig Radar for available deliveries.</p>
        </div>
      ) : (
        <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {missions.filter(m => 
            !searchQuery ||
            m.order_id_str?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.order_hash?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.student_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.shop_name?.toLowerCase().includes(searchQuery.toLowerCase())
          ).map((m, idx) => (
            <StaggerItem key={m.delivery_id || `mission-${idx}`}>
              <HoverCard className="glass-card" style={{ padding: 20 }}>
                {/* Header: order hash + status badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>#{m.order_id_str || m.order_hash?.substring(0, 8)?.toUpperCase()}</span>
                  <span className={`badge ${m.status === 'assigned' ? 'badge-pending' : m.status === 'picked_up' ? 'badge-printing' : 'badge-out_for_delivery'}`}>
                    {m.status?.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Route: Shop → Student */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, marginBottom: 16, background: 'var(--bg-tertiary)', padding: 12, borderRadius: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🏪</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pickup from</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.shop_name}</div>
                      {m.shop_location && <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{m.shop_location}</div>}
                    </div>
                  </div>
                  
                  <div style={{ height: 1, background: 'var(--border)', margin: '0 4px' }} />

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--success-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🏠</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deliver to</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.student_name}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                        {m.hostel ? `${m.hostel}, Room ${m.room_number}` : m.hostel_address || 'Address not provided'}
                      </div>
                      {m.student_phone && <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>📞</span> {m.student_phone}
                      </div>}
                    </div>
                  </div>
                </div>

                {/* Earnings */}
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', marginBottom: 12 }}>
                  💰 ₹{parseFloat(m.earnings || 0).toFixed(0)} earning for this delivery
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {m.status === 'assigned' && (
                    <>
                      {/* Show pickup QR first so agent can verify it matches the shop's screen */}
                      {m.pickup_qr && (
                        <button
                          onClick={() => setPickupQrMission(m)}
                          className="btn btn-ghost btn-sm"
                          style={{ border: '1px solid var(--border)' }}
                        >
                          📋 View Shop QR
                        </button>
                      )}
                      <button
                        onClick={() => setScannerOpen(m.order_id)}
                        className="btn btn-primary btn-sm"
                      >
                        📷 Scan Shop QR
                      </button>
                      <button
                        onClick={() => dropGig(m.order_id)}
                        className="btn btn-ghost btn-icon"
                        style={{ color: 'var(--error)', background: 'rgba(239, 68, 68, 0.1)', padding: 6, width: 32, height: 32 }}
                        title="Drop Mission"
                      >
                        <HiOutlineX size={16} />
                      </button>
                    </>
                  )}
                  {m.status === 'in_transit' && (
                    <button
                      onClick={() => setQrModalMission(m)}
                      className="btn btn-secondary btn-sm"
                    >
                      📱 Show Delivery QR to Student
                    </button>
                  )}
                </div>
              </HoverCard>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}

      {/* Shop Pickup QR Modal — agent sees the shop QR before scanning */}
      {pickupQrMission && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card" style={{ padding: 32, textAlign: 'center', maxWidth: 400, width: '90%' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Shop Pickup QR</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 20 }}>
              This QR is shown on the shop screen. Scan it with the Scan Shop QR button to verify pickup.
            </p>
            <div style={{ background: '#fff', padding: 16, borderRadius: 16, display: 'inline-block', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <img src={pickupQrMission.pickup_qr} alt="Shop Pickup QR" style={{ width: 200, height: 200 }} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 24 }} onClick={() => setPickupQrMission(null)}>Close</button>
          </div>
        </div>
      )}
      {/* Dropoff QR Modal */}
      {qrModalMission && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card" style={{ padding: 32, textAlign: 'center', maxWidth: 400, width: '90%' }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Delivery Dropoff</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 14, marginBottom: 24 }}>
              Show this QR code to the student to verify delivery.
            </p>
            <div className="qr-container" style={{ background: '#fff', padding: 16, borderRadius: 16, display: 'inline-block', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              <img src={qrModalMission.delivery_qr} alt="Delivery QR" style={{ width: 200, height: 200 }} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 32 }} onClick={() => setQrModalMission(null)}>
              Close View
            </button>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {scannerOpen && (
        <QRScanner
          title="Scan Shop QR"
          description="Point your camera at the QR code displayed on the shop's screen to verify pickup."
          onClose={() => setScannerOpen(null)}
          onScan={scanShopQR}
        />
      )}
    </div>
  );
}
