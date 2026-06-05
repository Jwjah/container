'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fabric } from 'fabric';

interface SignaturePadProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (dataUrl: string) => void;
  darkMode?: boolean;
}

const CURSIVE_FONTS = [
  'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', 'Comic Sans MS', 'Georgia',
];

export default function SignaturePad({ isOpen, onClose, onInsert, darkMode = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const [selectedFont, setSelectedFont] = useState(CURSIVE_FONTS[0]);
  const [penColor, setPenColor] = useState('#1a1a2e');
  const [penWidth, setPenWidth] = useState(2.5);

  const bg = darkMode ? '#0f0f23' : '#ffffff';
  const border = darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb';
  const text = darkMode ? '#f1f5f9' : '#374151';
  const textMuted = darkMode ? '#64748b' : '#9ca3af';
  const cardBg = darkMode ? 'rgba(15,15,35,0.95)' : '#ffffff';

  useEffect(() => {
    if (!isOpen || !canvasRef.current || mode !== 'draw') return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 400,
      height: 180,
      backgroundColor: 'transparent',
      isDrawingMode: true,
    });
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.width = penWidth;
    canvas.freeDrawingBrush.color = penColor;
    fabricRef.current = canvas;

    return () => {
      try { canvas.dispose(); } catch (_) {}
      fabricRef.current = null;
    };
  }, [isOpen, mode]);

  useEffect(() => {
    if (fabricRef.current && fabricRef.current.freeDrawingBrush) {
      fabricRef.current.freeDrawingBrush.color = penColor;
      fabricRef.current.freeDrawingBrush.width = penWidth;
    }
  }, [penColor, penWidth]);

  const handleClear = () => {
    if (fabricRef.current) {
      fabricRef.current.clear();
      fabricRef.current.renderAll();
    }
    setTypedName('');
  };

  const handleInsert = () => {
    if (mode === 'draw' && fabricRef.current) {
      const dataUrl = fabricRef.current.toDataURL({ format: 'png' });
      onInsert(dataUrl);
    } else if (mode === 'type' && typedName.trim()) {
      // Render typed text to a canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 400;
      tempCanvas.height = 80;
      const ctx = tempCanvas.getContext('2d')!;
      ctx.font = `36px '${selectedFont}'`;
      ctx.fillStyle = penColor;
      ctx.textBaseline = 'middle';
      ctx.fillText(typedName, 16, 40);
      onInsert(tempCanvas.toDataURL('image/png'));
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)', zIndex: 10001,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            style={{
              background: cardBg, borderRadius: 16, border: `1px solid ${border}`,
              padding: 24, width: 460, maxWidth: '92vw',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: text, fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
              ✍️ Signature
            </h3>

            {/* Mode Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: darkMode ? 'rgba(255,255,255,0.04)' : '#f3f4f6', borderRadius: 8, padding: 3 }}>
              {(['draw', 'type'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: 6, border: 'none',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: mode === m ? (darkMode ? '#D2294B' : '#D2294B') : 'transparent',
                    color: mode === m ? '#fff' : textMuted,
                    transition: 'all 0.2s',
                  }}
                >
                  {m === 'draw' ? '✏️ Draw' : '⌨️ Type'}
                </button>
              ))}
            </div>

            {mode === 'draw' ? (
              <div style={{
                border: `2px dashed ${border}`, borderRadius: 12, overflow: 'hidden',
                marginBottom: 16, background: darkMode ? 'rgba(255,255,255,0.02)' : '#fafafa',
              }}>
                <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 180 }} />
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <input
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Type your signature..."
                  style={{
                    width: '100%', padding: '14px 16px', fontSize: 28,
                    fontFamily: selectedFont, border: `2px dashed ${border}`,
                    borderRadius: 12, background: darkMode ? 'rgba(255,255,255,0.02)' : '#fafafa',
                    color: penColor, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {CURSIVE_FONTS.map(f => (
                    <button
                      key={f}
                      onClick={() => setSelectedFont(f)}
                      style={{
                        padding: '4px 10px', fontSize: 12, fontFamily: f,
                        border: selectedFont === f ? '1.5px solid #D2294B' : `1px solid ${border}`,
                        borderRadius: 6, cursor: 'pointer',
                        background: selectedFont === f ? 'rgba(210,41,75,0.1)' : 'transparent',
                        color: selectedFont === f ? '#D2294B' : textMuted,
                      }}
                    >
                      {f.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pen options */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: textMuted }}>Color:</span>
              {['#1a1a2e', '#1e40af', '#D2294B', '#000000'].map(c => (
                <button
                  key={c}
                  onClick={() => setPenColor(c)}
                  style={{
                    width: 24, height: 24, borderRadius: 6, background: c,
                    border: penColor === c ? '2px solid #D2294B' : `1px solid ${border}`,
                    cursor: 'pointer',
                  }}
                />
              ))}
              <span style={{ fontSize: 11, fontWeight: 600, color: textMuted, marginLeft: 12 }}>Size:</span>
              <input type="range" min="1" max="6" step="0.5" value={penWidth}
                onChange={(e) => setPenWidth(Number(e.target.value))}
                style={{ width: 60, accentColor: '#D2294B' }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={handleClear} style={{
                padding: '8px 16px', background: 'none', border: `1px solid ${border}`,
                borderRadius: 8, color: textMuted, cursor: 'pointer', fontWeight: 600, fontSize: 13,
              }}>Clear</button>
              <button onClick={onClose} style={{
                padding: '8px 16px', background: 'none', border: `1px solid ${border}`,
                borderRadius: 8, color: textMuted, cursor: 'pointer', fontWeight: 600, fontSize: 13,
              }}>Cancel</button>
              <button onClick={handleInsert} style={{
                padding: '8px 20px', background: '#D2294B', border: 'none',
                borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              }}>Insert</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
