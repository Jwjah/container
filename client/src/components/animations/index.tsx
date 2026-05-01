'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ReactNode } from 'react';

// Page transition wrapper
export const PageTransition = ({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) => (
  <motion.div
    initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
    exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    className={className}
    style={style}
  >
    {children}
  </motion.div>
);

// Fade-in with scale
export const FadeIn = ({ children, delay = 0, className = '', style }: { children: ReactNode; delay?: number; className?: string; style?: React.CSSProperties }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
    className={className}
    style={style}
  >
    {children}
  </motion.div>
);

// Slide-up reveal
export const SlideUp = ({ children, delay = 0, className = '', style }: { children: ReactNode; delay?: number; className?: string; style?: React.CSSProperties }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    className={className}
    style={style}
  >
    {children}
  </motion.div>
);

// Stagger container for lists/grids
export const StaggerContainer = ({ children, className = '', style, staggerDelay = 0.08 }: { children: ReactNode; className?: string; style?: React.CSSProperties; staggerDelay?: number }) => (
  <motion.div
    initial="hidden"
    animate="visible"
    variants={{
      hidden: {},
      visible: { transition: { staggerChildren: staggerDelay } },
    }}
    className={className}
    style={style}
  >
    {children}
  </motion.div>
);

// Individual stagger item
export const StaggerItem = ({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) => (
  <motion.div
    variants={{
      hidden: { opacity: 0, y: 20, scale: 0.95 },
      visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
    }}
    className={className}
    style={style}
  >
    {children}
  </motion.div>
);

// Hover scale card
export const HoverCard = ({ children, className = '', style, scale = 1.02, onClick }: { children: ReactNode; className?: string; style?: React.CSSProperties; scale?: number; onClick?: () => void }) => (
  <motion.div
    whileHover={{ scale, y: -2 }}
    whileTap={{ scale: 0.98 }}
    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    className={className}
    style={style}
    onClick={onClick}
  >
    {children}
  </motion.div>
);

// Tap button animation
export const TapButton = ({ children, className = '', style, onClick, disabled = false, type = 'button' as 'button' | 'submit' }: { children: ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) => (
  <motion.button
    whileHover={disabled ? {} : { scale: 1.02 }}
    whileTap={disabled ? {} : { scale: 0.96 }}
    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
    className={className}
    style={style}
    onClick={onClick}
    disabled={disabled}
    type={type}
  >
    {children}
  </motion.button>
);

// Counter animation
export const AnimatedCounter = ({ value, className = '' }: { value: number; className?: string }) => (
  <motion.span
    key={value}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    className={className}
  >
    {typeof value === 'number' ? value.toLocaleString() : value}
  </motion.span>
);

// Modal overlay
export const ModalOverlay = ({ children, isOpen, onClose }: { children: ReactNode; isOpen: boolean; onClose: () => void }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '540px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}
        >
          {children}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// Pulse dot (for live indicators)
export const PulseDot = ({ color = 'var(--success)' }: { color?: string }) => (
  <span style={{ position: 'relative', display: 'inline-block', width: 8, height: 8 }}>
    <motion.span
      animate={{ scale: [1, 1.8, 1], opacity: [0.7, 0, 0.7] }}
      transition={{ duration: 2, repeat: Infinity }}
      style={{
        position: 'absolute', inset: 0, borderRadius: '50%', background: color,
      }}
    />
    <span style={{
      position: 'absolute', inset: 0, borderRadius: '50%', background: color,
    }} />
  </span>
);

// Notification bell with count badge
export const NotificationBadge = ({ count }: { count: number }) => (
  <AnimatePresence>
    {count > 0 && (
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        style={{
          position: 'absolute', top: -4, right: -4,
          background: 'var(--error)', color: 'white',
          fontSize: 10, fontWeight: 700, borderRadius: 999,
          minWidth: 18, height: 18, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          padding: '0 4px',
        }}
      >
        {count > 99 ? '99+' : count}
      </motion.span>
    )}
  </AnimatePresence>
);
