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

  useEffect(() => {
    api.get('/shops/my').then(({ data }) => setShop(data.shop)).catch(() => {}).finally(() => setLoading(false));
  }, []);

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
    </div>
  );
}
