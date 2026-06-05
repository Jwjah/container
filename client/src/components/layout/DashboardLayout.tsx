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
    { href: '/student/notifications', icon: <HiOutlineBell size={20} />, label: 'Notifications' },
    { href: '/student/settings', icon: <HiOutlineCog size={20} />, label: 'Settings' },
  ],
  shop: [
    { href: '/shop', icon: <HiOutlineHome size={20} />, label: 'Dashboard' },
    { href: '/shop/queue', icon: <HiOutlineDocumentText size={20} />, label: 'Print Queue' },
    { href: '/shop/history', icon: <HiOutlineClock size={20} />, label: 'History' },
    { href: '/shop/wallet', icon: <HiOutlineCurrencyDollar size={20} />, label: 'Wallet' },
    { href: '/shop/notifications', icon: <HiOutlineBell size={20} />, label: 'Notifications' },
    { href: '/shop/settings', icon: <HiOutlineCog size={20} />, label: 'Settings' },
  ],
  agent: [
    { href: '/agent', icon: <HiOutlineHome size={20} />, label: 'Dashboard' },
    { href: '/agent/radar', icon: <HiOutlineLocationMarker size={20} />, label: 'Gig Radar' },
    { href: '/agent/missions', icon: <HiOutlineTruck size={20} />, label: 'Missions' },
    { href: '/agent/history', icon: <HiOutlineClock size={20} />, label: 'History' },
    { href: '/agent/scanner', icon: <HiOutlineQrcode size={20} />, label: 'QR Scanner' },
    { href: '/agent/earnings', icon: <HiOutlineCurrencyDollar size={20} />, label: 'Earnings' },
    { href: '/agent/notifications', icon: <HiOutlineBell size={20} />, label: 'Notifications' },
    { href: '/agent/settings', icon: <HiOutlineCog size={20} />, label: 'Settings' },
  ],
  admin: [
    { href: '/admin', icon: <HiOutlineChartBar size={20} />, label: 'Analytics' },
    { href: '/admin/users', icon: <HiOutlineUserGroup size={20} />, label: 'Users' },
    { href: '/admin/shops', icon: <HiOutlineShoppingBag size={20} />, label: 'Shops' },
    { href: '/admin/orders', icon: <HiOutlineDocumentText size={20} />, label: 'Orders' },
    { href: '/admin/notifications', icon: <HiOutlineBell size={20} />, label: 'Notifications' },
    { href: '/admin/danger', icon: <HiOutlineCog size={20} />, label: 'Danger Zone' },
  ],
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loadUser, loading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    setIsMobile(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

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
          setNotifCount(data.unread);
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
        animate={{ x: isMobile ? (sidebarOpen ? 0 : -260) : 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        style={{
          width: 260, flexShrink: 0, position: 'fixed', top: 0, bottom: 0, left: 0,
          background: 'var(--bg-primary)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', zIndex: 50,
        }}
      >
        {/* Logo */}
        <div style={{
          padding: 'calc(24px + env(safe-area-inset-top, 0px)) 20px 24px 20px', borderBottom: '1px solid var(--border)',
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
          <button onClick={() => setSidebarOpen(false)} className="btn btn-ghost btn-icon mobile-only"
            style={{ padding: 4 }}>
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
      <main style={{ flex: 1, marginLeft: isMobile ? 0 : 260, minHeight: '100vh', transition: 'margin-left 0.3s ease' }}>
        {/* Top bar */}
        <motion.header
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          style={{
            position: 'sticky', top: 0, zIndex: 30,
            padding: 'calc(16px + env(safe-area-inset-top, 0px)) 24px 16px 24px',
            background: 'rgba(5, 5, 16, 0.8)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <button onClick={() => setSidebarOpen(true)} className="btn btn-ghost btn-icon mobile-only"
            style={{ padding: 4, marginRight: 12 }}>
            <HiOutlineMenu size={22} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div 
              style={{ position: 'relative' }}
              onMouseEnter={() => setShowNotifDropdown(true)}
              onMouseLeave={() => setShowNotifDropdown(false)}
            >
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="btn btn-ghost btn-icon"
                onClick={() => router.push(`/${user.role}/notifications`)}
              >
                <HiOutlineBell size={20} />
                <NotificationBadge count={notifCount} />
              </motion.button>
              
              <AnimatePresence>
                {showNotifDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    style={{
                      position: 'absolute', right: 0, top: '100%', width: '300px',
                      background: 'rgba(5, 5, 16, 0.95)', backdropFilter: 'blur(10px)',
                      border: '1px solid var(--border)', borderRadius: '12px',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.5)', padding: '12px', zIndex: 100,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>Notifications</span>
                      <span style={{ fontSize: '12px', color: 'var(--primary)', cursor: 'pointer' }} onClick={() => router.push(`/${user.role}/notifications`)}>View All</span>
                    </div>
                    {notifications.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                        {notifications.slice(0, 5).map((n: any) => (
                          <div key={n.id} style={{ padding: '8px', background: n.is_read ? 'transparent' : 'rgba(210, 41, 75, 0.1)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{n.title}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{n.message}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-tertiary)' }}>No recent notifications</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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
        @media (min-width: 769px) {
          .mobile-only { display: none !important; }
        }
      `}</style>
    </div>
  );
}
