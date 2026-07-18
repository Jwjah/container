'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { TapButton, StaggerContainer, StaggerItem, HoverCard, PageTransition } from '@/components/animations';
import { HiOutlineCloudUpload, HiOutlineX, HiOutlineDocument, HiOutlinePhotograph, HiOutlinePencilAlt } from 'react-icons/hi';
import dynamic from 'next/dynamic';

const StirlingEditor = dynamic(() => import('@/components/StirlingEditor'), { ssr: false });
const ImageEditor = dynamic(() => import('@/components/ImageEditor'), { ssr: false });

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function NewOrderPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [shops, setShops] = useState<any[]>([]);
  const [selectedShop, setSelectedShop] = useState<number | null>(null);
  const [config, setConfig] = useState({
    print_type: 'bw', layout: 'single', copies: 1, binding: false,
    paper: 'A4', orientation: 'portrait', pages_per_sheet: '1', binding_type: 'none',
    delivery_type: 'pickup', hostel_address: '', notes: '',
  });
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [editingFileIndex, setEditingFileIndex] = useState<number | null>(null);
  const [agreedToDisclaimer, setAgreedToDisclaimer] = useState(false);

  const loadShops = () => {
    api.get('/shops').then(({ data }) => setShops(data.shops || [])).catch(() => {});
  };

  useEffect(() => {
    loadShops();
    const interval = setInterval(loadShops, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...droppedFiles]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };
  const handleSubmit = async () => {
    if (!selectedShop || files.length === 0) {
      toast.error('Select a shop and upload files');
      return;
    }
    if (config.delivery_type === 'hostel') {
      if (!config.hostel_address || config.hostel_address.trim() === '') {
        toast.error('Hostel delivery address is required');
        return;
      }
      if (!agreedToDisclaimer) {
        toast.error('You must agree to the delivery disclaimer warning');
        return;
      }
    }
    setLoading(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast.error('Failed to load payment gateway SDK');
        setLoading(false);
        return;
      }

      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      formData.append('shop_id', String(selectedShop));
      
      const finalConfig = { ...config };
      finalConfig.binding = config.binding_type !== 'none';
      finalConfig.notes = `[Format: ${config.paper}, ${config.orientation}, ${config.pages_per_sheet} pg/sheet, Binding: ${config.binding_type}]\n${config.notes}`.trim();
      
      Object.entries(finalConfig).forEach(([k, v]) => formData.append(k, String(v)));

      const { data } = await api.post('/orders', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const order = data.order;
      toast.success(`Order placed! Total: ₹${order.totalPrice}. Initiating payment...`);

      const idempotencyKey = `idemp-${order.id}-${Date.now()}`;
      const paymentResponse = await api.post('/payments', {
        orderId: order.id,
        paymentMethod: 'UPI',
        gateway: 'RAZORPAY',
        idempotencyKey
      });

      const { checkoutPayload, payment } = paymentResponse.data;

      const options = {
        ...checkoutPayload,
        handler: async (response: any) => {
          setLoading(true);
          try {
            await api.post('/payments/verify', {
              paymentUuid: payment.uuid,
              gatewayPaymentId: response.razorpay_payment_id,
              gatewayOrderId: response.razorpay_order_id,
              signature: response.razorpay_signature
            });
            toast.success('Payment successful and verified! 🎉');
            router.push('/student/orders');
          } catch (err: any) {
            toast.error(err.response?.data?.error || 'Payment verification failed');
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            toast.error('Payment cancelled');
            router.push('/student/orders');
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Order placement or payment initiation failed');
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>New Print Order</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 15, marginBottom: 32 }}>Upload your files and customize your print job.</p>

      {/* Progress steps */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        {['Upload Files', 'Select Shop', 'Customize'].map((label, i) => (
          <motion.div
            key={i}
            animate={{
              background: step > i + 1 ? 'var(--success)' : step === i + 1 ? 'var(--primary)' : 'var(--bg-tertiary)',
            }}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 8, textAlign: 'center',
              fontSize: 13, fontWeight: 600, color: step >= i + 1 ? 'white' : 'var(--text-tertiary)',
              cursor: 'pointer',
            }}
            onClick={() => { if (i + 1 <= step || (i + 1 === 2 && files.length > 0) || (i + 1 === 3 && selectedShop)) setStep(i + 1); }}
          >
            {label}
          </motion.div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="upload" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            <motion.div
              onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
              animate={{
                borderColor: dragActive ? 'var(--primary)' : 'var(--border-light)',
                background: dragActive ? 'var(--primary-glow)' : 'var(--bg-card)',
                scale: dragActive ? 1.01 : 1,
              }}
              transition={{ duration: 0.2 }}
              className="glass-card"
              style={{ padding: '48px 24px', textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--border-light)', borderRadius: 16 }}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <motion.div animate={{ y: dragActive ? -8 : 0 }} transition={{ type: 'spring', stiffness: 300 }}>
                <HiOutlineCloudUpload size={48} style={{ color: 'var(--primary-light)', marginBottom: 16 }} />
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{dragActive ? 'Drop files here!' : 'Drag & Drop Files'}</h3>
                <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>PDF, DOCX, or images up to 50MB each</p>
              </motion.div>
              <input id="file-input" type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" onChange={handleFileInput} style={{ display: 'none' }} />
            </motion.div>

            <AnimatePresence>
              {files.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {files.map((file, i) => (
                    <motion.div
                      key={`${file.name}-${i}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20, height: 0 }}
                      transition={{ delay: i * 0.05 }} className="glass-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {file.type.includes('pdf') ? <HiOutlineDocument size={20} style={{ color: 'var(--error)' }} /> : <HiOutlinePhotograph size={20} style={{ color: 'var(--info)' }} />}
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{file.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{formatSize(file.size)}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(file.type.includes('pdf') || file.type.includes('image')) && (
                          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setEditingFileIndex(i)} className="btn btn-ghost btn-icon" style={{ color: 'var(--primary)', padding: 4 }}>
                            <HiOutlinePencilAlt size={18} />
                          </motion.button>
                        )}
                        <motion.button whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.8 }} onClick={() => removeFile(i)} className="btn btn-ghost btn-icon" style={{ color: 'var(--error)', padding: 4 }}>
                          <HiOutlineX size={18} />
                        </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <TapButton className="btn btn-primary btn-lg" onClick={() => files.length > 0 ? setStep(2) : toast.error('Upload at least one file')} disabled={files.length === 0}>
                Next: Select Shop →
              </TapButton>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="shops" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <StaggerContainer style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {shops.map((shop) => (
                <StaggerItem key={shop.id}>
                  <motion.div
                    whileHover={shop.is_open ? { scale: 1.02 } : {}} whileTap={shop.is_open ? { scale: 0.98 } : {}}
                    onClick={() => shop.is_open ? setSelectedShop(shop.id) : toast.error('Shop closed')}
                    className="glass-card" style={{ padding: 24, cursor: shop.is_open ? 'pointer' : 'not-allowed', opacity: shop.is_open ? 1 : 0.6, border: selectedShop === shop.id ? '2px solid var(--primary)' : '1px solid var(--border)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700 }}>{shop.shop_name}</h3>
                      <span className={`badge ${shop.is_open ? 'badge-delivered' : 'badge-cancelled'}`}>{shop.is_open ? '● Open' : '● Closed'}</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>📍 {shop.location}</p>
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                      <span>B&W: ₹{shop.price_bw}</span><span>Color: ₹{shop.price_color}</span><span>⭐ {shop.rating || 'New'}</span>
                    </div>
                  </motion.div>
                </StaggerItem>
              ))}
            </StaggerContainer>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
              <TapButton className="btn btn-secondary" onClick={() => setStep(1)}>← Back</TapButton>
              <TapButton className="btn btn-primary btn-lg" onClick={() => selectedShop ? setStep(3) : toast.error('Select a shop')} disabled={!selectedShop}>Next: Customize →</TapButton>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="config" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {/* ... config content (shortened for brevity but keep original logic) ... */}
            <div className="glass-card" style={{ padding: 32 }}>
               {/* Keep existing config inputs */}
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
                  <div className="input-group">
                    <label>Color Format</label>
                    <select className="input" value={config.print_type} onChange={(e) => setConfig({ ...config, print_type: e.target.value })}>
                      <option value="bw">⬛ Black & White</option>
                      <option value="color">🌈 Color</option>
                    </select>
                  </div>
                  <div className="input-group"><label>Sides</label><select className="input" value={config.layout} onChange={(e) => setConfig({ ...config, layout: e.target.value })}><option value="single">Single-sided</option><option value="double">Double-sided</option></select></div>
                  <div className="input-group"><label>Paper Size</label><select className="input" value={config.paper} onChange={(e) => setConfig({ ...config, paper: e.target.value })}><option value="A4">A4 (Standard)</option><option value="legal">Legal</option></select></div>
                  <div className="input-group"><label>Orientation</label><select className="input" value={config.orientation} onChange={(e) => setConfig({ ...config, orientation: e.target.value })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></div>
                  <div className="input-group"><label>Pages per Sheet</label><select className="input" value={config.pages_per_sheet} onChange={(e) => setConfig({ ...config, pages_per_sheet: e.target.value })}><option value="1">1 Page / Sheet</option><option value="2">2 Pages / Sheet</option><option value="4">4 Pages / Sheet</option></select></div>
                  <div className="input-group"><label>Binding Option</label><select className="input" value={config.binding_type} onChange={(e) => setConfig({ ...config, binding_type: e.target.value })}><option value="none">None</option><option value="staple">Staple</option><option value="spiral">Spiral Binding (+₹30)</option><option value="stick">Stick File (+₹10)</option></select></div>
                  <div className="input-group"><label>Copies</label><input className="input" type="number" min={1} value={config.copies} onChange={(e) => setConfig({ ...config, copies: parseInt(e.target.value) || 1 })} /></div>
                  <div className="input-group"><label>Delivery Preference</label><select className="input" value={config.delivery_type} onChange={(e) => setConfig({ ...config, delivery_type: e.target.value })}><option value="pickup">🏪 Pickup</option><option value="hostel">🏠 Hostel Delivery (+₹15)</option></select></div>
                  
                  {config.delivery_type === 'hostel' && (
                    <div className="input-group" style={{ gridColumn: 'span 2' }}>
                      <label>Hostel Delivery Address *</label>
                      <input 
                        className="input" 
                        type="text" 
                        placeholder="e.g. Hostel A, Room 101" 
                        value={config.hostel_address} 
                        onChange={e => setConfig({ ...config, hostel_address: e.target.value })} 
                        required 
                      />
                    </div>
                  )}
                </div>
                
                {config.delivery_type === 'hostel' && (
                  <div className="glass-card" style={{ padding: 16, border: '1px solid rgba(245, 158, 11, 0.3)', background: 'rgba(245, 158, 11, 0.05)', borderRadius: 8, marginTop: 20 }}>
                    <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>⚠️ Delivery Availability Disclaimer</div>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                      Delivery is subject to the availability of delivery partners. If no delivery partner accepts your order, you may be requested to switch to Self Pickup from the selected print shop. CampusPrint facilitates delivery but cannot guarantee delivery availability at all times.
                    </p>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
                      <input type="checkbox" checked={agreedToDisclaimer} onChange={e => setAgreedToDisclaimer(e.target.checked)} style={{ width: 16, height: 16 }} />
                      I understand and agree.
                    </label>
                  </div>
                )}
            </div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
              <TapButton className="btn btn-secondary" onClick={() => setStep(2)}>← Back</TapButton>
              <TapButton 
                className="btn btn-primary btn-lg" 
                onClick={handleSubmit} 
                disabled={loading || (config.delivery_type === 'hostel' && !agreedToDisclaimer)}
              >
                {loading ? 'Placing...' : '🖨️ Place Order'}
              </TapButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingFileIndex !== null && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
            {files[editingFileIndex].type.includes('pdf') ? (
              <StirlingEditor
                file={files[editingFileIndex]}
                onClose={() => setEditingFileIndex(null)}
                onSave={(newFile) => {
                  setFiles(prev => {
                    const newFiles = [...prev];
                    newFiles[editingFileIndex] = newFile;
                    return newFiles;
                  });
                  setEditingFileIndex(null);
                }}
              />
            ) : (
              <ImageEditor
                file={files[editingFileIndex]}
                onClose={() => setEditingFileIndex(null)}
                onSave={(newFile) => {
                  setFiles(prev => {
                    const newFiles = [...prev];
                    newFiles[editingFileIndex] = newFile;
                    return newFiles;
                  });
                  setEditingFileIndex(null);
                }}
              />
            )}
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
