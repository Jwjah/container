'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ColorSamplerProps {
  visible: boolean;
  onColorPicked: (color: string) => void;
  onCancel: () => void;
}

export default function ColorSampler({ visible, onColorPicked, onCancel }: ColorSamplerProps) {
  // A simple floating instructions banner for color sampling mode
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
          style={{
            position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)',
            background: '#1a1a2e', color: '#fff', padding: '12px 24px', borderRadius: 30,
            display: 'flex', alignItems: 'center', gap: 16, zIndex: 1000,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #fff', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: 2, height: 2, background: '#D2294B', transform: 'translate(-50%, -50%)', borderRadius: '50%' }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Click anywhere on the image to sample a color</span>
          <button onClick={onCancel} style={{
            padding: '4px 12px', background: 'rgba(255,255,255,0.1)', color: '#fff',
            border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 12, fontWeight: 600
          }}>Cancel</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
