'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { StaggerContainer, StaggerItem, HoverCard, ModalOverlay } from '@/components/animations';
import toast from 'react-hot-toast';

import { HiOutlineSearch, HiOutlineFilter, HiOutlineTrash } from 'react-icons/hi';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [filters, setFilters] = useState({ status: '', search: '', startDate: '', endDate: '' });

  const loadOrders = (background = false) => {
    if (!background) setLoading(true);
    api.get('/admin/orders', { params: filters }).then(({ data }) => setOrders(data.orders || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(() => loadOrders(true), 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCancelOrder = async (id: number) => {
    if (!window.confirm('Are you absolutely sure you want to CANCEL this order?')) return;
    try {
      await api.patch(`/admin/orders/${id}/cancel`);
      toast.success('Order cancelled by Super Admin');
      loadOrders();
      setSelected(null);
    } catch (err) {
      toast.error('Failed to cancel order');
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Global Orders List</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 24 }}>Manage and monitor every order on the platform.</p>

      {/* Admin Filters */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div className="input-group" style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Search Student/Hash</label>
          <input className="input" placeholder="Search..." value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} />
        </div>
        <div className="input-group">
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Status</label>
          <select className="input" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="printing">Printing</option>
            <option value="ready">Ready</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="input-group">
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>From</label>
          <input className="input" type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} />
        </div>
        <button className="btn btn-primary" onClick={() => loadOrders()} style={{ height: 42 }}>
          <HiOutlineFilter /> Filter
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}</div>
      ) : orders.length === 0 ? (
        <div className="glass-card empty-state">No orders match filters.</div>
      ) : (
        <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map(order => (
            <StaggerItem key={order.id}>
              <HoverCard 
                className="glass-card" 
                style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setSelected(order)}
              >
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                      #{order.order_hash?.substring(0, 8)?.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {new Date(order.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {order.student_name} → {order.shop_name}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>₹{parseFloat(order.total_price || 0).toFixed(0)}</div>
                  <span className={`badge badge-${order.status}`} style={{ marginTop: 8 }}>{order.status}</span>
                </div>
              </HoverCard>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}

      {/* Admin Order Detail Modal */}
      <ModalOverlay isOpen={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div className="glass-card" style={{ padding: 32, maxWidth: 500, width: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>Super Admin: Order Control</h2>
              <span className={`badge badge-${selected.status}`}>{selected.status}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 14, marginBottom: 24 }}>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Date:</span> {new Date(selected.created_at).toLocaleString()}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Student:</span> {selected.student_name}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Shop:</span> {selected.shop_name}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Total:</span> <strong>₹{parseFloat(selected.total_price || 0).toFixed(0)}</strong></div>
            </div>

            {/* Admin Controls */}
            <div style={{ padding: 16, background: 'rgba(239, 68, 68, 0.05)', borderRadius: 12, border: '1px solid rgba(239, 68, 68, 0.1)', marginBottom: 24 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--error)', marginBottom: 12 }}>⚡ Dangerous Actions</h4>
              <button 
                className="btn btn-danger" 
                style={{ width: '100%', gap: 8 }}
                onClick={() => handleCancelOrder(selected.id)}
                disabled={selected.status === 'cancelled'}
              >
                <HiOutlineTrash /> {selected.status === 'cancelled' ? 'Already Cancelled' : 'Force Cancel Order'}
              </button>
            </div>

            {/* Files Section */}
            {selected.files && selected.files.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Attachments</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selected.files.map((file: any) => (
                    <div key={file.id} className="glass-card" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 20 }}>📄</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{file.pages} pages</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const { data } = await api.get(`/orders/files/${file.id}/download`);
                              window.open(data.url, '_blank');
                            } catch (err) {
                              toast.error('Failed to download file');
                            }
                          }}
                        >
                          Download
                        </button>
                        {file.name.toLowerCase().endsWith('.pdf') && (
                          <button 
                            className="btn btn-outline btn-sm" 
                            style={{ padding: '4px 10px', fontSize: 11, borderColor: 'var(--primary)', color: 'var(--primary)' }}
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const token = localStorage.getItem('token') || '';
                                const apiBase = api.defaults.baseURL || '';
                                const printPdfUrl = `${apiBase}/orders/files/${file.id}/print-pdf?token=${token}`;
                                window.open(printPdfUrl, '_blank');
                              } catch (err) {
                                toast.error('Failed to open print PDF');
                              }
                            }}
                          >
                            Print PDF
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 24 }} onClick={() => setSelected(null)}>Close</button>
          </div>
        )}
      </ModalOverlay>
    </div>
  );
}
