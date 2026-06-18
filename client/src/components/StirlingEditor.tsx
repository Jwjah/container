import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface StirlingEditorProps {
  file: File;
  onSave: (newFile: File) => void;
  onClose: () => void;
}

export default function StirlingEditor({ file, onSave, onClose }: StirlingEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security: verify origin if needed
      // if (event.origin !== 'http://localhost:5173') return;

      if (event.data?.type === 'SAVE_FILE' && event.data.file) {
        onSave(event.data.file);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSave]);

  useEffect(() => {
    if (iframeLoaded && iframeRef.current?.contentWindow) {
      console.log('[StirlingEditor] Sending LOAD_FILE message');
      iframeRef.current.contentWindow.postMessage(
        { type: 'LOAD_FILE', file },
        '*'
      );
    }
  }, [iframeLoaded, file]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#050510',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0a1a', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ color: 'white', fontWeight: 600 }}>Stirling PDF Editor</div>
        <button
          onClick={onClose}
          style={{ background: 'var(--error)', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
        >
          Close
        </button>
      </div>
      <iframe
        ref={iframeRef}
        src="http://localhost:5173/" // Root editor
        style={{ flex: 1, width: '100%', border: 'none' }}
        onLoad={() => setIframeLoaded(true)}
      />
    </motion.div>
  );
}
