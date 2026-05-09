'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = () => {
    api.get('/admin/notifications').then(({ data }) => {
      setNotifications(data.notifications || []);
      // Mark all as read
      if (data.unread > 0) {
        api.patch('/admin/notifications/read').catch(() => {});
      }
    }).catch(() => toast.error('Failed to load notifications')).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  if (loading) {
    return (
      <div style={{ maxWidth: 800 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Notifications</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Notifications</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 24 }}>Stay updated with your orders and activities.</p>

      {notifications.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-state-icon">🔔</div>
          <h3>All caught up!</h3>
          <p>You have no notifications at the moment.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <AnimatePresence>
            {notifications.map((n) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card"
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  borderLeft: n.is_read ? '4px solid transparent' : '4px solid var(--primary)',
                  background: n.is_read ? 'var(--bg-card)' : 'var(--primary-glow)',
                }}
              >
                <div style={{ fontSize: 24, marginTop: 4 }}>
                  {n.type === 'order' ? '📦' : n.type === 'system' ? '⚙️' : '🔔'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{n.title}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>{n.message}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{new Date(n.created_at).toLocaleString()}</div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
