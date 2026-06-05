'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─── Inline SVG Icons ─────────────────────────────── */
const Ico = {
  Thumbnails: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  Move:       () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M12 12v.01"/><path d="M2 12h20M12 2v20"/></svg>,
  Undo:       () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>,
  Redo:       () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>,
  AddText:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/><line x1="19" y1="15" x2="19" y2="21"/><line x1="16" y1="18" x2="22" y2="18"/></svg>,
  EditText:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>,
  Eraser:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>,
  Highlight:  () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>,
  Pencil:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>,
  Image:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  Shapes:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 9.5L12 2l10 7.5v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-11z"/><path d="M22 9.5L12 17 2 9.5"/></svg>,
  Rect:       () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  Ellipse:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><ellipse cx="12" cy="12" rx="10" ry="7"/></svg>,
  Line:       () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="5" y1="19" x2="19" y2="5"/></svg>,
  Arrow:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  Cross:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Check:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  Sign:       () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 17c3-3.3 5-6.7 5-10 .7 3.3 1.3 5.3 2 6 .7.7 1.3.7 2 0 .7-1.3 1-2 1-2 .5 1.5.8 2.3 1 2.5.2.2.5.2 1 0"/><path d="M16 3c.5.5.5 1.3 0 2.5L10 17m0 0H3m7 0 3.5 3.5"/></svg>,
  Annotations:() => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Links:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  More:       () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
  ChevDown:   () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>,
  Search:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  Print:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  Download:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Share:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  DoneCheck:  () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
  PencilEdit: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>,
  Filter:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  Crop:       () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>,
  Menu:       () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Theme:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  Sun:        () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  Camouflage: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>,
};

interface ToolbarProps {
  currentTool: string;
  setCurrentTool: (tool: any) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExport: () => void;
  onClose: () => void;
  onSearch?: () => void;
  onOcr?: () => void;
  onFilters?: () => void;
  onCrop?: () => void;
  title: string;
  exportLoading?: boolean;
  showThumbnails?: boolean;
  setShowThumbnails?: (v: boolean) => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  isImageEditor?: boolean;
}

export default function Toolbar({
  currentTool, setCurrentTool, onUndo, onRedo, canUndo, canRedo,
  onExport, onClose, onSearch, onOcr, onFilters, onCrop, title, exportLoading,
  showThumbnails, setShowThumbnails, darkMode, setDarkMode, isImageEditor = false
}: ToolbarProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
  const [showShapes, setShowShapes] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Responsive state
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const bg = darkMode ? '#0f0f23' : '#ffffff';
  const border = darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb';
  const text = darkMode ? '#f1f5f9' : '#374151';
  const textMuted = darkMode ? '#94a3b8' : '#9ca3af';
  const headerBg = darkMode ? '#0a0a1a' : '#ffffff';

  const isActive = (id: string) => currentTool === id;

  const toolStyle = (active: boolean, disabled = false): React.CSSProperties => ({
    display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', gap: isMobile ? '12px' : '3px',
    padding: isMobile ? '12px 16px' : '5px 9px',
    border: active ? '1.5px solid #D2294B' : '1.5px solid transparent',
    borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer',
    background: active ? (darkMode ? 'rgba(210,41,75,0.15)' : '#FFF0F2') : 'transparent',
    color: active ? '#D2294B' : disabled ? textMuted : text,
    transition: 'all 0.15s',
    opacity: disabled ? 0.45 : 1,
    minWidth: isMobile ? '100%' : '48px',
    justifyContent: isMobile ? 'flex-start' : 'center',
  });

  const labelStyle: React.CSSProperties = {
    fontSize: isMobile ? '14px' : '10px', fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.01em',
  };

  const sep = <div style={{ width: isMobile ? '100%' : '1px', height: isMobile ? '1px' : '36px', background: border, margin: isMobile ? '8px 0' : '0 4px', flexShrink: 0 }} />;

  const ToolsList = () => (
    <>
      {!isImageEditor && setShowThumbnails && (
        <button onClick={() => setShowThumbnails(!showThumbnails)} style={toolStyle(!!showThumbnails)}>
          <Ico.Thumbnails /><span style={labelStyle}>Pages</span>
        </button>
      )}

      {sep}

      <button onClick={() => setCurrentTool('select')} style={toolStyle(isActive('select'))}>
        <Ico.Move /><span style={labelStyle}>Move</span>
      </button>

      {sep}

      {!isMobile && (
        <>
          <button onClick={onUndo} disabled={!canUndo} style={toolStyle(false, !canUndo)} title="Undo (⌘Z)">
            <Ico.Undo /><span style={labelStyle}>Undo</span>
          </button>
          <button onClick={onRedo} disabled={!canRedo} style={toolStyle(false, !canRedo)} title="Redo (⌘⇧Z)">
            <Ico.Redo /><span style={labelStyle}>Redo</span>
          </button>
          {sep}
        </>
      )}

      <button onClick={() => setCurrentTool('text')} style={toolStyle(isActive('text'))}>
        <Ico.AddText /><span style={labelStyle}>Add Text</span>
      </button>
      
      {isImageEditor ? (
        <button onClick={() => setCurrentTool('camouflage')} style={toolStyle(isActive('camouflage'))} title="Camouflage/Remove Text">
          <Ico.Camouflage /><span style={labelStyle}>Hide Text</span>
        </button>
      ) : (
        <button onClick={() => setCurrentTool('whiteout')} style={toolStyle(isActive('whiteout'))}>
          <Ico.Eraser /><span style={labelStyle}>Eraser</span>
        </button>
      )}

      <button onClick={() => setCurrentTool('highlight')} style={toolStyle(isActive('highlight'))}>
        <Ico.Highlight /><span style={labelStyle}>Highlight</span>
      </button>
      
      <button onClick={() => setCurrentTool('draw')} style={toolStyle(isActive('draw'))}>
        <Ico.Pencil /><span style={labelStyle}>Pencil</span>
      </button>

      {/* Shapes Dropdown */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowShapes(!showShapes)} style={toolStyle(['rect','ellipse','line','arrow'].includes(currentTool))}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><Ico.Shapes /><Ico.ChevDown /></div>
          <span style={labelStyle}>Shapes</span>
        </button>
        <AnimatePresence>
          {showShapes && (
            <motion.div
              initial={{ opacity: 0, y: isMobile ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: isMobile ? 0 : 10 }}
              style={{
                position: isMobile ? 'static' : 'absolute', top: '100%', left: 0, marginTop: 4,
                background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100, display: 'flex', flexDirection: 'column', gap: 4,
                minWidth: 120, marginLeft: isMobile ? 32 : 0,
              }}
            >
              {[
                { id: 'rect', icon: <Ico.Rect/>, label: 'Rectangle' },
                { id: 'ellipse', icon: <Ico.Ellipse/>, label: 'Ellipse' },
                { id: 'line', icon: <Ico.Line/>, label: 'Line' },
                { id: 'arrow', icon: <Ico.Arrow/>, label: 'Arrow' },
              ].map(s => (
                <button key={s.id} onClick={() => { setCurrentTool(s.id); setShowShapes(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    background: currentTool === s.id ? (darkMode ? 'rgba(210,41,75,0.1)' : '#FFF0F2') : 'transparent',
                    color: currentTool === s.id ? '#D2294B' : text,
                    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  }}
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button onClick={() => (window as any).handleInsertImage?.()} style={toolStyle(isActive('image'))}>
        <Ico.Image /><span style={labelStyle}>Image</span>
      </button>

      <button onClick={() => setCurrentTool('sign')} style={toolStyle(isActive('sign'))}>
        <Ico.Sign /><span style={labelStyle}>Sign</span>
      </button>

      {sep}

      {isImageEditor ? (
        <>
          <button onClick={onFilters} style={toolStyle(false)}>
            <Ico.Filter /><span style={labelStyle}>Filters</span>
          </button>
          <button onClick={onCrop} style={toolStyle(isActive('crop'))}>
            <Ico.Crop /><span style={labelStyle}>Crop</span>
          </button>
        </>
      ) : (
        <button onClick={() => setCurrentTool('checkmark')} style={toolStyle(isActive('checkmark'))}>
          <Ico.Check /><span style={labelStyle}>Check</span>
        </button>
      )}

      {isMobile && sep}

      {isMobile && onOcr && (
        <button onClick={onOcr} style={toolStyle(false)}>
          <Ico.Links /><span style={labelStyle}>Magic OCR</span>
        </button>
      )}
    </>
  );

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", position: 'relative', zIndex: 1000 }}>
      {/* ── Header Row ──────────────────────────────────── */}
      <div style={{
        background: headerBg, borderBottom: `1px solid ${border}`, height: isMobile ? '60px' : '52px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px',
        paddingTop: isMobile ? 'env(safe-area-inset-top, 0px)' : 0,
      }}>
        {/* Mobile menu toggle & Back */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isMobile ? (
            <>
              <button onClick={() => setShowMobileMenu(true)} style={{ background: 'none', border: 'none', color: text, padding: 4 }}>
                <Ico.Menu />
              </button>
            </>
          ) : (
            <button onClick={onExport} disabled={exportLoading} style={{
              background: darkMode ? 'rgba(255,255,255,0.05)' : '#f3f4f6', border: `1px solid ${border}`, borderRadius: '8px', 
              padding: '6px 12px', cursor: exportLoading ? 'wait' : 'pointer', 
              display: 'flex', alignItems: 'center', gap: '6px', color: text, fontSize: '13px', fontWeight: 600
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              <span>Back</span>
            </button>
          )}

          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '30px', height: '30px', background: 'linear-gradient(135deg,#D2294B,#a01e38)', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '12px' }}>CP</div>
              <span style={{ fontWeight: 800, color: '#D2294B', fontSize: '15px' }}>campus print</span>
            </div>
          )}
        </div>

        {/* Filename */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          border: `1px solid ${border}`, borderRadius: '8px', padding: '5px 12px',
          background: darkMode ? 'rgba(255,255,255,0.02)' : '#fafafa',
          maxWidth: isMobile ? '140px' : 'auto',
        }}>
          {editingTitle ? (
            <input value={localTitle} onChange={e => setLocalTitle(e.target.value)} onBlur={() => setEditingTitle(false)} autoFocus style={{ border: 'none', borderBottom: '1.5px solid #D2294B', outline: 'none', fontSize: '13px', fontWeight: 600, color: text, background: 'transparent', width: '100%' }} />
          ) : (
            <span style={{ fontSize: '13px', fontWeight: 600, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{localTitle}</span>
          )}
          {!isMobile && (
            <button onClick={() => setEditingTitle(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted, display: 'flex', alignItems: 'center', padding: '1px' }}>
              <Ico.PencilEdit />
            </button>
          )}
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '4px' }}>
          <button onClick={() => setDarkMode(!darkMode)} style={{ background: 'none', border: 'none', color: textMuted, cursor: 'pointer', padding: 8 }}>
            {darkMode ? <Ico.Sun /> : <Ico.Theme />}
          </button>

          {!isMobile && (
            <>
              {[
                { icon: <Ico.Search />, label: 'Search', onClick: onSearch },
                { icon: <Ico.Print />,  label: 'Print',  onClick: () => window.print?.() },
              ].map(btn => (
                <button key={btn.label} onClick={btn.onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '4px 10px', background: 'none', border: 'none', cursor: 'pointer', color: textMuted }}>
                  {btn.icon}<span style={{ fontSize: '10px', fontWeight: 600 }}>{btn.label}</span>
                </button>
              ))}
              <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', background: bg, border: `1px solid ${border}`, borderRadius: '8px', color: text, fontWeight: 600, fontSize: '13px', cursor: 'pointer', marginLeft: '4px' }}>
                <Ico.Cross /><span>Cancel</span>
              </button>
            </>
          )}
          
          <button onClick={onExport} disabled={exportLoading} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: isMobile ? '6px 12px' : '6px 16px', background: '#D2294B', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: exportLoading ? 'wait' : 'pointer', marginLeft: '4px', opacity: exportLoading ? 0.7 : 1 }}>
            <Ico.DoneCheck /><span>{exportLoading ? 'Saving...' : 'Done'}</span>
          </button>
        </div>
      </div>

      {/* ── Main Toolbar (Desktop) ────────────────────────────── */}
      {!isMobile && (
        <div style={{
          background: bg, borderBottom: `1px solid ${border}`, height: '54px',
          display: 'flex', alignItems: 'center', padding: '0 10px', gap: '2px', overflowX: 'auto',
          className: "custom-scrollbar"
        }}>
          <ToolsList />
          {sep}
          {onOcr && (
            <button onClick={onOcr} style={toolStyle(false)}>
              <Ico.Links /><span style={labelStyle}>Magic OCR</span>
            </button>
          )}
        </div>
      )}

      {/* ── Mobile Tools Drawer ────────────────────────────── */}
      <AnimatePresence>
        {isMobile && showMobileMenu && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000 }}
            onClick={() => setShowMobileMenu(false)}
          >
            <motion.div
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              style={{
                width: 280, height: '100%', background: bg, borderRight: `1px solid ${border}`,
                padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px 24px', overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: 4
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <span style={{ fontWeight: 800, color: text, fontSize: '18px' }}>Tools</span>
                <button onClick={() => setShowMobileMenu(false)} style={{ background: 'none', border: 'none', color: textMuted, padding: 4 }}><Ico.Cross /></button>
              </div>

              {/* Mobile Tools Content */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <button onClick={onUndo} disabled={!canUndo} style={{ flex: 1, ...toolStyle(false, !canUndo), justifyContent: 'center' }}><Ico.Undo /> Undo</button>
                <button onClick={onRedo} disabled={!canRedo} style={{ flex: 1, ...toolStyle(false, !canRedo), justifyContent: 'center' }}><Ico.Redo /> Redo</button>
              </div>

              <ToolsList />

              <div style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button onClick={onSearch} style={{ ...toolStyle(false), justifyContent: 'flex-start' }}><Ico.Search /> Search</button>
                <button onClick={onClose} style={{ ...toolStyle(false), color: '#ef4444', justifyContent: 'flex-start' }}><Ico.Cross /> Cancel Edits</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
