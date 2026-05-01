'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';

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
  Ellipse:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><ellipse cx="12" cy="12" rx="10" ry="7"/></svg>,
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
  Redact:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity="0.2"/><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>,
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
  title: string;
  exportLoading?: boolean;
  showThumbnails: boolean;
  setShowThumbnails: (v: boolean) => void;
}

export default function Toolbar({
  currentTool, setCurrentTool, onUndo, onRedo, canUndo, canRedo,
  onExport, onClose, onSearch, onOcr, title, exportLoading,
  showThumbnails, setShowThumbnails,
}: ToolbarProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);

  /* active-tool check – some toolbar buttons set a tool, others are actions */
  const isActive = (id: string) => currentTool === id;

  const toolStyle = (active: boolean, disabled = false): React.CSSProperties => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
    padding: '5px 9px', border: active ? '1.5px solid #D2294B' : '1.5px solid transparent',
    borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer',
    background: active ? '#FFF0F2' : 'transparent',
    color: active ? '#D2294B' : disabled ? '#c4c4c4' : '#374151',
    transition: 'all 0.15s',
    opacity: disabled ? 0.45 : 1,
    minWidth: '48px',
  });

  const labelStyle: React.CSSProperties = {
    fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.01em',
  };

  const sep = <div style={{ width: '1px', height: '36px', background: '#e5e7eb', margin: '0 4px', flexShrink: 0 }} />;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", position: 'sticky', top: 0, zIndex: 1000 }}>

      {/* ── Row 1: Header ──────────────────────────────────── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e5e7eb', height: '52px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px' }}>
          <div style={{
            width: '30px', height: '30px', background: 'linear-gradient(135deg,#D2294B,#a01e38)',
            borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: '12px', letterSpacing: '-0.5px',
          }}>CP</div>
          <span style={{ fontWeight: 800, color: '#D2294B', fontSize: '15px', letterSpacing: '-0.4px' }}>campus print</span>
        </div>

        {/* Filename */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          border: '1px solid #e5e7eb', borderRadius: '8px', padding: '5px 12px', background: '#fafafa',
        }}>
          {editingTitle ? (
            <input
              value={localTitle}
              onChange={e => setLocalTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              autoFocus
              style={{
                border: 'none', borderBottom: '1.5px solid #D2294B', outline: 'none',
                fontSize: '13px', fontWeight: 600, color: '#374151', background: 'transparent', minWidth: '180px',
              }}
            />
          ) : (
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{localTitle}</span>
          )}
          <button
            onClick={() => setEditingTitle(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', padding: '1px' }}
          >
            <Ico.PencilEdit />
          </button>
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '160px', justifyContent: 'flex-end' }}>
          {[
            { icon: <Ico.Search />, label: 'Search', onClick: onSearch },
            { icon: <Ico.Print />,  label: 'Print',  onClick: () => window.print?.() },
            { icon: <Ico.Download />, label: 'Download', onClick: onExport, disabled: exportLoading },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              disabled={btn.disabled}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                padding: '4px 10px', background: 'none', border: 'none', cursor: btn.disabled ? 'wait' : 'pointer',
                color: '#6b7280', borderRadius: '8px', opacity: btn.disabled ? 0.5 : 1,
              }}
            >
              {btn.label === 'Download' && exportLoading
                ? <div style={{ width: '18px', height: '18px', border: '2px solid #e5e7eb', borderTopColor: '#D2294B', borderRadius: '50%', animation: 'pg-spin 0.8s linear infinite' }} />
                : btn.icon}
              <span style={{ fontSize: '10px', fontWeight: 600 }}>{btn.label}</span>
            </button>
          ))}

          <button style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px',
            background: '#fff', border: '1.5px solid #BEAFEA', borderRadius: '8px',
            color: '#5f30e2', fontWeight: 600, fontSize: '13px', cursor: 'pointer', marginLeft: '4px',
          }}>
            <Ico.Share /><span>Share</span>
          </button>

          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px',
              background: '#D2294B', border: 'none', borderRadius: '8px',
              color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer', marginLeft: '4px',
            }}
          >
            <Ico.DoneCheck /><span>Done</span>
          </button>
        </div>
      </div>

      {/* ── Row 2: Main Toolbar ────────────────────────────── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e5e7eb', height: '54px',
        display: 'flex', alignItems: 'center', padding: '0 10px', gap: '2px', overflowX: 'auto',
      }}>
        {/* Thumbnails */}
        <button
          onClick={() => setShowThumbnails(!showThumbnails)}
          style={toolStyle(showThumbnails)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <Ico.Thumbnails /><Ico.ChevDown />
          </div>
          <span style={labelStyle}>Thumbnails</span>
        </button>

        {sep}

        {/* Move */}
        <button onClick={() => setCurrentTool('select')} style={toolStyle(isActive('select'))}>
          <Ico.Move />
          <span style={labelStyle}>Move</span>
        </button>

        {sep}

        {/* Undo */}
        <button onClick={onUndo} disabled={!canUndo} style={toolStyle(false, !canUndo)}>
          <Ico.Undo />
          <span style={labelStyle}>Undo</span>
        </button>
        {/* Redo */}
        <button onClick={onRedo} disabled={!canRedo} style={toolStyle(false, !canRedo)}>
          <Ico.Redo />
          <span style={labelStyle}>Redo</span>
        </button>

        {sep}

        {/* Add Text */}
        <button onClick={() => setCurrentTool('text')} style={toolStyle(isActive('text'))}>
          <Ico.AddText />
          <span style={labelStyle}>Add Text</span>
        </button>
        {/* Edit / Select Text */}
        <button onClick={() => setCurrentTool('select')} style={toolStyle(isActive('select'))}>
          <Ico.EditText />
          <span style={labelStyle}>Edit Text</span>
        </button>
        {/* Eraser */}
        <button onClick={() => setCurrentTool('whiteout')} style={toolStyle(isActive('whiteout'))}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <Ico.Eraser /><Ico.ChevDown />
          </div>
          <span style={labelStyle}>Eraser</span>
        </button>
        {/* Highlight */}
        <button onClick={() => setCurrentTool('highlight')} style={toolStyle(isActive('highlight'))}>
          <Ico.Highlight />
          <span style={labelStyle}>Highlight</span>
        </button>
        {/* Pencil / Draw */}
        <button onClick={() => setCurrentTool('draw')} style={toolStyle(isActive('draw'))}>
          <Ico.Pencil />
          <span style={labelStyle}>Pencil</span>
        </button>
        {/* Image */}
        <button
          onClick={() => (window as any).handleInsertImage?.()}
          style={toolStyle(isActive('image'))}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <Ico.Image /><Ico.ChevDown />
          </div>
          <span style={labelStyle}>Image</span>
        </button>
        {/* Ellipse */}
        <button onClick={() => setCurrentTool('ellipse')} style={toolStyle(isActive('ellipse'))}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <Ico.Ellipse /><Ico.ChevDown />
          </div>
          <span style={labelStyle}>Ellipse</span>
        </button>
        {/* Cross */}
        <button onClick={() => setCurrentTool('cross')} style={toolStyle(isActive('cross'))}>
          <Ico.Cross />
          <span style={labelStyle}>Cross</span>
        </button>
        {/* Check */}
        <button onClick={() => setCurrentTool('checkmark')} style={toolStyle(isActive('checkmark'))}>
          <Ico.Check />
          <span style={labelStyle}>Check</span>
        </button>
        {/* Sign */}
        <button onClick={() => setCurrentTool('sign')} style={toolStyle(isActive('sign'))}>
          <Ico.Sign />
          <span style={labelStyle}>Sign</span>
        </button>
        {/* Annotations / Redact */}
        <button onClick={() => setCurrentTool('redact')} style={toolStyle(isActive('redact'))}>
          <Ico.Annotations />
          <span style={labelStyle}>Annotations</span>
        </button>
        {/* Magic OCR */}
        <button onClick={() => onOcr?.()} style={toolStyle(false)}>
          <Ico.Links />
          <span style={labelStyle}>Magic OCR</span>
        </button>

        {sep}

        {/* More Tools */}
        <button style={toolStyle(false)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <Ico.More /><Ico.ChevDown />
          </div>
          <span style={labelStyle}>More Tools</span>
        </button>
      </div>

      <style>{`
        @keyframes pg-spin { to { transform: rotate(360deg); } }
        button:hover { opacity: 0.85; }
      `}</style>
    </div>
  );
}
