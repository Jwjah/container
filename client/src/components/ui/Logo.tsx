'use client';

import { motion } from 'framer-motion';

export default function Logo({ size = 48 }: { size?: number }) {
  const fontSize = size * 0.48;
  const borderRadius = size * 0.24;
  const borderWidth = Math.max(1.5, size * 0.04);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div
        style={{
          position: 'relative',
          width: size,
          height: size,
          flexShrink: 0,
        }}
      >
        {/* Soft Background Outer Glow Halo */}
        <motion.div
          animate={{
            opacity: [0.35, 0.85, 0.35],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            position: 'absolute',
            inset: `-${borderWidth}px`,
            background: 'linear-gradient(135deg, #3b82f6, #ec4899)',
            borderRadius: borderRadius,
            filter: `blur(${size * 0.18}px)`,
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />

        {/* Main Logo Container */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: borderRadius,
            border: `${borderWidth}px solid transparent`,
            // Dark navy/black background (padding-box) + neon gradient border (border-box)
            background: 'linear-gradient(#0c0d16, #0c0d16) padding-box, linear-gradient(135deg, #3b82f6, #ec4899) border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
            boxShadow: 'inset 0 0 12px rgba(59, 130, 246, 0.15), inset 0 0 8px rgba(236, 72, 153, 0.1)',
          }}
        >
          {/* Letters "CP" Container */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Dual Layer Text Glow (Avoids standard browser drop-shadow bugs on gradient text) */}
            <motion.span
              animate={{
                opacity: [0.25, 0.8, 0.25],
                filter: [`blur(${size * 0.06}px)`, `blur(${size * 0.14}px)`, `blur(${size * 0.06}px)`],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{
                position: 'absolute',
                fontSize: fontSize,
                fontWeight: 800,
                background: 'linear-gradient(135deg, #3b82f6, #a78bfa, #ec4899)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-1.5px',
                userSelect: 'none',
                zIndex: 0,
              }}
            >
              CP
            </motion.span>

            {/* Sharp Front Text Layer */}
            <span
              style={{
                position: 'relative',
                fontSize: fontSize,
                fontWeight: 800,
                background: 'linear-gradient(135deg, #60a5fa, #c084fc, #f472b6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-1.5px',
                userSelect: 'none',
                zIndex: 1,
              }}
            >
              CP
            </span>
          </div>
        </div>
      </div>

      {/* Brand Text */}
      <motion.span
        animate={{
          textShadow: [
            '0 0 4px rgba(59, 130, 246, 0.1)',
            '0 0 12px rgba(59, 130, 246, 0.5)',
            '0 0 4px rgba(59, 130, 246, 0.1)',
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          fontSize: size * 0.42,
          fontWeight: 800,
          background: 'linear-gradient(135deg, #3b82f6, #a78bfa)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          display: size < 40 ? 'none' : 'block', // hide text on small sizes
          letterSpacing: '-0.5px',
        }}
      >
        CampusPrint
      </motion.span>
    </div>
  );
}

