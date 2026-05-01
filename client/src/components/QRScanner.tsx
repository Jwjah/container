'use client';

/**
 * QRScanner Component
 * -----------------------------------------------
 * A full-screen camera overlay that uses the html5-qrcode library
 * to scan QR codes. It supports:
 *  - Automatic camera selection (rear for phones, front for Mac/laptops)
 *  - Guaranteed camera shutdown when the modal is closed
 *  - Prevents double-initialisation (React Strict Mode safe)
 *  - Beautiful glassmorphism UI matching the app design
 * -----------------------------------------------
 */

import { useEffect, useRef, useState } from 'react';
import { HiOutlineX, HiOutlineQrcode, HiOutlineCamera } from 'react-icons/hi';
import toast from 'react-hot-toast';

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  title?: string;
  description?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const SCANNER_ELEMENT_ID = 'campus-qr-scan-viewport';
const LIBRARY_URL = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';

// ─── Component ────────────────────────────────────────────────────────────────
export default function QRScanner({
  onScan,
  onClose,
  title = 'Scan QR Code',
  description = 'Point your camera at the QR code.',
}: QRScannerProps) {

  // ─── State ──────────────────────────────────────────────────────────────────
  const [libraryReady, setLibraryReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'active' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  // ─── Refs ───────────────────────────────────────────────────────────────────
  // We store the actual Html5Qrcode instance here so we can stop it from
  // anywhere — especially from the onClose handler and the cleanup function.
  const scannerInstanceRef = useRef<any>(null);

  // Guard against double-initialisation in React Strict Mode (renders twice in dev)
  const isStartingRef = useRef(false);

  // We need to capture the latest onScan without re-running the camera effect
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  // ─── Step 1: Load the html5-qrcode library dynamically ─────────────────────
  useEffect(() => {
    // If the library is already in window (from a previous open), skip loading
    if ((window as any).Html5Qrcode) {
      setLibraryReady(true);
      return;
    }

    const existingScript = document.getElementById('html5-qrcode-lib');
    if (existingScript) {
      // Script tag exists but may still be loading — wait for it
      existingScript.addEventListener('load', () => setLibraryReady(true));
      return;
    }

    const script = document.createElement('script');
    script.id = 'html5-qrcode-lib';
    script.src = LIBRARY_URL;
    script.async = true;
    script.onload = () => setLibraryReady(true);
    script.onerror = () => {
      setErrorMessage('Failed to load camera library. Check your connection.');
      setCameraStatus('error');
    };
    document.body.appendChild(script);
  }, []);

  // ─── Step 2: Start camera once library is ready ─────────────────────────────
  useEffect(() => {
    if (!libraryReady) return;
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    // Wait a tick for the DOM element to mount properly
    const initTimer = setTimeout(() => {
      startCamera();
    }, 150);

    return () => {
      clearTimeout(initTimer);
      stopCamera();
      isStartingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryReady]);

  // ─── Camera helpers ─────────────────────────────────────────────────────────

  async function startCamera() {
    const Html5Qrcode = (window as any).Html5Qrcode;
    if (!Html5Qrcode) {
      setErrorMessage('Camera library not available.');
      setCameraStatus('error');
      return;
    }

    // Destroy any stale instance first (safety net)
    await stopCamera();

    const instance = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerInstanceRef.current = instance;

    const scanConfig = { fps: 12, qrbox: { width: 260, height: 260 } };

    // Callback called on every successful scan frame
    const handleDecodeSuccess = (rawText: string) => {
      // Stop camera immediately on a successful read so it doesn't keep scanning
      stopCamera().then(() => {
        onScanRef.current(rawText);
      });
    };

    // Try rear camera first (phones), then front camera (laptops / Mac)
    try {
      await instance.start({ facingMode: 'environment' }, scanConfig, handleDecodeSuccess, () => {});
      setCameraStatus('active');
    } catch {
      try {
        await instance.start({ facingMode: 'user' }, scanConfig, handleDecodeSuccess, () => {});
        setCameraStatus('active');
      } catch (finalErr: any) {
        console.error('Camera start failed:', finalErr);
        const msg = finalErr?.message || '';
        if (msg.toLowerCase().includes('permission')) {
          setErrorMessage('Camera permission denied. Please allow camera access and try again.');
        } else {
          setErrorMessage('Unable to open camera. Make sure no other app is using it.');
        }
        setCameraStatus('error');
        scannerInstanceRef.current = null;
      }
    }
  }

  async function stopCamera() {
    const instance = scannerInstanceRef.current;
    if (!instance) return;

    try {
      if (instance.isScanning) {
        await instance.stop();
      }
    } catch {
      // Ignore stop errors (e.g., already stopped)
    }

    try {
      instance.clear();
    } catch {
      // Ignore clear errors
    }

    // Clear the DOM element so the next open starts fresh
    const el = document.getElementById(SCANNER_ELEMENT_ID);
    if (el) el.innerHTML = '';

    scannerInstanceRef.current = null;
  }

  // ─── Close handler — always stop camera before calling onClose ───────────────
  const handleClose = async () => {
    await stopCamera();
    onClose();
  };

  // ─── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 24,
          overflow: 'hidden',
          boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
          position: 'relative',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 20px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <HiOutlineQrcode size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                {title}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
                {description}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-label="Close scanner"
          >
            <HiOutlineX size={18} />
          </button>
        </div>

        {/* ── Camera viewport ── */}
        <div style={{ padding: '16px 20px 20px', position: 'relative' }}>

          {/* Loading state overlay */}
          {cameraStatus === 'loading' && (
            <div
              style={{
                position: 'absolute',
                inset: '16px 20px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                zIndex: 10,
                background: 'var(--bg-secondary)',
                borderRadius: 16,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  border: '3px solid var(--border)',
                  borderTopColor: 'var(--primary)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <p style={{ color: 'var(--text-tertiary)', fontSize: 14, margin: 0 }}>
                Starting camera…
              </p>
            </div>
          )}

          {/* Error state */}
          {cameraStatus === 'error' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '40px 16px',
                textAlign: 'center',
                background: 'rgba(239,68,68,0.08)',
                borderRadius: 16,
                border: '1px solid rgba(239,68,68,0.2)',
              }}
            >
              <HiOutlineCamera size={40} color="var(--error)" />
              <p style={{ color: 'var(--error)', fontSize: 14, fontWeight: 600, margin: 0 }}>
                Camera Error
              </p>
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13, margin: 0 }}>
                {errorMessage}
              </p>
              <button
                className="btn btn-primary btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setCameraStatus('loading');
                  setErrorMessage('');
                  isStartingRef.current = false;
                  startCamera();
                }}
              >
                Retry Camera
              </button>
            </div>
          )}

          {/* 
            The actual scanner container. 
            IMPORTANT: No flex or display:flex on this div — it would break
            the video element that html5-qrcode injects dynamically.
            The outer wrapper handles the height; this div is raw.
          */}
          <div
            id={SCANNER_ELEMENT_ID}
            style={{
              width: '100%',
              minHeight: cameraStatus === 'error' ? 0 : 320,
              borderRadius: 16,
              overflow: 'hidden',
              background: '#000',
              display: cameraStatus === 'error' ? 'none' : 'block',
            }}
          />

          {/* Scanning guide corners overlay — only shown when camera is active */}
          {cameraStatus === 'active' && (
            <div
              style={{
                position: 'absolute',
                top: 16,
                left: 20,
                right: 20,
                bottom: 20,
                pointerEvents: 'none',
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              {/* Scanning guide corners overlay — only shown when camera is active */}
              {/* Animated scanning line */}
              <div className="scan-line" />
              
              {/* Top-left corner */}
              <div style={{ position: 'absolute', top: 30, left: 30, width: 28, height: 28, borderTop: '3px solid var(--primary)', borderLeft: '3px solid var(--primary)', borderRadius: '4px 0 0 0', boxShadow: '0 0 10px var(--primary-glow)' }} />
              {/* Top-right corner */}
              <div style={{ position: 'absolute', top: 30, right: 30, width: 28, height: 28, borderTop: '3px solid var(--primary)', borderRight: '3px solid var(--primary)', borderRadius: '0 4px 0 0', boxShadow: '0 0 10px var(--primary-glow)' }} />
              {/* Bottom-left corner */}
              <div style={{ position: 'absolute', bottom: 30, left: 30, width: 28, height: 28, borderBottom: '3px solid var(--primary)', borderLeft: '3px solid var(--primary)', borderRadius: '0 0 0 4px', boxShadow: '0 0 10px var(--primary-glow)' }} />
              {/* Bottom-right corner */}
              <div style={{ position: 'absolute', bottom: 30, right: 30, width: 28, height: 28, borderBottom: '3px solid var(--primary)', borderRight: '3px solid var(--primary)', borderRadius: '0 0 4px 0', boxShadow: '0 0 10px var(--primary-glow)' }} />
            </div>
          )}

          {/* Status pill */}
          {cameraStatus === 'active' && (
            <div
              style={{
                position: 'absolute',
                bottom: 32,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.7)',
                color: '#fff',
                fontSize: 12,
                padding: '4px 12px',
                borderRadius: 99,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 1.5s ease infinite' }} />
              Scanning…
            </div>
          )}
        </div>

        {/* ── Cancel button ── */}
        <div style={{ padding: '0 20px 20px' }}>
          <button
            className="btn btn-ghost"
            style={{ width: '100%', border: '1px solid var(--border)' }}
            onClick={handleClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
