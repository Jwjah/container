'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { TapButton } from '@/components/animations';

export default function ShopSettingsPage() {
  const [shop, setShop] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<string>('default');

  useEffect(() => {
    api.get('/shops/my').then(({ data }) => setShop(data.shop)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Push notifications are not supported on this browser/device.');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        window.dispatchEvent(new Event('subscribe-push'));
        toast.success('Successfully subscribed to notifications!');
      } else if (result === 'denied') {
        toast.error('Notification permission denied. Enable it in browser settings.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to request permission.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/shops/${shop.id}`, shop);
      toast.success('Settings saved successfully');
    } catch (err) { toast.error('Failed to save settings'); } finally { setSaving(false); }
  };

  if (loading) return <div className="skeleton" style={{ height: 400 }} />;
  if (!shop) return <div className="empty-state">No shop found</div>;

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Shop Settings</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 32 }}>Update your shop details and pricing.</p>

      <form onSubmit={handleSave} className="glass-card" style={{ padding: 32 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Basic Info</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
          <div className="input-group">
            <label>Shop Name</label>
            <input className="input" value={shop.shop_name} onChange={e => setShop({...shop, shop_name: e.target.value})} required />
          </div>
          <div className="input-group">
            <label>Location</label>
            <input className="input" value={shop.location || ''} onChange={e => setShop({...shop, location: e.target.value})} />
          </div>
          <div className="input-group">
            <label>Description</label>
            <textarea className="input" value={shop.description || ''} onChange={e => setShop({...shop, description: e.target.value})} rows={3} />
          </div>
        </div>

        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Pricing</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          <div className="input-group">
            <label>B&W (₹/page)</label>
            <input className="input" type="number" step="0.5" value={shop.price_bw} onChange={e => setShop({...shop, price_bw: e.target.value})} required />
          </div>
          <div className="input-group">
            <label>Color (₹/page)</label>
            <input className="input" type="number" step="0.5" value={shop.price_color} onChange={e => setShop({...shop, price_color: e.target.value})} required />
          </div>
          <div className="input-group">
            <label>Binding (₹)</label>
            <input className="input" type="number" step="1" value={shop.price_binding} onChange={e => setShop({...shop, price_binding: e.target.value})} required />
          </div>
        </div>

        <TapButton className="btn btn-primary btn-lg" type="submit" disabled={saving} style={{ width: '100%' }}>
          {saving ? 'Saving...' : 'Save Settings'}
        </TapButton>
      </form>

      {/* Push Notifications Settings Card */}
      <div className="glass-card" style={{ marginTop: 24, padding: 32 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          🔔 System Notifications
        </h3>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 20, lineHeight: 1.4 }}>
          Receive instant push notifications for new print orders, order updates, and wallet transactions even when the application is closed.
        </p>

        {permission === 'granted' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#22c55e', fontSize: 14, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
            Push notifications are active and registered.
          </div>
        ) : permission === 'denied' ? (
          <div style={{ color: '#ef4444', fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
            ⚠️ Notification permission is blocked in your browser settings. Please reset the site permissions in your browser address bar to enable notifications.
          </div>
        ) : (
          <TapButton
            className="btn btn-outline"
            onClick={requestNotificationPermission}
            type="button"
            style={{
              padding: '10px 16px',
              borderColor: 'var(--primary)',
              color: 'var(--primary)',
              background: 'transparent',
              fontSize: 13,
              fontWeight: 600,
              width: 'fit-content',
            }}
          >
            Enable Push Notifications
          </TapButton>
        )}
      </div>
    </div>
  );
}
