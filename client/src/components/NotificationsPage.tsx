'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineBell, HiOutlineCheck, HiOutlineTrash } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get('/admin/notifications');
      setNotifications(data.notifications || []);
    } catch (err) {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markAllRead = async () => {
    try {
      await api.patch('/admin/notifications/read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      toast.success('Marked all as read');
    } catch (err) {
      toast.error('Action failed');
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Notifications</h1>
          <p style={{ color: 'var(--text-tertiary)' }}>Stay updated with your order status and system alerts.</p>
        </div>
        <button className="btn btn-ghost" onClick={markAllRead} disabled={notifications.length === 0} style={{ color: 'var(--primary)', fontWeight: 600 }}>
          Mark all as read
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 16 }} />)}
        </div>
      ) : notifications.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AnimatePresence mode="popLayout">
            {notifications.map((n, i) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: i * 0.05 }}
                className="glass-card"
                style={{
                  padding: 24,
                  display: 'flex',
                  gap: 20,
                  background: n.is_read ? 'rgba(255,255,255,0.02)' : 'rgba(210, 41, 75, 0.05)',
                  border: n.is_read ? '1px solid var(--border)' : '1px solid rgba(210, 41, 75, 0.2)',
                }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: n.is_read ? 'var(--bg-tertiary)' : 'var(--primary-glow)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: n.is_read ? 'var(--text-secondary)' : 'var(--primary)',
                  flexShrink: 0
                }}>
                  <HiOutlineBell size={24} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700 }}>{n.title}</h3>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {new Date(n.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{n.message}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: 64, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <HiOutlineBell size={64} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
          <p style={{ fontSize: 18, fontWeight: 600 }}>All caught up!</p>
          <p style={{ fontSize: 14 }}>No new notifications to show.</p>
        </div>
      )}
    </div>
  );
}
