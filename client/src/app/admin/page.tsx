'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import api from '@/lib/api';
import { StaggerContainer, StaggerItem, HoverCard } from '@/components/animations';
import { HiOutlineUsers, HiOutlineShoppingBag, HiOutlineDocumentText, HiOutlineCurrencyDollar } from 'react-icons/hi';

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = (background = false) => {
    if (!background) setLoading(true);
    api.get('/admin/stats')
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(() => loadStats(true), 3000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 120 }} />)}
      </div>
    );
  }

  if (!data) return <div className="empty-state">Failed to load data</div>;

  const { stats, revenueByDay, ordersByStatus, topShops } = data;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card" style={{ padding: '12px 16px', background: 'rgba(15,15,35,0.9)' }}>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 4 }}>{label}</p>
          <p style={{ color: 'var(--primary-light)', fontWeight: 700 }}>₹{payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Admin Overview ⚡</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>Real-time platform analytics and metrics.</p>
      </motion.div>

      <StaggerContainer className="grid-4" style={{ marginBottom: 32 }}>
        {[
          { label: 'Total Users', value: stats.totalUsers, icon: <HiOutlineUsers size={24} />, color: 'var(--info)' },
          { label: 'Active Shops', value: stats.totalShops, icon: <HiOutlineShoppingBag size={24} />, color: 'var(--accent)' },
          { label: 'Total Orders', value: stats.totalOrders, icon: <HiOutlineDocumentText size={24} />, color: 'var(--warning)' },
          { label: 'Total Revenue', value: `₹${stats.totalRevenue.toFixed(0)}`, icon: <HiOutlineCurrencyDollar size={24} />, color: 'var(--success)' },
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24, marginBottom: 32 }}>
        {/* Revenue Chart */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="glass-card"
          style={{ padding: 24 }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24 }}>Revenue (Last 30 Days)</h3>
          <div style={{ height: 300 }}>
            {revenueByDay?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueByDay}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">No revenue data yet</div>
            )}
          </div>
        </motion.div>

        {/* Orders Status Chart */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="glass-card"
          style={{ padding: 24 }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24 }}>Orders by Status</h3>
          <div style={{ height: 300 }}>
            {ordersByStatus?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ordersByStatus} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="status" type="category" stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'var(--bg-tertiary)' }} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Bar dataKey="count" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">No order data yet</div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Top Shops */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Top Performing Shops</h3>
        <StaggerContainer style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {topShops?.length > 0 ? topShops.map((shop: any, i: number) => (
            <StaggerItem key={i}>
              <HoverCard className="glass-card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--text-secondary)' }}>
                  #{i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{shop.shop_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{shop.total_orders} orders completed</div>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--success)' }}>
                  ₹{parseFloat(shop.wallet_balance || 0).toFixed(0)}
                </div>
              </HoverCard>
            </StaggerItem>
          )) : <div className="glass-card empty-state" style={{ gridColumn: '1/-1' }}>No shops available</div>}
        </StaggerContainer>
      </motion.div>
    </div>
  );
}
