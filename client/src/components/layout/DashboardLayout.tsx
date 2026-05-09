'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/lib/store';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PulseDot, NotificationBadge } from '@/components/animations';
import api from '@/lib/api';
import {
  HiOutlineHome, HiOutlineDocumentText, HiOutlineCog, HiOutlineLogout,
  HiOutlineBell, HiOutlineMenu, HiOutlineX, HiOutlineChartBar,
  HiOutlineUserGroup, HiOutlineShoppingBag, HiOutlineTruck,
  HiOutlineCurrencyDollar, HiOutlineLocationMarker, HiOutlineQrcode,
  HiOutlineClock,
} from 'react-icons/hi';

interface NavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
}

const roleNavItems: Record<string, NavItem[]> = {
  student: [
    { href: '/student', icon: <HiOutlineHome size={20} />, label: 'Dashboard' },
    { href: '/student/new-order', icon: <HiOutlineDocumentText size={20} />, label: 'New Order' },
    { href: '/student/orders', icon: <HiOutlineShoppingBag size={20} />, label: 'My Orders' },
    { href: '/student/settings', icon: <HiOutlineCog size={20} />, label: 'Settings' },
  ],
  shop: [
    { href: '/shop', icon: <HiOutlineHome size={20} />, label: 'Dashboard' },
    { href: '/shop/queue', icon: <HiOutlineDocumentText size={20} />, label: 'Print Queue' },
    { href: '/shop/history', icon: <HiOutlineClock size={20} />, label: 'History' },
    { href: '/shop/wallet', icon: <HiOutlineCurrencyDollar size={20} />, label: 'Wallet' },
    { href: '/shop/settings', icon: <HiOutlineCog size={20} />, label: 'Settings' },
  ],
  agent: [
    { href: '/agent', icon: <HiOutlineHome size={20} />, label: 'Dashboard' },
    { href: '/agent/radar', icon: <HiOutlineLocationMarker size={20} />, label: 'Gig Radar' },
    { href: '/agent/missions', icon: <HiOutlineTruck size={20} />, label: 'Missions' },
    { href: '/agent/scanner', icon: <HiOutlineQrcode size={20} />, label: 'QR Scanner' },
    { href: '/agent/earnings', icon: <HiOutlineCurrencyDollar size={20} />, label: 'Earnings' },
    { href: '/agent/history', icon: <HiOutlineDocumentText size={20} />, label: 'History' },
    { href: '/agent/settings', icon: <HiOutlineCog size={20} />, label: 'Settings' },
  ],
  admin: [
    { href: '/admin', icon: <HiOutlineChartBar size={20} />, label: 'Analytics' },
    { href: '/admin/users', icon: <HiOutlineUserGroup size={20} />, label: 'Users' },
    { href: '/admin/shops', icon: <HiOutlineShoppingBag size={20} />, label: 'Shops' },
    { href: '/admin/orders', icon: <HiOutlineDocumentText size={20} />, label: 'Orders' },
    { href: '/admin/danger', icon: <HiOutlineCog size={20} />, label: 'Danger Zone' },
  ],
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loadUser, loading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [hoverNotifs, setHoverNotifs] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      const fetchNotifs = () => {
        api.get('/admin/notifications').then(({ data }) => {
          setNotifCount(data.unread || 0);
          setNotifications(data.notifications || []);
        }).catch(() => {});
      };
      fetchNotifs();
      const interval = setInterval(fetchNotifs, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  if (loading || !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-root)' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%' }}
        />
      </div>
    );
  }

  const navItems = roleNavItems[user.role] || [];
  const roleLabels: Record<string, string> = { student: '🎓 Student', shop: '🏪 Shop', agent: '🚴 Agent', admin: '⚡ Admin' };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-root)' }}>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ x: 0 }}
        style={{
          width: 260, flexShrink: 0, position: 'fixed', top: 0, bottom: 0, left: 0,
          background: 'var(--bg-primary)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', zIndex: 50,
          transform: sidebarOpen ? 'translateX(0)' : undefined,
        }}
        className={sidebarOpen ? '' : 'sidebar-desktop'}
      >
        {/* Logo */}
        <div style={{
          padding: '24px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link href={`/${user.role}`} style={{ textDecoration: 'none' }}>
            <span style={{
              fontSize: 20, fontWeight: 800,
              background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              CampusPrint
            </span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="btn btn-ghost btn-icon"
            style={{ display: 'none' }}>
            <HiOutlineX size={20} />
          </button>
        </div>

        {/* Role badge */}
        <div style={{ padding: '16px 20px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 8,
            background: 'var(--primary-glow)', fontSize: 13, fontWeight: 600,
            color: 'var(--primary-light)',
          }}>
            <PulseDot /> {roleLabels[user.role]}
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }} onClick={() => setSidebarOpen(false)}>
                <motion.div
                  whileHover={{ x: 4, backgroundColor: 'var(--bg-tertiary)' }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                    borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                    color: isActive ? 'var(--primary-light)' : 'var(--text-secondary)',
                    background: isActive ? 'var(--primary-glow)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                  }}
                >
                  {item.icon}
                  {item.label}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{user.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{user.email}</div>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleLogout}
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start', gap: 8, color: 'var(--error)', fontSize: 13 }}
          >
            <HiOutlineLogout size={18} /> Sign Out
          </motion.button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main style={{ flex: 1, marginLeft: 260, minHeight: '100vh' }}>
        {/* Top bar */}
        <motion.header
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          style={{
            position: 'sticky', top: 0, zIndex: 30,
            padding: '16px 24px',
            background: 'rgba(5, 5, 16, 0.8)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <button onClick={() => setSidebarOpen(true)} className="btn btn-ghost btn-icon"
            style={{ display: 'none' }}>
            <HiOutlineMenu size={22} />
          </button>
          <div />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}
               onMouseEnter={() => setHoverNotifs(true)}
               onMouseLeave={() => setHoverNotifs(false)}
          >
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="btn btn-ghost btn-icon"
              style={{ position: 'relative' }}
              onClick={() => router.push(`/${user.role}/notifications`)}
            >
              <HiOutlineBell size={20} />
              <NotificationBadge count={notifCount} />
            </motion.button>
            
            <AnimatePresence>
              {hoverNotifs && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  style={{
                    position: 'absolute', top: '100%', right: 0, width: 320,
                    background: 'var(--bg-card)', backdropFilter: 'blur(20px)',
                    border: '1px solid var(--border)', borderRadius: 12,
                    boxShadow: '0 10px 40px rgba(0,0,0,0.3)', overflow: 'hidden',
                    zIndex: 100
                  }}
                >
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ fontWeight: 600, fontSize: 14 }}>Notifications</h4>
                    {notifCount > 0 && <span style={{ fontSize: 12, color: 'var(--primary-light)' }}>{notifCount} new</span>}
                  </div>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {notifications.length > 0 ? notifications.slice(0, 5).map((n: any) => (
                      <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', background: n.is_read ? 'transparent' : 'var(--primary-glow)' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{n.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{n.message}</div>
                      </div>
                    )) : (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No notifications</div>
                    )}
                  </div>
                  <div 
                    onClick={() => router.push(`/${user.role}/notifications`)}
                    style={{ padding: '10px', textAlign: 'center', fontSize: 13, color: 'var(--primary-light)', cursor: 'pointer', background: 'var(--bg-tertiary)' }}
                  >
                    View All
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.header>

        {/* Page content */}
        <div style={{ padding: '24px' }}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </div>
      </main>

      <style jsx>{`
        @media (max-width: 768px) {
          .sidebar-desktop { transform: translateX(-100%) !important; }
          main { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}
