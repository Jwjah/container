'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { StaggerContainer, StaggerItem, HoverCard } from '@/components/animations';
import { HiOutlinePrinter, HiOutlineClock, HiOutlineCheckCircle, HiOutlinePlusCircle } from 'react-icons/hi';

export default function StudentDashboard() {
  const { user } = useAuthStore();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = (background = false) => {
    if (!background) setLoading(true);
    api.get('/orders').then(({ data }) => {
      setOrders(data.orders || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(() => loadOrders(true), 3000);
    return () => clearInterval(interval);
  }, []);

  const active = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const completed = orders.filter(o => o.status === 'delivered').length;
  const totalSpent = orders.filter(o => o.status === 'delivered').reduce((s, o) => s + parseFloat(o.total_price || 0), 0);

  const statusColors: Record<string, string> = {
    pending: 'badge-pending', confirmed: 'badge-confirmed', printing: 'badge-printing',
    ready: 'badge-ready', out_for_delivery: 'badge-out_for_delivery',
    delivered: 'badge-delivered', cancelled: 'badge-cancelled',
  };

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
          Welcome back, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>Here&apos;s your printing activity at a glance.</p>
      </motion.div>

      {/* Stats */}
      <StaggerContainer className="grid-3" style={{ marginBottom: 32 }}>
        {[
          { label: 'Active Orders', value: active.length, icon: <HiOutlineClock size={24} />, color: 'var(--warning)' },
          { label: 'Completed', value: completed, icon: <HiOutlineCheckCircle size={24} />, color: 'var(--success)' },
          { label: 'Total Spent', value: `₹${totalSpent.toFixed(0)}`, icon: <HiOutlinePrinter size={24} />, color: 'var(--primary-light)' },
        ].map((stat, i) => (
          <StaggerItem key={i}>
            <HoverCard className="glass-card stat-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span className="stat-label">{stat.label}</span>
                <div style={{ color: stat.color }}>{stat.icon}</div>
              </div>
              <div className="stat-value">{stat.value}</div>
            </HoverCard>
          </StaggerItem>
        ))}
      </StaggerContainer>

      {/* Quick Action */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} style={{ marginBottom: 32 }}>
        <Link href="/student/new-order" style={{ textDecoration: 'none' }}>
          <motion.div
            whileHover={{ scale: 1.01, boxShadow: '0 0 40px rgba(99,102,241,0.2)' }}
            whileTap={{ scale: 0.99 }}
            className="glass-card"
            style={{
              padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(167,139,250,0.05))',
              border: '1px solid rgba(99,102,241,0.2)',
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'var(--primary)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: 'white',
            }}>
              <HiOutlinePlusCircle size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>New Print Order</div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>Upload files, choose a shop, and customize your print</div>
            </div>
          </motion.div>
        </Link>
      </motion.div>

      {/* Recent Orders */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Recent Orders</h2>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton skeleton-card" style={{ height: 80 }} />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="glass-card empty-state">
            <div className="empty-state-icon">📄</div>
            <h3>No orders yet</h3>
            <p>Place your first print order to get started!</p>
          </div>
        ) : (
          <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {orders.slice(0, 5).map((order) => (
              <StaggerItem key={order.id}>
                <Link href={`/student/orders`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <HoverCard className="glass-card" style={{ padding: '16px 20px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 10,
                          background: 'var(--primary-glow)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          color: 'var(--primary-light)', fontSize: 18,
                        }}>
                          🖨️
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            #{order.order_id || order.order_hash?.substring(0, 8)?.toUpperCase()}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                            {order.shop_name || 'Shop'} · {order.total_pages} pages · ₹{parseFloat(order.total_price || 0).toFixed(0)}
                          </div>
                        </div>
                      </div>
                      <span className={`badge ${statusColors[order.status] || ''}`}>
                        {order.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </HoverCard>
                </Link>
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}
      </motion.div>
    </div>
  );
}
