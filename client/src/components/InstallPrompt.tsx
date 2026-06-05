'use client';

import { useEffect, useState } from 'react';
import Logo from './ui/Logo';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [platform, setPlatform] = useState<string>('other');
  const [browser, setBrowser] = useState<string>('other');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Check if already running in standalone mode (already installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    if (isStandalone) return;

    // 2. If not installed, default to showing the banner
    setShowBanner(true);

    // 3. Detect Platform
    const ua = navigator.userAgent.toLowerCase();
    let detectedPlatform = 'other';
    if (/iphone|ipad|ipod/.test(ua)) {
      detectedPlatform = 'ios';
    } else if (/android/.test(ua)) {
      detectedPlatform = 'android';
    } else if (/macintosh|mac os x/.test(ua)) {
      detectedPlatform = 'mac';
    } else if (/windows/.test(ua)) {
      detectedPlatform = 'windows';
    }
    setPlatform(detectedPlatform);

    // 4. Detect Browser
    let detectedBrowser = 'other';
    if (/chrome|crios/.test(ua)) {
      detectedBrowser = 'chrome';
    } else if (/safari/.test(ua) && !/chrome|crios|firefox|fxios/.test(ua)) {
      detectedBrowser = 'safari';
    } else if (/firefox|fxios/.test(ua)) {
      detectedBrowser = 'firefox';
    }
    setBrowser(detectedBrowser);

    // 5. Listen for Chromium native beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      setShowInstructions(true);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
  };

  // If banner is closed, do not render anything
  if (!showBanner) return null;

  // Function to render platform/browser instructions
  const renderInstructionsContent = () => {
    if (platform === 'ios') {
      if (browser === 'safari') {
        return (
          <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>
            <li>Open this website in the <strong>Safari</strong> app.</li>
            <li>Tap the <strong>Share</strong> button <span style={{ fontSize: '18px', verticalAlign: 'middle' }}>📤</span> (at the bottom toolbar).</li>
            <li>Scroll down the options and select <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong> in the top-right corner to complete.</li>
          </ol>
        );
      } else {
        return (
          <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>
            <li>Copy this page's URL from your current browser's address bar.</li>
            <li>Open the Apple native <strong>Safari</strong> browser.</li>
            <li>Paste and open the URL in Safari.</li>
            <li>Tap <strong>Share</strong> <span style={{ fontSize: '18px', verticalAlign: 'middle' }}>📤</span>, scroll down, and select <strong>Add to Home Screen</strong>.</li>
          </ol>
        );
      }
    }

    if (platform === 'mac' && browser === 'safari') {
      return (
        <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>
          <li>Click the <strong>Share</strong> button <span style={{ fontSize: '16px', verticalAlign: 'middle' }}>📤</span> in Safari's top-right toolbar.</li>
          <li>Select <strong>Add to Dock...</strong> from the dropdown menu.</li>
          <li>Click <strong>Add</strong> to pin CampusPrint to your Dock.</li>
        </ol>
      );
    }

    if (platform === 'android') {
      return (
        <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>
          <li>Tap the <strong>three vertical dots menu</strong> (⋮) in your browser's top-right corner.</li>
          <li>Select <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
          <li>Confirm the prompt to pin it to your home screen.</li>
        </ol>
      );
    }

    // Default Desktop Chrome / Edge / Firefox / Windows
    return (
      <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>
        <li>Look at your browser's address bar (top-right).</li>
        <li>Click the <strong>Install Icon</strong> (represented by a computer screen <span style={{ fontSize: '13px' }}>🖥️</span> or a down-pointing arrow <span style={{ fontSize: '13px' }}>📥</span>).</li>
        <li>Alternatively, open the browser settings menu (⋮ or ☰) and click <strong>Install CampusPrint</strong>.</li>
      </ol>
    );
  };

  return (
    <>
      {/* Bottom Install Banner */}
      <div
        style={{
          position: 'fixed',
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          left: '16px',
          right: '16px',
          zIndex: 9999,
          background: 'rgba(12, 13, 22, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 15px rgba(99, 102, 241, 0.1)',
          animation: 'slideUpBanner 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <style>{`
          @keyframes slideUpBanner {
            from { transform: translateY(100px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          @keyframes scaleUp {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>

        {/* Logo and Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <div style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>
            <Logo size={38} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              Install CampusPrint
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              Get faster access & notifications
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={handleInstallClick}
            style={{
              padding: '6px 14px',
              background: 'linear-gradient(135deg, #3b82f6, #ec4899)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(59, 130, 246, 0.3)',
              transition: 'transform 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
            onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {deferredPrompt ? 'Install' : 'Get App'}
          </button>
        </div>
      </div>

      {/* Instructions Modal Overlay */}
      {showInstructions && (
        <div
          onClick={() => setShowInstructions(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5, 5, 12, 0.75)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            animation: 'fadeIn 0.25s ease-out',
          }}
        >
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
          
          {/* Modal Card */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(12, 13, 22, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '24px',
              padding: '24px',
              maxWidth: '380px',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(99, 102, 241, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Logo size={34} />
              </div>
              <button
                onClick={() => setShowInstructions(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                How to Add to Home Screen
              </h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#94a3b8', lineHeight: '1.4' }}>
                To install CampusPrint on your device, follow these quick steps:
              </p>
              
              {renderInstructionsContent()}
            </div>

            {/* Modal Footer */}
            <button
              onClick={() => setShowInstructions(false)}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#e2e8f0',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

