'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { StaggerContainer, StaggerItem, HoverCard, TapButton } from '@/components/animations';

import { HiOutlineSearch, HiOutlineFilter, HiOutlineLockClosed, HiOutlineLockOpen } from 'react-icons/hi';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ role: '', status: '', search: '' });

  const loadUsers = (background = false) => {
    if (!background) setLoading(true);
    api.get('/admin/users', { params: filters }).then(({ data }) => setUsers(data.users || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { 
    loadUsers();
    const interval = setInterval(() => loadUsers(true), 10000);
    return () => clearInterval(interval);
  }, []);

  const toggleUser = async (id: number, isSuspended: number) => {
    try {
      await api.patch(`/admin/users/${id}/suspend`);
      toast.success(isSuspended ? 'User restored' : 'User suspended');
      loadUsers();
    } catch (err) {
      toast.error('Action failed');
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Manage Users</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 32 }}>Suspend or restore platform access for users.</p>

      {/* Filters */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div className="input-group" style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Search Name/Email</label>
          <input className="input" placeholder="Search..." value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} />
        </div>
        <div className="input-group">
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Role</label>
          <select className="input" value={filters.role} onChange={e => setFilters({...filters, role: e.target.value})}>
            <option value="">All Roles</option>
            <option value="student">Student</option>
            <option value="shop">Shop Owner</option>
            <option value="agent">Agent</option>
          </select>
        </div>
        <div className="input-group">
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Status</label>
          <select className="input" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
            <option value="">All</option>
            <option value="active">Active Only</option>
            <option value="suspended">Suspended Only</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => loadUsers()} style={{ height: 42 }}>
          <HiOutlineFilter /> Filter
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
        </div>
      ) : (
        <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {users.map(user => (
            <StaggerItem key={user.id}>
              <HoverCard className={`glass-card ${user.is_suspended ? 'suspended' : ''}`} style={{ padding: '16px 24px', opacity: user.is_suspended ? 0.7 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div className="avatar" style={{ background: user.is_suspended ? 'var(--error)' : 'var(--primary-glow)' }}>
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {user.name}
                        {user.is_suspended && <span className="badge badge-cancelled">Suspended</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {user.email} · Role: <strong style={{ color: 'var(--text-secondary)' }}>{user.role}</strong>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        Joined: {new Date(user.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  {user.role !== 'admin' && (
                    <TapButton
                      className={`btn btn-sm ${user.is_suspended ? 'btn-success' : 'btn-danger'}`}
                      onClick={() => toggleUser(user.id, user.is_suspended)}
                      style={{ gap: 6 }}
                    >
                      {user.is_suspended ? <><HiOutlineLockOpen /> Restore</> : <><HiOutlineLockClosed /> Suspend</>}
                    </TapButton>
                  )}
                </div>
              </HoverCard>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}
    </div>
  );
}
