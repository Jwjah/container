'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { TapButton, PageTransition } from '@/components/animations';
import { HiOutlineUser, HiOutlineMail, HiOutlineLockClosed, HiOutlinePhone } from 'react-icons/hi';
import Logo from '@/components/ui/Logo';

const roles = [
  { value: 'student', label: '🎓 Student', desc: 'Print documents & get delivery' },
  { value: 'shop', label: '🏪 Shop Owner', desc: 'Manage print queue & revenue' },
  { value: 'agent', label: '🚴 Delivery Agent', desc: 'Deliver & earn per order' },
];

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'student', hostel: '', room_number: '' });
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/register', form);
      toast.success('Account created! Check your email for OTP.');
      setStep(3);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-otp', { email: form.email, code: otp });
      setAuth(data.user, data.token);
      toast.success('🎉 Welcome to CampusPrint!');
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
        <div style={{ width: '100%', maxWidth: 480 }}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ textAlign: 'center', marginBottom: 32 }}
          >
            <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', justifyContent: 'center' }}>
              <Logo size={44} />
            </Link>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 14, marginTop: 8 }}>
              {step === 1 && 'Choose your role to get started'}
              {step === 2 && 'Fill in your details'}
              {step === 3 && 'Verify your email address'}
            </p>
          </motion.div>

          {/* Progress bar */}
          <motion.div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
            {[1, 2, 3].map((s) => (
              <motion.div
                key={s}
                animate={{ background: s <= step ? 'var(--primary)' : 'var(--bg-tertiary)' }}
                style={{ flex: 1, height: 3, borderRadius: 999 }}
              />
            ))}
          </motion.div>

          <motion.div className="glass-card" style={{ padding: 32 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <AnimatePresence mode="wait">
              {/* Step 1: Role Selection */}
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {roles.map((r) => (
                    <motion.button
                      key={r.value}
                      whileHover={{ scale: 1.02, borderColor: 'var(--primary)' }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { setForm({ ...form, role: r.value }); setStep(2); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px',
                        background: form.role === r.value ? 'var(--primary-glow)' : 'var(--bg-tertiary)',
                        border: `1px solid ${form.role === r.value ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: 12, cursor: 'pointer', textAlign: 'left', width: '100%',
                        fontFamily: 'Inter', color: 'var(--text-primary)',
                      }}
                    >
                      <span style={{ fontSize: 28 }}>{r.label.split(' ')[0]}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{r.label.split(' ').slice(1).join(' ')}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>{r.desc}</div>
                      </div>
                    </motion.button>
                  ))}
                </motion.div>
              )}

              {/* Step 2: Form */}
              {step === 2 && (
                <motion.form key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="input-group">
                    <label>Full Name</label>
                    <div style={{ position: 'relative' }}>
                      <HiOutlineUser size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                      <input className="input" type="text" placeholder="John Doe" value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })} required style={{ paddingLeft: 42 }} id="reg-name" />
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Email Address</label>
                    <div style={{ position: 'relative' }}>
                      <HiOutlineMail size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                      <input className="input" type="email" placeholder="you@university.edu" value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })} required style={{ paddingLeft: 42 }} id="reg-email" />
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Password</label>
                    <div style={{ position: 'relative' }}>
                      <HiOutlineLockClosed size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                      <input className="input" type="password" placeholder="Min. 6 characters" value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} style={{ paddingLeft: 42 }} id="reg-password" />
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Phone (Optional)</label>
                    <div style={{ position: 'relative' }}>
                      <HiOutlinePhone size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                      <input className="input" type="tel" placeholder="+91 9876543210" value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ paddingLeft: 42 }} id="reg-phone" />
                    </div>
                  </div>

                  {form.role === 'student' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      style={{ display: 'flex', gap: 12 }}>
                      <div className="input-group" style={{ flex: 1 }}>
                        <label>Hostel</label>
                        <input className="input" type="text" placeholder="e.g. Barak" value={form.hostel}
                          onChange={(e) => setForm({ ...form, hostel: e.target.value })} id="reg-hostel" />
                      </div>
                      <div className="input-group" style={{ flex: 1 }}>
                        <label>Room No.</label>
                        <input className="input" type="text" placeholder="e.g. 204" value={form.room_number}
                          onChange={(e) => setForm({ ...form, room_number: e.target.value })} id="reg-room" />
                      </div>
                    </motion.div>
                  )}

                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} style={{ flex: 1 }}>
                      ← Back
                    </button>
                    <TapButton className="btn btn-primary" type="submit" disabled={loading} style={{ flex: 2 }}>
                      {loading ? 'Creating...' : 'Create Account'}
                    </TapButton>
                  </div>
                </motion.form>
              )}

              {/* Step 3: OTP */}
              {step === 3 && (
                <motion.form key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'center' }}>
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    style={{ fontSize: 48, marginBottom: 8 }}
                  >
                    📧
                  </motion.div>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                    We sent a 6-digit code to <strong style={{ color: 'var(--primary-light)' }}>{form.email}</strong>
                  </p>
                  <input
                    className="input"
                    type="text"
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    maxLength={6}
                    style={{ textAlign: 'center', fontSize: 28, letterSpacing: 10, fontWeight: 700 }}
                    id="reg-otp"
                  />
                  <TapButton className="btn btn-primary btn-lg" type="submit" disabled={loading || otp.length !== 6} style={{ width: '100%' }}>
                    {loading ? 'Verifying...' : 'Verify & Continue'}
                  </TapButton>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
            style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text-tertiary)' }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 600 }}>Sign in</Link>
          </motion.p>
        </div>
      </PageTransition>
    </div>
  );
}
