'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CropToolProps {
  visible: boolean;
  onApply: (cropData: { x: number, y: number, width: number, height: number }) => void;
  onCancel: () => void;
  imageWidth: number;
  imageHeight: number;
}

// A simplified overlay crop tool representation
export default function CropTool({ visible, onApply, onCancel, imageWidth, imageHeight }: CropToolProps) {
  // In a full implementation, this would have draggable handles on the canvas.
  // For now, we'll provide quick aspect ratio crops to simulate the feature.
  const [aspect, setAspect] = useState<number | null>(null);

  const handleApply = () => {
    let w = imageWidth;
    let h = imageHeight;
    if (aspect) {
      if (imageWidth / imageHeight > aspect) {
        w = imageHeight * aspect;
      } else {
        h = imageWidth / aspect;
      }
    }
    onApply({
      x: (imageWidth - w) / 2,
      y: (imageHeight - h) / 2,
      width: w,
      height: h,
    });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          style={{
            position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            background: '#1f2937', padding: 12, borderRadius: 12, display: 'flex', gap: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 900, alignItems: 'center'
          }}
        >
          <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600 }}>Crop:</span>
          
          {[
            { label: 'Free', val: null },
            { label: '1:1', val: 1 },
            { label: '4:3', val: 4/3 },
            { label: '16:9', val: 16/9 },
          ].map(a => (
            <button
              key={a.label}
              onClick={() => setAspect(a.val)}
              style={{
                padding: '4px 10px', fontSize: 12, fontWeight: 600,
                background: aspect === a.val ? '#D2294B' : 'rgba(255,255,255,0.1)',
                color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer'
              }}
            >
              {a.label}
            </button>
          ))}
          
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)' }} />
          
          <button onClick={onCancel} style={{ padding: '6px 12px', background: 'none', color: '#9ca3af', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancel</button>
          <button onClick={handleApply} style={{ padding: '6px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Apply</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
