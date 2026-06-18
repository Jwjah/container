'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageFiltersProps {
  visible: boolean;
  onClose: () => void;
  filters: {
    brightness: number;
    contrast: number;
    saturation: number;
    blur: number;
  };
  onFilterChange: (key: string, value: number) => void;
  onApplyPreset: (preset: string) => void;
  darkMode?: boolean;
}

export default function ImageFilters({
  visible, onClose, filters, onFilterChange, onApplyPreset, darkMode = false
}: ImageFiltersProps) {
  const bg = darkMode ? 'rgba(15,15,35,0.95)' : 'rgba(255,255,255,0.97)';
  const border = darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb';
  const text = darkMode ? '#f1f5f9' : '#374151';
  const textMuted = darkMode ? '#64748b' : '#9ca3af';

  const presets = ['Grayscale', 'Sepia', 'Invert', 'Vintage', 'Polaroid', 'Kodachrome'];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          style={{
            position: 'absolute',
            top: 70,
            right: 20,
            width: 280,
            background: bg,
            backdropFilter: 'blur(20px)',
            border: `1px solid ${border}`,
            borderRadius: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            padding: 16,
            zIndex: 900,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: text }}>Adjustments</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: textMuted, cursor: 'pointer' }}>✕</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: textMuted }}>Brightness</span>
                <span style={{ fontSize: 11, color: text }}>{filters.brightness}</span>
              </div>
              <input type="range" min="-100" max="100" value={filters.brightness} onChange={(e) => onFilterChange('brightness', parseInt(e.target.value))} style={{ width: '100%', accentColor: '#D2294B' }} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: textMuted }}>Contrast</span>
                <span style={{ fontSize: 11, color: text }}>{filters.contrast}</span>
              </div>
              <input type="range" min="-100" max="100" value={filters.contrast} onChange={(e) => onFilterChange('contrast', parseInt(e.target.value))} style={{ width: '100%', accentColor: '#D2294B' }} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: textMuted }}>Saturation</span>
                <span style={{ fontSize: 11, color: text }}>{filters.saturation}</span>
              </div>
              <input type="range" min="-100" max="100" value={filters.saturation} onChange={(e) => onFilterChange('saturation', parseInt(e.target.value))} style={{ width: '100%', accentColor: '#D2294B' }} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: textMuted }}>Blur</span>
                <span style={{ fontSize: 11, color: text }}>{filters.blur}px</span>
              </div>
              <input type="range" min="0" max="10" step="0.1" value={filters.blur} onChange={(e) => onFilterChange('blur', parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#D2294B' }} />
            </div>
          </div>

          <h3 style={{ fontSize: 12, fontWeight: 700, color: text, marginBottom: 8 }}>Presets</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {presets.map(p => (
              <button
                key={p}
                onClick={() => onApplyPreset(p)}
                style={{
                  padding: '6px 0', fontSize: 11, fontWeight: 500,
                  background: darkMode ? 'rgba(255,255,255,0.05)' : '#f3f4f6',
                  color: text, border: `1px solid ${border}`, borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
