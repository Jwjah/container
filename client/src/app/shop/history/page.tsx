'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { StaggerContainer, StaggerItem, ModalOverlay } from '@/components/animations';
import { HiOutlineSearch, HiOutlineFilter, HiOutlineDownload, HiOutlineCalendar } from 'react-icons/hi';

export default function ShopHistoryPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', startDate: '', endDate: '', search: '' });
  const [selected, setSelected] = useState<any>(null);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/orders', { params: filters });
      setOrders(data.orders || []);
    } catch (err) {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleApplyFilters = () => {
    loadOrders();
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Order History</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 24 }}>Complete log of all past and processed orders.</p>

      {/* Filters Bar */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
        <div className="input-group" style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>Search Hash/Student</label>
          <div style={{ position: 'relative' }}>
            <HiOutlineSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input 
              className="input" 
              style={{ paddingLeft: 36 }} 
              placeholder="Search..." 
              value={filters.search} 
              onChange={e => setFilters({...filters, search: e.target.value})}
            />
          </div>
        </div>
        <div className="input-group">
          <label style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>Status</label>
          <select className="input" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
            <option value="">All Status</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="ready">Ready</option>
          </select>
        </div>
        <div className="input-group">
          <label style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>From</label>
          <input className="input" type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} />
        </div>
        <div className="input-group">
          <label style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>To</label>
          <input className="input" type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} />
        </div>
        <button className="btn btn-primary" onClick={handleApplyFilters} style={{ height: 42 }}>
          <HiOutlineFilter /> Apply
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="glass-card empty-state">No orders match your filters.</div>
      ) : (
        <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map((order) => (
            <StaggerItem key={order.id}>
              <motion.div 
                className="glass-card" 
                style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setSelected(order)}
                whileHover={{ scale: 1.01, backgroundColor: 'rgba(255,255,255,0.02)' }}
              >
                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>#{order.order_hash?.substring(0, 8)?.toUpperCase()}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      {new Date(order.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{order.student_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{order.total_pages} pages · ₹{parseFloat(order.total_price).toFixed(0)}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`badge badge-${order.status}`}>{order.status}</span>
                </div>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}

      {/* Detail Modal */}
      <ModalOverlay isOpen={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div className="glass-card" style={{ padding: 32, maxWidth: 600, width: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>Order Details</h2>
              <span className={`badge badge-${selected.status}`}>{selected.status}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, fontSize: 14, marginBottom: 24 }}>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Order ID:</span> #{selected.order_hash?.toUpperCase()}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Date:</span> {new Date(selected.created_at).toLocaleString()}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Student:</span> {selected.student_name}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Location:</span> {selected.hostel} {selected.room_number}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Print Type:</span> {selected.print_type.toUpperCase()}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Pages:</span> {selected.total_pages} x {selected.copies} copies</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Total Price:</span> <strong>₹{parseFloat(selected.total_price).toFixed(2)}</strong></div>
            </div>

            {selected.notes && (
              <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, marginBottom: 24 }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>Student Notes:</div>
                <div style={{ fontSize: 14 }}>{selected.notes}</div>
              </div>
            )}

            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Attached Files</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selected.files?.map((file: any) => (
                <div key={file.id} className="glass-card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 24 }}>📄</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{file.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{file.pages} pages</div>
                    </div>
                  </div>
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      try {
                        const response = await api.get(`/orders/files/${file.id}/download`, { responseType: 'blob' });
                        const url = window.URL.createObjectURL(new Blob([response.data]));
                        const link = document.createElement('a');
                        link.href = url;
                        link.setAttribute('download', file.name);
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                      } catch (err) {
                        toast.error('Download failed');
                      }
                    }}
                  >
                    <HiOutlineDownload /> Download
                  </button>
                </div>
              ))}
            </div>

            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 32 }} onClick={() => setSelected(null)}>Close</button>
          </div>
        )}
      </ModalOverlay>
    </div>
  );
}
