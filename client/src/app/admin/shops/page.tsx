'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { StaggerContainer, StaggerItem, HoverCard, TapButton } from '@/components/animations';

import { HiOutlineSearch, HiOutlineFilter, HiOutlineLockClosed, HiOutlineLockOpen, HiOutlineCheck } from 'react-icons/hi';

export default function AdminShopsPage() {
  const [shops, setShops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', search: '' });

  const loadShops = (background = false) => {
    if (!background) setLoading(true);
    // Note: We need a backend route that returns all shops. 
    // Let's assume /api/admin/users with role=shop is used or we use /api/shops and filter.
    // Actually, let's update the backend admin controller to provide a getShops for admin.
    api.get('/admin/users', { params: { role: 'shop', search: filters.search } })
      .then(({ data }) => {
          // We need shop details too, so maybe a better route.
          // For now let's stick to the pending route and add a 'all' mode if possible.
          // Or just fetch from /api/shops which returns approved ones.
          loadPendingAndApproved();
      });
  };

  const loadPendingAndApproved = async () => {
      try {
          const [pending, approved] = await Promise.all([
              api.get('/admin/shops/pending'),
              api.get('/shops')
          ]);
          let all = [...pending.data.shops.map((s:any) => ({...s, status: 'pending'})), 
                     ...approved.data.shops.map((s:any) => ({...s, status: 'approved'}))];
          
          if (filters.status === 'pending') all = all.filter(s => s.status === 'pending');
          if (filters.status === 'approved') all = all.filter(s => s.status === 'approved');
          
          setShops(all);
      } catch(e) {} finally { setLoading(false); }
  }

  useEffect(() => { 
    loadPendingAndApproved();
    const interval = setInterval(() => loadPendingAndApproved(), 10000);
    return () => clearInterval(interval);
  }, [filters]);

  const handleApproval = async (id: number, approved: boolean) => {
    try {
      await api.patch(`/admin/shops/${id}/approve`, { approved });
      toast.success(approved ? 'Shop approved' : 'Shop rejected');
      loadPendingAndApproved();
    } catch (err) {
      toast.error('Action failed');
    }
  };

  const toggleRestriction = async (id: number, isApproved: boolean) => {
      try {
          await api.patch(`/admin/shops/${id}/toggle-approval`);
          toast.success(isApproved ? 'Shop restricted' : 'Shop restored');
          loadPendingAndApproved();
      } catch (err) { toast.error('Failed to toggle shop status'); }
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Shop Management</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 24 }}>Review approvals and manage platform shops.</p>

      {/* Filters */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div className="input-group" style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Search Shop Name</label>
          <input className="input" placeholder="Search..." value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} />
        </div>
        <div className="input-group">
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Status</label>
          <select className="input" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
            <option value="">All Shops</option>
            <option value="pending">Pending Only</option>
            <option value="approved">Approved Only</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => loadPendingAndApproved()} style={{ height: 42 }}>
          <HiOutlineFilter /> Filter
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 140 }} />)}
        </div>
      ) : shops.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-state-icon">🏪</div>
          <h3>No shops found</h3>
          <p>Try adjusting your filters.</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {shops.map(shop => (
              <StaggerItem key={shop.id}>
                <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}>
                  <HoverCard className={`glass-card ${shop.status === 'pending' ? 'border-warning' : ''}`} style={{ padding: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                            <h3 style={{ fontSize: 18, fontWeight: 700 }}>{shop.shop_name}</h3>
                            <span className={`badge badge-${shop.status}`}>{shop.status}</span>
                        </div>
                        <p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>👤 {shop.owner_name} ({shop.owner_email || shop.email})</p>
                        {shop.location && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>📍 {shop.location}</p>}
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        {shop.status === 'pending' ? (
                            <>
                                <TapButton className="btn btn-danger btn-sm" onClick={() => handleApproval(shop.id, false)}>Reject</TapButton>
                                <TapButton className="btn btn-success btn-sm" onClick={() => handleApproval(shop.id, true)}>Approve</TapButton>
                            </>
                        ) : (
                            <TapButton 
                                className={`btn btn-sm ${shop.is_approved ? 'btn-danger' : 'btn-success'}`}
                                onClick={() => toggleRestriction(shop.id, shop.is_approved)}
                                style={{ gap: 6 }}
                            >
                                {shop.is_approved ? <><HiOutlineLockClosed /> Restrict</> : <><HiOutlineCheck /> Restore</>}
                            </TapButton>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-light)', fontSize: 13 }}>
                      <div><span style={{ color: 'var(--text-tertiary)' }}>B&W:</span> ₹{shop.price_bw}</div>
                      <div><span style={{ color: 'var(--text-tertiary)' }}>Color:</span> ₹{shop.price_color}</div>
                      <div><span style={{ color: 'var(--text-tertiary)' }}>Binding:</span> ₹{shop.price_binding}</div>
                    </div>
                  </HoverCard>
                </motion.div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </AnimatePresence>
      )}
    </div>
  );
}
