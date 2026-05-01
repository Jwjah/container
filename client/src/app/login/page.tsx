'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { TapButton, PageTransition } from '@/components/animations';
import { HiOutlineMail, HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const { setAuth } = useAuthStore();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (data.requiresOTP) {
        setOtpMode(true);
        toast.success('OTP sent to your email');
      } else {
        setAuth(data.user, data.token);
        toast.success(`Welcome back, ${data.user.name}!`);
        const routes: Record<string, string> = { student: '/student', shop: '/shop', agent: '/agent', admin: '/admin' };
        router.push(routes[data.user.role] || '/student');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-otp', { email, code: otp });
      setAuth(data.user, data.token);
      toast.success('Verified! Welcome.');
      const routes: Record<string, string> = { student: '/student', shop: '/shop', agent: '/agent', admin: '/admin' };
      router.push(routes[data.user.role] || '/student');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrapper" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <PageTransition>
        <div style={{ width: '100%', maxWidth: 440 }}>
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            style={{ textAlign: 'center', marginBottom: 40 }}
          >
            <Link href="/" style={{ textDecoration: 'none' }}>
              <span style={{
                fontSize: 28, fontWeight: 900,
                background: 'linear-gradient(135deg, #6366f1, #a78bfa, #ec4899)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                CampusPrint
              </span>
            </Link>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 14, marginTop: 8 }}>
              {otpMode ? 'Enter the OTP sent to your email' : 'Welcome back! Sign in to continue.'}
            </p>
          </motion.div>

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="glass-card"
            style={{ padding: 32 }}
          >
            <AnimatePresence mode="wait">
              {!otpMode ? (
                <motion.form
                  key="login"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  onSubmit={handleLogin}
                  style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
                >
                  <div className="input-group">
                    <label>Email Address</label>
                    <div style={{ position: 'relative' }}>
                      <HiOutlineMail size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                      <input
                        className="input"
                        type="email"
                        placeholder="you@university.edu"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        style={{ paddingLeft: 42 }}
                        id="login-email"
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Password</label>
                    <div style={{ position: 'relative' }}>
                      <HiOutlineLockClosed size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                      <input
                        className="input"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        style={{ paddingLeft: 42, paddingRight: 42 }}
                        id="login-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)',
                        }}
                      >
                        {showPassword ? <HiOutlineEyeOff size={18} /> : <HiOutlineEye size={18} />}
                      </button>
                    </div>
                  </div>

                  <TapButton className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ width: '100%', marginTop: 4 }}>
                    {loading ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} />
                    ) : 'Sign In'}
                  </TapButton>
                </motion.form>
              ) : (
                <motion.form
                  key="otp"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onSubmit={handleOTP}
                  style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
                >
                  <div style={{
                    textAlign: 'center', padding: '16px', borderRadius: 12,
                    background: 'var(--primary-glow)', border: '1px solid rgba(99,102,241,0.2)',
                    fontSize: 13, color: 'var(--text-secondary)',
                  }}>
                    📧 OTP sent to <strong style={{ color: 'var(--primary-light)' }}>{email}</strong>
                  </div>

                  <div className="input-group">
                    <label>6-Digit OTP</label>
                    <input
                      className="input"
                      type="text"
                      placeholder="000000"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      maxLength={6}
                      style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: 700 }}
                      id="login-otp"
                    />
                  </div>

                  <TapButton className="btn btn-primary btn-lg" type="submit" disabled={loading || otp.length !== 6} style={{ width: '100%' }}>
                    {loading ? 'Verifying...' : 'Verify OTP'}
                  </TapButton>

                  <button
                    type="button"
                    onClick={() => setOtpMode(false)}
                    className="btn btn-ghost"
                    style={{ width: '100%' }}
                  >
                    ← Back to Login
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Register link */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text-tertiary)' }}
          >
            Don&apos;t have an account?{' '}
            <Link href="/register" style={{ color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 600 }}>
              Create one
            </Link>
          </motion.p>
        </div>
      </PageTransition>
    </div>
  );
}
