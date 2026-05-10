'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { StaggerContainer, StaggerItem, TapButton, ModalOverlay } from '@/components/animations';

const statusFlow = ['pending', 'confirmed', 'printing', 'ready', 'delivered'];
const nextStatus: Record<string, string> = { pending: 'confirmed', confirmed: 'printing', printing: 'ready', ready: 'delivered' };
const statusLabels: Record<string, string> = {
  pending: '⏳ Pending', confirmed: '✅ Confirmed', printing: '🖨️ Printing', ready: '📦 Ready', delivered: '🎉 Done',
};
const statusColors: Record<string, string> = {
  pending: 'badge-pending', confirmed: 'badge-confirmed', printing: 'badge-printing', ready: 'badge-ready', delivered: 'badge-delivered',
};

export default function QueuePage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [qrModalOrder, setQrModalOrder] = useState<any>(null);

  const loadOrders = (background = false) => {
    if (!background) setLoading(true);
    api.get('/orders').then(({ data }) => setOrders(data.orders || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadOrders(); const i = setInterval(() => loadOrders(true), 3000); return () => clearInterval(i); }, []);

  const updateStatus = async (orderId: number, status: string) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status });
      toast.success(`Order → ${statusLabels[status]}`);
      loadOrders();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
  };

  const filteredOrders = orders.filter(o => o.status === tab);
  const counts = statusFlow.reduce((acc, s) => ({ ...acc, [s]: orders.filter(o => o.status === s).length }), {} as Record<string, number>);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Print Queue</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 24 }}>Manage incoming print orders in real-time.</p>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 24 }}>
        {statusFlow.slice(0, 4).map(s => (
          <motion.button
            key={s}
            whileTap={{ scale: 0.95 }}
            className={`tab ${tab === s ? 'active' : ''}`}
            onClick={() => setTab(s)}
          >
            {statusLabels[s]} {counts[s] > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>({counts[s]})</span>}
          </motion.button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 120 }} />)}
        </div>
      ) : filteredOrders.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card empty-state">
          <div className="empty-state-icon">{tab === 'pending' ? '📭' : '🎉'}</div>
          <h3>No {tab} orders</h3>
          <p>{tab === 'pending' ? 'New orders will appear here.' : `All ${tab} orders have been processed.`}</p>
        </motion.div>
      ) : (
        <AnimatePresence mode="popLayout">
          <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredOrders.map((order) => (
              <StaggerItem key={order.id}>
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, x: 100 }}
                  className="glass-card"
                  style={{ padding: 20 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>
                        #{order.order_hash?.substring(0, 8)?.toUpperCase()}
                        <span className={`badge ${statusColors[order.status]}`} style={{ marginLeft: 12 }}>{statusLabels[order.status]}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        {new Date(order.created_at).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        👤 {order.student_name} · {order.hostel && `🏠 ${order.hostel}`} {order.room_number && `#${order.room_number}`}
                      </div>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>₹{parseFloat(order.total_price || 0).toFixed(0)}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                    <span>📄 {order.total_pages} pages</span>
                    <span>📋 {order.copies} copies</span>
                    <span>{order.print_type === 'color' ? '🌈 Color' : '⬛ B&W'}</span>
                    <span>{order.layout === 'double' ? '📖 Double' : '📃 Single'}</span>
                    {order.binding ? <span>📚 Binding</span> : null}
                    <span>{order.delivery_type === 'hostel' ? '🚀 Delivery' : '🏪 Pickup'}</span>
                  </div>

                  {order.notes && (
                    <div style={{ fontSize: 13, color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '8px 12px', borderRadius: 8, marginBottom: 16 }}>
                      💬 {order.notes}
                    </div>
                  )}

                  {/* Files for Shop */}
                  {order.files && order.files.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {order.files.map((file: any) => (
                          <div key={file.id} className="glass-card" style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 16 }}>📄</span>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{file.pages} pages</div>
                              </div>
                            </div>
                            <button 
                              className="btn btn-secondary btn-sm" 
                              style={{ padding: '4px 10px', fontSize: 11 }}
                              onClick={async () => {
                                try {
                                  const { data } = await api.get(`/orders/files/${file.id}/download`);
                                  window.open(data.url, '_blank');
                                } catch (err) {
                                  toast.error('Failed to open file');
                                }
                              }}
                            >
                              View / Download
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {order.status === 'pending' && (
                      <TapButton className="btn btn-danger btn-sm" onClick={() => updateStatus(order.id, 'cancelled')}>
                        ✕ Reject
                      </TapButton>
                    )}
                    {order.status === 'ready' && (
                      <TapButton className="btn btn-secondary btn-sm" onClick={() => setQrModalOrder(order)}>
                        📱 View QR
                      </TapButton>
                    )}
                    {nextStatus[order.status] && order.status !== 'ready' && (
                      <TapButton className="btn btn-primary btn-sm" onClick={() => updateStatus(order.id, nextStatus[order.status])}>
                        → {statusLabels[nextStatus[order.status]]}
                      </TapButton>
                    )}
                  </div>
                </motion.div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </AnimatePresence>
      )}

      {/* QR Display Modal for Shop */}
      <ModalOverlay isOpen={!!qrModalOrder} onClose={() => setQrModalOrder(null)}>
        {qrModalOrder && (
          <div className="glass-card" style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, background: 'var(--success-light)', color: 'var(--success)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 32 }}>
              ✅
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Print Ready!</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 14, marginBottom: 24 }}>
              Show this QR code to the student to complete the handover.
            </p>
            <div className="qr-container" style={{ background: '#fff', padding: 16, borderRadius: 16, display: 'inline-block', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              <img src={qrModalOrder.pickup_qr} alt="Pickup QR" style={{ width: 200, height: 200 }} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 32 }} onClick={() => setQrModalOrder(null)}>
              Close View
            </button>
          </div>
        )}
      </ModalOverlay>
    </div>
  );
}
