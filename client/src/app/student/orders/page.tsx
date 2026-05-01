'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { StaggerContainer, StaggerItem, HoverCard, ModalOverlay, TapButton } from '@/components/animations';
import QRScanner from '@/components/QRScanner';

const statusSteps = ['pending', 'confirmed', 'printing', 'ready', 'out_for_delivery', 'delivered'];
const statusLabels: Record<string, string> = {
  pending: '⏳ Pending', confirmed: '✅ Confirmed', printing: '🖨️ Printing',
  ready: '📦 Ready', out_for_delivery: '🚀 On the way', delivered: '🎉 Delivered', cancelled: '❌ Cancelled',
};
const statusColors: Record<string, string> = {
  pending: 'badge-pending', confirmed: 'badge-confirmed', printing: 'badge-printing',
  ready: 'badge-ready', out_for_delivery: 'badge-out_for_delivery', delivered: 'badge-delivered', cancelled: 'badge-cancelled',
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [scannerType, setScannerType] = useState<'shop' | 'agent' | null>(null);

  const loadOrders = (background = false) => {
    if (!background) setLoading(true);
    api.get('/orders').then(({ data }) => setOrders(data.orders || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(() => loadOrders(true), 3000);
    return () => clearInterval(interval);
  }, []);

  const activeStep = (status: string) => statusSteps.indexOf(status);

  const handleScanShopQR = async (rawText: string) => {
    let hash = rawText;
    try {
      const parsed = JSON.parse(rawText);
      hash = parsed.hash || rawText;
    } catch (e) {}

    const orderId = selected?.id;
    if (!orderId) {
      toast.error('No order selected.');
      return;
    }

    // Close scanner immediately so camera shuts down cleanly
    setScannerType(null);

    try {
      await api.post(`/orders/${orderId}/verify-pickup`, { hash });
      toast.success('Pickup verified! Order complete. 🎉');
      setSelected(null);
      loadOrders();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid QR code. Pickup failed.');
      // Re-open scanner so the student can try again
      setScannerType('shop');
    }
  };

  const handleScanAgentQR = async (rawText: string) => {
    let hash = rawText;
    try {
      const parsed = JSON.parse(rawText);
      hash = parsed.hash || rawText;
    } catch (e) {}

    const orderId = selected?.id;
    if (!orderId) {
      toast.error('No order selected.');
      return;
    }

    // Close scanner immediately so camera shuts down cleanly
    setScannerType(null);

    try {
      await api.post(`/orders/${orderId}/verify-delivery`, { hash });
      toast.success('Delivery verified! Enjoy your prints. 🎉');
      setSelected(null);
      loadOrders();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid QR code. Verification failed.');
      // Re-open scanner so student can try again
      setScannerType('agent');
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>My Orders</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 15, marginBottom: 32 }}>Track all your print orders in one place.</p>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 100 }} />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-state-icon">📋</div>
          <h3>No orders found</h3>
          <p>Your print orders will appear here.</p>
        </div>
      ) : (
        <StaggerContainer style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map((order) => (
            <StaggerItem key={order.id}>
              <HoverCard>
                <motion.div
                  className="glass-card"
                  style={{ padding: 20, cursor: 'pointer' }}
                  onClick={() => setSelected(order)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>#{order.order_hash?.substring(0, 8)?.toUpperCase()}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-tertiary)', marginLeft: 12 }}>{order.shop_name}</span>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{new Date(order.created_at).toLocaleString()}</div>
                    </div>
                    <span className={`badge ${statusColors[order.status]}`}>{statusLabels[order.status]}</span>
                  </div>

                  {/* Progress tracker */}
                  {order.status !== 'cancelled' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {statusSteps.map((s, i) => (
                        <div key={s} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <motion.div
                            animate={{
                              background: i <= activeStep(order.status) ? 'var(--primary)' : 'var(--bg-tertiary)',
                              scale: i === activeStep(order.status) ? 1.3 : 1,
                            }}
                            style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }}
                          />
                          {i < statusSteps.length - 1 && (
                            <motion.div
                              animate={{ background: i < activeStep(order.status) ? 'var(--primary)' : 'var(--bg-tertiary)' }}
                              style={{ flex: 1, height: 2, borderRadius: 999 }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 13, color: 'var(--text-tertiary)' }}>
                    <span>{order.total_pages} pages · {order.copies} copy · {order.print_type === 'color' ? 'Color' : 'B&W'}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>₹{parseFloat(order.total_price || 0).toFixed(0)}</span>
                  </div>
                </motion.div>
              </HoverCard>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}

      {/* Order Detail Modal */}
      <ModalOverlay isOpen={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div className="glass-card" style={{ padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>Order Details</h2>
              <span className={`badge ${statusColors[selected.status]}`}>{statusLabels[selected.status]}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 14 }}>
              <div><span style={{ color: 'var(--text-tertiary)' }}>ID:</span> #{selected.order_hash?.substring(0, 8)?.toUpperCase()}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Date:</span> {new Date(selected.created_at).toLocaleString()}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Shop:</span> {selected.shop_name}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Pages:</span> {selected.total_pages}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Copies:</span> {selected.copies}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Type:</span> {selected.print_type === 'color' ? 'Color' : 'B&W'}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Layout:</span> {selected.layout === 'double' ? 'Double' : 'Single'}-sided</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Delivery:</span> {selected.delivery_type === 'hostel' ? 'Hostel' : 'Pickup'}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Total:</span> <strong>₹{parseFloat(selected.total_price || 0).toFixed(0)}</strong></div>
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
                          <div style={{ fontSize: 13, fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{file.pages} pages · {(file.size / 1024 / 1024).toFixed(2)} MB</div>
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
                            toast.error('Failed to download file');
                          }
                        }}
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected.status === 'ready' && selected.delivery_type === 'pickup' && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>You are at the shop? Scan their QR to collect:</p>
                <TapButton className="btn btn-primary btn-lg" style={{ width: '100%', background: 'var(--success)' }} onClick={() => setScannerType('shop')}>
                  📷 Scan Shop QR
                </TapButton>
              </div>
            )}

            {selected.status === 'out_for_delivery' && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Agent is here? Scan their QR to verify delivery:</p>
                <TapButton className="btn btn-primary btn-lg" style={{ width: '100%', background: 'var(--success)' }} onClick={() => setScannerType('agent')}>
                  📷 Scan Agent QR
                </TapButton>
              </div>
            )}

            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 24 }} onClick={() => setSelected(null)}>Close</button>
          </div>
        )}
      </ModalOverlay>
      {/* QR Scanner Modal */}
      {scannerType === 'shop' && (
        <QRScanner
          title="Scan Shop QR"
          description="Point your camera at the QR code displayed on the shop's screen."
          onClose={() => setScannerType(null)}
          onScan={handleScanShopQR}
        />
      )}
      
      {scannerType === 'agent' && (
        <QRScanner
          title="Scan Agent QR"
          description="Point your camera at the QR code displayed on the delivery agent's screen."
          onClose={() => setScannerType(null)}
          onScan={handleScanAgentQR}
        />
      )}

    </div>
  );
}
