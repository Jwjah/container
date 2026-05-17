'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { HiOutlinePrinter, HiOutlineLightningBolt, HiOutlineShieldCheck, HiOutlineTruck } from 'react-icons/hi';

const features = [
  { icon: <HiOutlinePrinter size={28} />, title: 'Smart Printing', desc: 'Upload PDFs, choose B&W or color, single or double-sided. Auto page detection.' },
  { icon: <HiOutlineLightningBolt size={28} />, title: 'Live Tracking', desc: 'Real-time order status from printing to delivery. Never wonder again.' },
  { icon: <HiOutlineShieldCheck size={28} />, title: 'QR Verified', desc: 'Secure QR handovers ensure your prints reach the right person.' },
  { icon: <HiOutlineTruck size={28} />, title: 'Hostel Delivery', desc: 'Get prints delivered right to your hostel room by verified agents.' },
];

export default function LandingPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (user) {
      const routes: Record<string, string> = { student: '/student', shop: '/shop', agent: '/agent', admin: '/admin' };
      router.replace(routes[user.role] || '/student');
    }
  }, [user, router]);

  if (!mounted) return null;

  return (
    <div className="page-wrapper" style={{ minHeight: '100vh' }}>
      {/* Navbar */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          padding: '16px 24px',
          background: 'rgba(5, 5, 16, 0.8)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <motion.div
            whileHover={{ scale: 1.05 }}
            style={{
              fontSize: 22, fontWeight: 800,
              background: 'linear-gradient(135deg, #6366f1, #a78bfa, #ec4899)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}
          >
            CampusPrint
          </motion.div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link href="/login">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="btn btn-ghost">
                Log In
              </motion.button>
            </Link>
            <Link href="/register">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="btn btn-primary">
                Get Started
              </motion.button>
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* Hero */}
      <section style={{ paddingTop: 160, paddingBottom: 100, textAlign: 'center' }}>
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              style={{
                display: 'inline-flex', padding: '6px 16px', borderRadius: 999,
                background: 'var(--primary-glow)', border: '1px solid rgba(99,102,241,0.2)',
                fontSize: 13, color: 'var(--primary-light)', fontWeight: 600, marginBottom: 24,
                letterSpacing: '0.05em', textTransform: 'uppercase',
              }}
            >
              ⚡ Now with Ultra-Fast Local Agent Support
            </motion.div>

            <h1 style={{
              fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 900, lineHeight: 1.1,
              marginBottom: 24,
              background: 'linear-gradient(135deg, #ffffff 0%, #a5b4fc 50%, #6366f1 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em',
            }}>
              Instant Print Queue.<br />Zero Lines. Absolute Speed.
            </h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              style={{
                fontSize: 18, color: 'var(--text-secondary)', maxWidth: 580,
                margin: '0 auto 40px', lineHeight: 1.7,
              }}
            >
              The next-generation campus printing ecosystem. Send PDFs straight from your phone, 
              our smart desktop print-agent handles the queue, and you pick up instantly—or get it delivered.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}
            >
              <Link href="/register">
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: '0 8px 40px rgba(99,102,241,0.5)' }}
                  whileTap={{ scale: 0.95 }}
                  className="btn btn-primary btn-lg"
                  style={{ fontSize: 16 }}
                >
                  Start Printing →
                </motion.button>
              </Link>
              <Link href="/login">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="btn btn-secondary btn-lg"
                >
                  Shop Owner? Log In
                </motion.button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '80px 0' }}>
        <div className="container">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}
          >
            {features.map((f, i) => (
              <motion.div
                key={i}
                variants={{
                  hidden: { opacity: 0, y: 30, scale: 0.95 },
                  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
                }}
                whileHover={{ y: -4, boxShadow: '0 0 40px rgba(99,102,241,0.12)' }}
                className="glass-card"
                style={{ padding: 32, cursor: 'default' }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 12,
                  background: 'var(--primary-glow)', border: '1px solid rgba(99,102,241,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--primary-light)', marginBottom: 20,
                }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Roles Section */}
      <section style={{ padding: '80px 0', borderTop: '1px solid var(--border)' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ fontSize: 32, fontWeight: 800, marginBottom: 12 }}
          >
            Built for Everyone
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            style={{ color: 'var(--text-tertiary)', marginBottom: 48, fontSize: 16 }}
          >
            Whether you&apos;re printing, managing orders, or delivering — we&apos;ve got you.
          </motion.p>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.15 } } }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}
          >
            {[
              { emoji: '🎓', role: 'Student', desc: 'Upload & print documents, track orders in real-time' },
              { emoji: '🏪', role: 'Shop Owner', desc: 'Manage live print queue, set pricing, track revenue' },
              { emoji: '🚴', role: 'Delivery Agent', desc: 'Accept gigs, scan QR codes, earn per delivery' },
              { emoji: '⚡', role: 'Admin', desc: 'Analytics dashboard, approve shops, manage platform' },
            ].map((r, i) => (
              <motion.div
                key={i}
                variants={{
                  hidden: { opacity: 0, scale: 0.9 },
                  visible: { opacity: 1, scale: 1 },
                }}
                whileHover={{ scale: 1.03, borderColor: 'var(--primary)' }}
                className="glass-card"
                style={{ padding: 32, textAlign: 'center', cursor: 'default' }}
              >
                <div style={{ fontSize: 40, marginBottom: 16 }}>{r.emoji}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{r.role}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{r.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '40px 24px', borderTop: '1px solid var(--border)',
        textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
      }}>
        <p>© 2024 CampusPrint. Built with ❤️ for campus communities.</p>
      </footer>
    </div>
  );
}
