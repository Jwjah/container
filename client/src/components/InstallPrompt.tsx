'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSBanner, setShowIOSBanner] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if dismissed recently
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissedAt < sevenDays) return;
    }

    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((navigator as any).standalone === true) return;

    // Android/Desktop: Listen for beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // iOS: Detect Safari on iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/.test(navigator.userAgent);
    if (isIOS && isSafari) {
      setShowIOSBanner(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('✅ PWA installed');
    }
    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setShowIOSBanner(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (!showBanner && !showIOSBanner) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        left: '16px',
        right: '16px',
        zIndex: 9999,
        background: 'rgba(15, 15, 35, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        animation: 'slideUpBanner 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <style>{`
        @keyframes slideUpBanner {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div style={{ fontSize: '28px', flexShrink: 0 }}>📲</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9', marginBottom: '2px' }}>
          Install CampusPrint
        </div>
        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
          {showIOSBanner
            ? 'Tap Share ⎙ then "Add to Home Screen"'
            : 'Add to your home screen for faster access'}
        </div>
      </div>

      {showBanner && (
        <button
          onClick={handleInstall}
          style={{
            padding: '8px 18px',
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
            boxShadow: '0 2px 12px rgba(99, 102, 241, 0.4)',
          }}
        >
          Install
        </button>
      )}

      <button
        onClick={handleDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#64748b',
          fontSize: '18px',
          cursor: 'pointer',
          padding: '4px',
          flexShrink: 0,
          lineHeight: 1,
        }}
        aria-label="Dismiss install prompt"
      >
        ✕
      </button>
    </div>
  );
}
