'use client';

import { useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import QRScanner from '@/components/QRScanner';
import { HiOutlineQrcode, HiOutlineTruck, HiOutlineHome } from 'react-icons/hi';

export default function AgentScannerPage() {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanType, setScanType] = useState<'pickup' | 'delivery'>('pickup');
  const [loading, setLoading] = useState(false);

  const handleScan = async (hash: string) => {
    setScannerOpen(false);
    setLoading(true);
    
    try {
      const parsed = JSON.parse(hash);
      const orderId = parsed.orderId;
      const orderHash = parsed.hash;

      if (!orderId || !orderHash) {
        throw new Error('Invalid QR payload');
      }

      if (scanType === 'pickup') {
        await api.post(`/agent/verify-pickup`, { orderId, hash: orderHash });
        toast.success('\u2705 Pickup verified! Order is now in transit.');
      } else {
        await api.post(`/agent/verify-delivery`, { orderId, hash: orderHash });
        toast.success('\u2705 Delivery verified! Earnings credited.');
      }
    } catch (err: any) {
      console.error('Universal scan error:', err);
      const msg = err.response?.data?.error || 'Invalid QR code. This code might not be for a print mission.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', padding: '40px 20px' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ 
          width: 80, height: 80, background: 'var(--primary-glow)', 
          borderRadius: 24, display: 'flex', alignItems: 'center', 
          justifyContent: 'center', color: 'var(--primary)', margin: '0 auto 24px' 
        }}>
          <HiOutlineQrcode size={40} />
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 12 }}>Quick Scan</h1>
        <p style={{ color: 'var(--text-tertiary)', marginBottom: 40, fontSize: 16 }}>
          Use this tool for rapid pickup or delivery verification.
        </p>

        <div className="glass-card" style={{ padding: 32, textAlign: 'left' }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Select Scan Mode</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
            <button 
              onClick={() => setScanType('pickup')}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: 16, borderRadius: 12,
                background: scanType === 'pickup' ? 'var(--primary-glow)' : 'var(--bg-tertiary)',
                border: `1px solid ${scanType === 'pickup' ? 'var(--primary)' : 'var(--border)'}`,
                cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left', width: '100%'
              }}
            >
              <div style={{ fontSize: 24 }}>🏪</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: scanType === 'pickup' ? 'var(--primary-light)' : 'var(--text-primary)' }}>Verify Shop Pickup</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Scan the QR code at the shop counter</div>
              </div>
              {scanType === 'pickup' && <div style={{ color: 'var(--primary)' }}>●</div>}
            </button>

            <button 
              onClick={() => setScanType('delivery')}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: 16, borderRadius: 12,
                background: scanType === 'delivery' ? 'var(--success-bg)' : 'var(--bg-tertiary)',
                border: `1px solid ${scanType === 'delivery' ? 'var(--success)' : 'var(--border)'}`,
                cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left', width: '100%'
              }}
            >
              <div style={{ fontSize: 24 }}>🏠</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: scanType === 'delivery' ? 'var(--success)' : 'var(--text-primary)' }}>Verify Student Delivery</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Scan the QR code on the student's phone</div>
              </div>
              {scanType === 'delivery' && <div style={{ color: 'var(--success)' }}>●</div>}
            </button>
          </div>

          <button 
            className={`btn ${scanType === 'pickup' ? 'btn-primary' : 'btn-success'}`}
            style={{ width: '100%', height: 56, fontSize: 16 }}
            onClick={() => setScannerOpen(true)}
            disabled={loading}
          >
            {loading ? 'Processing...' : `Open ${scanType === 'pickup' ? 'Pickup' : 'Delivery'} Scanner`}
          </button>
        </div>

        <div style={{ marginTop: 32, padding: 20, borderRadius: 12, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ color: 'var(--warning)', fontSize: 20 }}>💡</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'left' }}>
            <strong>Tip:</strong> You can also scan directly from the <strong>Dashboard</strong> under each mission card.
          </p>
        </div>
      </motion.div>

      {scannerOpen && (
        <QRScanner 
          title={scanType === 'pickup' ? "Scan Shop QR" : "Scan Student QR"}
          description={scanType === 'pickup' ? "Scan the QR code shown on the shop's screen." : "Scan the QR code on the student's phone."}
          onClose={() => setScannerOpen(false)}
          onScan={handleScan}
        />
      )}
    </div>
  );
}
