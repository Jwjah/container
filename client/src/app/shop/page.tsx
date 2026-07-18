'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { StaggerContainer, StaggerItem, HoverCard, PulseDot } from '@/components/animations';
import toast from 'react-hot-toast';
import { HiOutlineShoppingBag, HiOutlineCurrencyDollar, HiOutlineClock, HiOutlinePrinter, HiOutlineCheckCircle } from 'react-icons/hi';

export default function ShopDashboard() {
  const [shop, setShop] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const loadData = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const { data: shopData } = await api.get('/shops/my');
      setShop(shopData.shop);
      if (shopData.shop?.id) {
        const { data: statsData } = await api.get(`/shops/${shopData.shop.id}/stats`);
        setStats(statsData.stats);
      }
    } catch (err: any) {
      if (err.response?.status === 404) setShop(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    loadData();
    const interval = setInterval(() => loadData(true), 3000);
    return () => clearInterval(interval);
  }, []);

  const toggleShop = async () => {
    setToggling(true);
    try {
      const { data } = await api.patch('/shops/toggle');
      setShop({ ...shop, is_open: data.is_open });
      toast.success(data.message);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Toggle failed');
    } finally {
      setToggling(false);
    }
  };

  // Shop registration form
  const [regForm, setRegForm] = useState({ shop_name: '', description: '', location: '', price_bw: '2', price_color: '5', price_binding: '30', price_stick_file: '10' });
  const [registering, setRegistering] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    try {
      await api.post('/shops', regForm);
      toast.success('Shop registered! Awaiting admin approval.');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 120 }} />)}
      </div>
    );
  }

  if (!shop) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Register Your Shop</h1>
        <p style={{ color: 'var(--text-tertiary)', marginBottom: 32 }}>Set up your print shop to start accepting orders.</p>

        <form onSubmit={handleRegister} className="glass-card" style={{ padding: 32, maxWidth: 560 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="input-group">
              <label>Shop Name *</label>
              <input className="input" type="text" placeholder="e.g. QuickPrint NIT" value={regForm.shop_name}
                onChange={(e) => setRegForm({ ...regForm, shop_name: e.target.value })} required id="shop-name" />
            </div>
            <div className="input-group">
              <label>Location</label>
              <input className="input" type="text" placeholder="e.g. Near Main Gate" value={regForm.location}
                onChange={(e) => setRegForm({ ...regForm, location: e.target.value })} id="shop-location" />
            </div>
            <div className="input-group">
              <label>Description</label>
              <textarea className="input" placeholder="Tell students about your shop..." value={regForm.description}
                onChange={(e) => setRegForm({ ...regForm, description: e.target.value })} rows={3} id="shop-desc" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label>B&W (₹)</label>
                <input className="input" type="number" step="0.5" value={regForm.price_bw}
                  onChange={(e) => setRegForm({ ...regForm, price_bw: e.target.value })} id="shop-bw" />
              </div>
              <div className="input-group">
                <label>Color (₹)</label>
                <input className="input" type="number" step="0.5" value={regForm.price_color}
                  onChange={(e) => setRegForm({ ...regForm, price_color: e.target.value })} id="shop-color" />
              </div>
              <div className="input-group">
                <label>Spiral (₹)</label>
                <input className="input" type="number" step="1" value={regForm.price_binding}
                  onChange={(e) => setRegForm({ ...regForm, price_binding: e.target.value })} id="shop-binding" />
              </div>
              <div className="input-group">
                <label>Stick (₹)</label>
                <input className="input" type="number" step="1" value={regForm.price_stick_file}
                  onChange={(e) => setRegForm({ ...regForm, price_stick_file: e.target.value })} id="shop-stick" />
              </div>
            </div>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} className="btn btn-primary btn-lg" type="submit" disabled={registering}>
              {registering ? 'Registering...' : '🏪 Register Shop'}
            </motion.button>
          </div>
        </form>
      </motion.div>
    );
  }

  if (!shop.is_approved) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card empty-state">
        <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }} style={{ fontSize: 64, marginBottom: 16 }}>⏳</motion.div>
        <h3>Awaiting Admin Approval</h3>
        <p>Your shop &ldquo;{shop.shop_name}&rdquo; is under review. You&apos;ll be notified when approved.</p>
      </motion.div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>{shop.shop_name}</h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <PulseDot color={shop.is_open ? 'var(--success)' : 'var(--error)'} />
            {shop.is_open ? 'Currently Open' : 'Currently Closed'}
          </p>
        </div>
        <motion.div
          className={`toggle ${shop.is_open ? 'active' : ''}`}
          onClick={toggleShop}
          whileTap={{ scale: 0.9 }}
          style={{ cursor: toggling ? 'wait' : 'pointer', opacity: toggling ? 0.6 : 1 }}
        />
      </div>

      <StaggerContainer className="grid-4" style={{ marginBottom: 32 }}>
        {[
          { label: 'Total Orders', value: stats?.total || 0, icon: <HiOutlineShoppingBag size={22} />, color: 'var(--primary-light)' },
          { label: 'Pending', value: stats?.pending || 0, icon: <HiOutlineClock size={22} />, color: 'var(--warning)' },
          { label: 'Printing', value: stats?.printing || 0, icon: <HiOutlinePrinter size={22} />, color: 'var(--info)' },
          { label: 'Revenue', value: `₹${(stats?.revenue || 0).toFixed(0)}`, icon: <HiOutlineCurrencyDollar size={22} />, color: 'var(--success)' },
        ].map((s, i) => (
          <StaggerItem key={i}>
            <HoverCard className="glass-card stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span className="stat-label">{s.label}</span>
                <span style={{ color: s.color }}>{s.icon}</span>
              </div>
              <div className="stat-value">{s.value}</div>
            </HoverCard>
          </StaggerItem>
        ))}
      </StaggerContainer>

      <div className="glass-card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>💰 Wallet Balance</h3>
        <div style={{ fontSize: 36, fontWeight: 800, background: 'linear-gradient(135deg, var(--success), #16a34a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ₹{parseFloat(shop.wallet_balance || 0).toFixed(2)}
        </div>
      </div>
    </div>
  );
}
