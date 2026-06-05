'use client';

import React, { useState } from 'react';

const FONT_FAMILIES = [
  'Inter', 'Helvetica', 'Arial', 'Times New Roman', 'Courier New',
  'Georgia', 'Roboto', 'Verdana', 'Trebuchet MS', 'Comic Sans MS',
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

const PRESET_COLORS = [
  '#000000', '#333333', '#666666', '#999999', '#ffffff',
  '#D2294B', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6',
  '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

interface FontControlsProps {
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrikethrough: boolean;
  textAlign: string;
  onFontFamilyChange: (v: string) => void;
  onFontSizeChange: (v: number) => void;
  onFontColorChange: (v: string) => void;
  onBoldToggle: () => void;
  onItalicToggle: () => void;
  onUnderlineToggle: () => void;
  onStrikethroughToggle: () => void;
  onTextAlignChange: (v: string) => void;
  darkMode?: boolean;
}

export default function FontControls({
  fontFamily, fontSize, fontColor, isBold, isItalic, isUnderline, isStrikethrough,
  textAlign, onFontFamilyChange, onFontSizeChange, onFontColorChange,
  onBoldToggle, onItalicToggle, onUnderlineToggle, onStrikethroughToggle,
  onTextAlignChange, darkMode = false,
}: FontControlsProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColor, setCustomColor] = useState(fontColor);

  const bg = darkMode ? '#1a1a2e' : '#ffffff';
  const border = darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb';
  const text = darkMode ? '#f1f5f9' : '#374151';
  const textMuted = darkMode ? '#94a3b8' : '#9ca3af';
  const activeBg = darkMode ? 'rgba(210,41,75,0.15)' : '#FFF0F2';
  const hoverBg = darkMode ? 'rgba(255,255,255,0.05)' : '#f9fafb';
  const inputBg = darkMode ? 'rgba(255,255,255,0.06)' : '#f9fafb';

  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: active ? '1.5px solid #D2294B' : `1px solid ${border}`,
    borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: active ? 700 : 500,
    background: active ? activeBg : 'transparent',
    color: active ? '#D2294B' : text,
    transition: 'all 0.15s',
  });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      padding: '6px 10px', background: bg, borderRadius: 10,
      border: `1px solid ${border}`, boxShadow: darkMode ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.06)',
    }}>
      {/* Font Family */}
      <select
        value={fontFamily}
        onChange={(e) => onFontFamilyChange(e.target.value)}
        style={{
          padding: '4px 8px', fontSize: 12, fontWeight: 500,
          border: `1px solid ${border}`, borderRadius: 6,
          background: inputBg, color: text, cursor: 'pointer',
          fontFamily, maxWidth: 130, outline: 'none',
        }}
      >
        {FONT_FAMILIES.map(f => (
          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
        ))}
      </select>

      {/* Font Size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          onClick={() => onFontSizeChange(Math.max(6, fontSize - 1))}
          style={{ ...btnStyle(false), width: 24, height: 24, fontSize: 16, border: 'none' }}
        >−</button>
        <select
          value={fontSize}
          onChange={(e) => onFontSizeChange(Number(e.target.value))}
          style={{
            padding: '4px 4px', fontSize: 12, fontWeight: 600,
            border: `1px solid ${border}`, borderRadius: 6,
            background: inputBg, color: text, cursor: 'pointer',
            width: 48, textAlign: 'center', outline: 'none',
          }}
        >
          {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          onClick={() => onFontSizeChange(Math.min(120, fontSize + 1))}
          style={{ ...btnStyle(false), width: 24, height: 24, fontSize: 16, border: 'none' }}
        >+</button>
      </div>

      <div style={{ width: 1, height: 24, background: border, margin: '0 2px', flexShrink: 0 }} />

      {/* Bold, Italic, Underline, Strikethrough */}
      <button onClick={onBoldToggle} style={btnStyle(isBold)} title="Bold (⌘B)">
        <strong>B</strong>
      </button>
      <button onClick={onItalicToggle} style={btnStyle(isItalic)} title="Italic (⌘I)">
        <em>I</em>
      </button>
      <button onClick={onUnderlineToggle} style={btnStyle(isUnderline)} title="Underline (⌘U)">
        <span style={{ textDecoration: 'underline' }}>U</span>
      </button>
      <button onClick={onStrikethroughToggle} style={btnStyle(isStrikethrough)} title="Strikethrough">
        <span style={{ textDecoration: 'line-through' }}>S</span>
      </button>

      <div style={{ width: 1, height: 24, background: border, margin: '0 2px', flexShrink: 0 }} />

      {/* Text Color */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          style={{ ...btnStyle(false), position: 'relative' }}
          title="Text Color"
        >
          <span style={{ fontSize: 16, fontWeight: 700 }}>A</span>
          <div style={{
            position: 'absolute', bottom: 2, left: 6, right: 6, height: 3,
            background: fontColor, borderRadius: 2,
          }} />
        </button>
        {showColorPicker && (
          <div
            style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4,
              background: bg, border: `1px solid ${border}`, borderRadius: 10,
              padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100,
              width: 180,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 8 }}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => { onFontColorChange(c); setShowColorPicker(false); }}
                  style={{
                    width: 28, height: 28, borderRadius: 6, border: fontColor === c ? '2px solid #D2294B' : `1px solid ${border}`,
                    background: c, cursor: 'pointer', transition: 'transform 0.1s',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                style={{ width: 32, height: 28, border: 'none', cursor: 'pointer', borderRadius: 4 }}
              />
              <input
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                placeholder="#000000"
                style={{
                  flex: 1, padding: '4px 8px', fontSize: 11, border: `1px solid ${border}`,
                  borderRadius: 6, background: inputBg, color: text, outline: 'none',
                }}
              />
              <button
                onClick={() => { onFontColorChange(customColor); setShowColorPicker(false); }}
                style={{
                  padding: '4px 8px', fontSize: 11, fontWeight: 600,
                  background: '#D2294B', color: '#fff', border: 'none',
                  borderRadius: 6, cursor: 'pointer',
                }}
              >OK</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 24, background: border, margin: '0 2px', flexShrink: 0 }} />

      {/* Text Alignment */}
      {['left', 'center', 'right'].map(align => (
        <button
          key={align}
          onClick={() => onTextAlignChange(align)}
          style={btnStyle(textAlign === align)}
          title={`Align ${align}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {align === 'left' && <>
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/>
              <line x1="3" y1="18" x2="18" y2="18"/>
            </>}
            {align === 'center' && <>
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/>
              <line x1="4" y1="18" x2="20" y2="18"/>
            </>}
            {align === 'right' && <>
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/>
              <line x1="6" y1="18" x2="21" y2="18"/>
            </>}
          </svg>
        </button>
      ))}
    </div>
  );
}
