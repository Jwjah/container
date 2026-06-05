'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PropertyPanelProps {
  visible: boolean;
  objectType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity: number;
  angle: number;
  onFillChange: (v: string) => void;
  onOpacityChange: (v: number) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  darkMode?: boolean;
  panelPosition?: { top: number; left: number };
}

const SHAPE_COLORS = [
  '#000000', '#ffffff', '#D2294B', '#ef4444', '#f59e0b',
  '#22c55e', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
  'transparent',
];

export default function PropertyPanel({
  visible, objectType, x, y, width, height, fill, opacity, angle,
  onFillChange, onOpacityChange, onDelete, onDuplicate,
  onBringForward, onSendBackward, onFlipH, onFlipV,
  darkMode = false, panelPosition,
}: PropertyPanelProps) {
  const bg = darkMode ? 'rgba(15,15,35,0.95)' : 'rgba(255,255,255,0.97)';
  const border = darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb';
  const text = darkMode ? '#f1f5f9' : '#374151';
  const textMuted = darkMode ? '#64748b' : '#9ca3af';
  const btnBg = darkMode ? 'rgba(255,255,255,0.06)' : '#f9fafb';

  const iconBtnStyle: React.CSSProperties = {
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `1px solid ${border}`, borderRadius: 6, cursor: 'pointer',
    background: btnBg, color: text, fontSize: 12, transition: 'all 0.15s',
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed',
            top: panelPosition?.top ?? 120,
            right: 16,
            width: 240,
            background: bg,
            backdropFilter: 'blur(20px)',
            border: `1px solid ${border}`,
            borderRadius: 14,
            boxShadow: darkMode ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.12)',
            padding: 16,
            zIndex: 900,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {objectType || 'Object'}
            </span>
            <button onClick={onDelete} style={{ ...iconBtnStyle, color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' }} title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>

          {/* Position & Size */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
            {[
              { label: 'X', value: Math.round(x) },
              { label: 'Y', value: Math.round(y) },
              { label: 'W', value: Math.round(width) },
              { label: 'H', value: Math.round(height) },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: textMuted, width: 14 }}>{label}</span>
                <span style={{
                  flex: 1, padding: '3px 6px', fontSize: 11, fontWeight: 500,
                  background: btnBg, border: `1px solid ${border}`, borderRadius: 5, color: text,
                  fontVariantNumeric: 'tabular-nums',
                }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Rotation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: textMuted, width: 40 }}>Angle</span>
            <span style={{
              padding: '3px 6px', fontSize: 11, fontWeight: 500, background: btnBg,
              border: `1px solid ${border}`, borderRadius: 5, color: text, flex: 1,
            }}>{Math.round(angle)}°</span>
          </div>

          {/* Fill Color */}
          {objectType !== 'textbox' && objectType !== 'text' && (
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: textMuted, display: 'block', marginBottom: 6 }}>Fill</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {SHAPE_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => onFillChange(c)}
                    style={{
                      width: 22, height: 22, borderRadius: 5,
                      border: fill === c ? '2px solid #D2294B' : `1px solid ${border}`,
                      background: c === 'transparent' ? `repeating-conic-gradient(${darkMode ? '#333' : '#ddd'} 0% 25%, transparent 0% 50%) 50% / 8px 8px` : c,
                      cursor: 'pointer', transition: 'transform 0.1s',
                    }}
                    title={c === 'transparent' ? 'No Fill' : c}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Opacity */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: textMuted }}>Opacity</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: text }}>{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.05" value={opacity}
              onChange={(e) => onOpacityChange(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#D2294B', height: 4 }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button onClick={onDuplicate} style={iconBtnStyle} title="Duplicate">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
            <button onClick={onBringForward} style={iconBtnStyle} title="Bring Forward">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/>
              </svg>
            </button>
            <button onClick={onSendBackward} style={iconBtnStyle} title="Send Backward">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/>
              </svg>
            </button>
            <button onClick={onFlipH} style={iconBtnStyle} title="Flip Horizontal">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><line x1="12" y1="20" x2="12" y2="4"/>
              </svg>
            </button>
            <button onClick={onFlipV} style={iconBtnStyle} title="Flip Vertical">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8V5a2 2 0 0 1 2-2h14c1.1 0 2 .9 2 2v3"/><path d="M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><line x1="4" y1="12" x2="20" y2="12"/>
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
