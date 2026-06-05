'use client';

import { motion } from 'framer-motion';

export default function Logo({ size = 48 }: { size?: number }) {
  const fontSize = size * 0.5;
  const borderRadius = size * 0.25;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <motion.div
        animate={{
          boxShadow: [
            '0 0 8px rgba(99, 102, 241, 0.4), inset 0 0 8px rgba(236, 72, 153, 0.4)',
            '0 0 20px rgba(99, 102, 241, 0.9), inset 0 0 20px rgba(236, 72, 153, 0.9)',
            '0 0 8px rgba(99, 102, 241, 0.4), inset 0 0 8px rgba(236, 72, 153, 0.4)'
          ],
        }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: borderRadius,
          border: '2px solid transparent',
          // The background uses padding-box for the inside (dark) and border-box for the border (gradient)
          background: 'linear-gradient(#050510, #050510) padding-box, linear-gradient(135deg, #6366f1, #ec4899) border-box',
          position: 'relative',
        }}
      >
        <motion.span
          animate={{
            textShadow: [
              '0 0 5px rgba(167, 139, 250, 0.3)',
              '0 0 15px rgba(167, 139, 250, 0.8)',
              '0 0 5px rgba(167, 139, 250, 0.3)'
            ]
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
          style={{
            fontSize: fontSize,
            fontWeight: 800,
            background: 'linear-gradient(135deg, #818cf8, #f472b6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-1px',
            userSelect: 'none',
          }}
        >
          CP
        </motion.span>
      </motion.div>
      <motion.span
        animate={{
          textShadow: [
            '0 0 4px rgba(99, 102, 241, 0.2)',
            '0 0 10px rgba(99, 102, 241, 0.6)',
            '0 0 4px rgba(99, 102, 241, 0.2)'
          ]
        }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          fontSize: size * 0.45,
          fontWeight: 800,
          background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          display: size < 40 ? 'none' : 'block' // hide text on small sizes
        }}
      >
        CampusPrint
      </motion.span>
    </div>
  );
}
