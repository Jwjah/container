'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { TapButton, ModalOverlay } from '@/components/animations';
import { HiOutlineExclamationCircle } from 'react-icons/hi';

export default function AdminDangerZone() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [target, setTarget] = useState<'orders' | 'all'>('orders');
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const executeWipe = async () => {
    if (confirmText !== 'I AM SURE') {
      toast.error('Confirmation text does not match');
      return;
    }
    setLoading(true);
    try {
      await api.delete('/admin/danger', { data: { target } });
      toast.success(`${target === 'orders' ? 'All orders' : 'Full system reset'} wiped successfully`);
      setConfirmOpen(false);
      setConfirmText('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Wipe failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: 'var(--error)' }}>Danger Zone</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 32 }}>Irreversible system operations. Proceed with extreme caution.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <motion.div whileHover={{ scale: 1.02 }} className="glass-card" style={{ padding: 32, border: '1px solid rgba(239, 68, 68, 0.3)', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.05), transparent)' }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--error)' }}>Wipe All Orders</h3>
          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 24 }}>
            Deletes all orders, order files, and delivery missions from the database. Shops and users will remain intact.
          </p>
          <TapButton className="btn btn-danger" onClick={() => { setTarget('orders'); setConfirmOpen(true); }}>
            Wipe Orders
          </TapButton>
        </motion.div>

        <motion.div whileHover={{ scale: 1.02 }} className="glass-card" style={{ padding: 32, border: '2px solid rgba(239, 68, 68, 0.5)', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), transparent)' }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--error)' }}>Factory Reset</h3>
          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 24 }}>
            Deletes EVERYTHING except your Super Admin account. Wipes all shops, users, orders, and files.
          </p>
          <TapButton className="btn btn-danger" onClick={() => { setTarget('all'); setConfirmOpen(true); }}>
            Wipe Everything
          </TapButton>
        </motion.div>
      </div>

      <ModalOverlay isOpen={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <div className="glass-card" style={{ padding: 32, border: '2px solid var(--error)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24, color: 'var(--error)' }}>
            <HiOutlineExclamationCircle size={64} style={{ margin: '0 auto' }} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, textAlign: 'center', marginBottom: 12 }}>Are you absolutely sure?</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 24 }}>
            This action cannot be undone. Type <strong>I AM SURE</strong> to confirm.
          </p>
          
          <input
            type="text"
            className="input"
            placeholder="Type 'I AM SURE' here"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && confirmText === 'I AM SURE' && !loading) {
                executeWipe();
              }
            }}
            style={{ width: '100%', marginBottom: 24, textAlign: 'center', fontWeight: 800 }}
          />

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmOpen(false)}>Cancel</button>
            <TapButton className="btn btn-danger" style={{ flex: 1 }} onClick={executeWipe} disabled={loading || confirmText !== 'I AM SURE'}>
              {loading ? 'Executing...' : 'Confirm Wipe'}
            </TapButton>
          </div>
        </div>
      </ModalOverlay>
    </div>
  );
}
