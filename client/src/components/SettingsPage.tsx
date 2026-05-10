'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/store';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { TapButton } from '@/components/animations';
import { HiOutlineUser, HiOutlinePhone, HiOutlineMail, HiOutlineHome } from 'react-icons/hi';

export default function SettingsPage() {
  const { user, loadUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    hostel: user?.hostel || '',
    room_number: user?.room_number || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.patch('/users/profile', formData);
      await loadUser();
      toast.success('Profile updated successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Account Settings</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 32 }}>Manage your profile information and preferences.</p>

      <form onSubmit={handleSubmit} className="glass-card" style={{ padding: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <HiOutlineUser size={16} /> Full Name
            </label>
            <input
              className="input"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <HiOutlineMail size={16} /> Email Address
            </label>
            <input className="input" value={user.email} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Email cannot be changed.</p>
          </div>

          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <HiOutlinePhone size={16} /> Phone Number
            </label>
            <input
              className="input"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
              placeholder="e.g. +91 9876543210"
            />
          </div>

          {(user.role === 'student' || user.role === 'agent') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="input-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <HiOutlineHome size={16} /> {user.role === 'student' ? 'Hostel' : 'Base Location'}
                </label>
                <input
                  className="input"
                  value={formData.hostel}
                  onChange={e => setFormData({ ...formData, hostel: e.target.value })}
                  placeholder={user.role === 'student' ? 'Hostel Name' : 'e.g. Hostel 1'}
                />
              </div>
              <div className="input-group">
                <label>{user.role === 'student' ? 'Room Number' : 'Reference'}</label>
                <input
                  className="input"
                  value={formData.room_number}
                  onChange={e => setFormData({ ...formData, room_number: e.target.value })}
                  placeholder={user.role === 'student' ? 'Room No.' : 'e.g. Block A'}
                />
              </div>
            </div>
          )}
        </div>

        <TapButton className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Saving Changes...' : 'Update Profile'}
        </TapButton>
      </form>
    </div>
  );
}
