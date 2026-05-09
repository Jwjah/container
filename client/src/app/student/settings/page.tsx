'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { TapButton } from '@/components/animations';

export default function StudentSettingsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/auth/me').then(({ data }) => setProfile(data.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/auth/me', profile);
      toast.success('Profile updated successfully');
    } catch (err) { toast.error('Failed to update profile'); } finally { setSaving(false); }
  };

  if (loading) return <div className="skeleton" style={{ height: 400 }} />;
  if (!profile) return <div className="empty-state">No profile found</div>;

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Profile Settings</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 32 }}>Update your delivery details and personal info.</p>

      <form onSubmit={handleSave} className="glass-card" style={{ padding: 32 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Personal Info</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
          <div className="input-group">
            <label>Name</label>
            <input className="input" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} required />
          </div>
          <div className="input-group">
            <label>Phone Number</label>
            <input className="input" value={profile.phone || ''} onChange={e => setProfile({...profile, phone: e.target.value})} />
          </div>
        </div>

        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Hostel Delivery Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          <div className="input-group">
            <label>Hostel Name / Block</label>
            <input className="input" value={profile.hostel || ''} onChange={e => setProfile({...profile, hostel: e.target.value})} />
          </div>
          <div className="input-group">
            <label>Room Number</label>
            <input className="input" value={profile.room_number || ''} onChange={e => setProfile({...profile, room_number: e.target.value})} />
          </div>
        </div>

        <TapButton className="btn btn-primary btn-lg" type="submit" disabled={saving} style={{ width: '100%' }}>
          {saving ? 'Saving...' : 'Save Settings'}
        </TapButton>
      </form>
    </div>
  );
}
