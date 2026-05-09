'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fabric } from 'fabric';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

import Toolbar from './Editor/Toolbar';
import CanvasLayer from './Editor/CanvasLayer';
import { UndoRedoManager } from '@/utils/undoRedo';

interface ImageEditorProps {
  file: File;
  onSave: (newFile: File) => void;
  onClose: () => void;
}

export default function ImageEditor({ file, onSave, onClose }: ImageEditorProps) {
  const [currentTool, setCurrentTool] = useState('select');
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [canvasSize, setCanvasSize] = useState<{width: number, height: number} | null>(null);

  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
  const [historyManager] = useState(() => new UndoRedoManager<string>());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isHandlingHistory = useRef(false);

  const [showSearchModal, setShowSearchModal] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);

  const handleFindReplace = () => {
    if (!fabricCanvas || !findText) return;
    let count = 0;
    fabricCanvas.getObjects().forEach((obj: any) => {
      if (obj.type === 'textbox' || obj.type === 'text') {
        if (obj.text.includes(findText)) {
          obj.set('text', obj.text.replaceAll(findText, replaceText));
          count++;
        }
      }
    });
    if (count > 0) {
      fabricCanvas.renderAll();
      saveState(fabricCanvas);
      toast.success(`Replaced ${count} occurrences`);
    } else {
      toast.error('Text not found');
    }
    setShowSearchModal(false);
  };

  const runMagicOCR = async () => {
    if (!fabricCanvas) return;
    setOcrLoading(true);
    const Tesseract = (await import('tesseract.js')).default;
    
    // Get the base image data URL
    const imgObj = fabricCanvas.backgroundImage as fabric.Image;
    if (!imgObj) {
      toast.error('No background image found');
      setOcrLoading(false);
      return;
    }

    const toastId = toast.loading('Running AI Magic OCR on image...');
    
    try {
      // Create a temporary canvas to get the exact image bytes
      const canvas = document.createElement('canvas');
      canvas.width = imgObj.width! * imgObj.scaleX!;
      canvas.height = imgObj.height! * imgObj.scaleY!;
      const ctx = canvas.getContext('2d');
      if (imgObj.getElement() && ctx) {
         ctx.drawImage(imgObj.getElement() as CanvasImageSource, 0, 0, canvas.width, canvas.height);
      }
      
      const result = await Tesseract.recognize(canvas.toDataURL(), 'eng');
      const words = (result.data as any).words;
      
      if (!words || words.length === 0) {
        toast.error('No text found in image', { id: toastId });
        return;
      }

      words.forEach((word: any) => {
        const bbox = word.bbox;
        const imgLeft = imgObj.left || 0;
        const imgTop = imgObj.top || 0;
        
        // Create a whiteout rectangle over the original text
        const whiteout = new fabric.Rect({
          left: bbox.x0 + imgLeft,
          top: bbox.y0 + imgTop,
          width: bbox.x1 - bbox.x0,
          height: bbox.y1 - bbox.y0,
          fill: '#ffffff', // Best guess for document backgrounds
          selectable: false,
          evented: false
        });
        
        // Add editable text box
        const textbox = new fabric.Textbox(word.text, {
          left: bbox.x0 + imgLeft,
          top: bbox.y0 + imgTop,
          width: bbox.x1 - bbox.x0,
          fontSize: (bbox.y1 - bbox.y0) * 0.8,
          fontFamily: 'Helvetica',
          fill: '#000000',
          backgroundColor: 'transparent',
          editable: true
        });

        fabricCanvas.add(whiteout, textbox);
      });

      fabricCanvas.renderAll();
      saveState(fabricCanvas);
      toast.success(`Extracted ${words.length} words into editable text!`, { id: toastId });
      setShowSearchModal(false);
    } catch (err) {
      console.error(err);
      toast.error('Magic OCR failed', { id: toastId });
    } finally {
      setOcrLoading(false);
    }
  };

  const saveState = useCallback((canvas: fabric.Canvas) => {
    if (isHandlingHistory.current) return;
    const json = JSON.stringify(canvas.toJSON());
    historyManager.push(json);
    setCanUndo(historyManager.canUndo());
    setCanRedo(historyManager.canRedo());
  }, [historyManager]);

  const handleUndo = useCallback(() => {
    const s = historyManager.undo();
    if (s && fabricCanvas) { 
      isHandlingHistory.current = true; 
      fabricCanvas.loadFromJSON(s, () => { 
        fabricCanvas.renderAll(); 
        isHandlingHistory.current = false; 
        setCanUndo(historyManager.canUndo());
        setCanRedo(historyManager.canRedo());
      }); 
    }
  }, [historyManager, fabricCanvas]);

  const handleRedo = useCallback(() => {
    const s = historyManager.redo();
    if (s && fabricCanvas) { 
      isHandlingHistory.current = true; 
      fabricCanvas.loadFromJSON(s, () => { 
        fabricCanvas.renderAll(); 
        isHandlingHistory.current = false; 
        setCanUndo(historyManager.canUndo());
        setCanRedo(historyManager.canRedo());
      }); 
    }
  }, [historyManager, fabricCanvas]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handleInsertImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file || !fabricCanvas) return;
      const reader = new FileReader();
      reader.onload = (f) => {
        const data = f.target?.result as string;
        fabric.Image.fromURL(data, (img) => {
          img.scaleToWidth(200);
          fabricCanvas.add(img);
          fabricCanvas.setActiveObject(img);
          fabricCanvas.renderAll();
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  useEffect(() => {
    (window as any).handleInsertImage = handleInsertImage;
    return () => { (window as any).handleInsertImage = undefined; };
  }, [fabricCanvas]);

  useEffect(() => {
    // Calculate size once before rendering the canvas
    const imgUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = imgUrl;
    img.onload = () => {
      const maxWidth = window.innerWidth * 0.8;
      const maxHeight = window.innerHeight * 0.7;
      const imgScale = Math.min(maxWidth / img.width, maxHeight / img.height);
      setCanvasSize({ width: img.width * imgScale, height: img.height * imgScale });
    };
    return () => URL.revokeObjectURL(imgUrl);
  }, [file]);

  useEffect(() => {
    if (!fabricCanvas) return;
    fabricCanvas.isDrawingMode = currentTool === 'draw' || currentTool === 'whiteout';
    if (currentTool === 'draw') {
      fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
      fabricCanvas.freeDrawingBrush.width = 4;
      fabricCanvas.freeDrawingBrush.color = '#6366f1';
    } else if (currentTool === 'whiteout') {
      fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
      fabricCanvas.freeDrawingBrush.width = 20;
      fabricCanvas.freeDrawingBrush.color = '#ffffff'; // Whiteout erase
    }
  }, [currentTool, fabricCanvas]);

  const handleCanvasInit = useCallback((canvas: fabric.Canvas) => {
    setFabricCanvas(canvas);
    
    const imgUrl = URL.createObjectURL(file);
    fabric.Image.fromURL(imgUrl, (img) => {
      if (canvas.width && canvas.height && img.width && img.height) {
        const scaleX = canvas.width / img.width;
        const scaleY = canvas.height / img.height;
        img.set({ scaleX, scaleY });
      }
      canvas.setBackgroundImage(img, () => {
        canvas.renderAll();
        setLoading(false);
        saveState(canvas);
      });
    });

    canvas.on('object:added', () => saveState(canvas));
    canvas.on('object:modified', () => saveState(canvas));
    canvas.on('object:removed', () => saveState(canvas));

    return () => URL.revokeObjectURL(imgUrl);
  }, [file, saveState]);

  const handleExport = () => {
    if (!fabricCanvas) return;
    setExporting(true);
    const dataUrl = fabricCanvas.toDataURL({ format: 'png', quality: 1 });
    fetch(dataUrl)
      .then(res => res.blob())
      .then(blob => {
        onSave(new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_edited.png", { type: 'image/png' }));
        toast.success('Export Successful!');
      })
      .finally(() => setExporting(false));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ background: '#f0f2f5', fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <Toolbar 
        title={file.name}
        currentTool={currentTool} setCurrentTool={setCurrentTool}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo} canRedo={canRedo}
        onExport={handleExport} onClose={onClose} onBack={handleExport} exportLoading={exporting}
        onSearch={() => setShowSearchModal(true)}
        showThumbnails={showThumbnails} setShowThumbnails={setShowThumbnails}
      />

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px 40px 100px', background: '#e8eaed', position: 'relative' }}>
        {canvasSize && (
          <div style={{ position: 'relative', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', background: '#fff' }}>
            <CanvasLayer 
              width={canvasSize.width} height={canvasSize.height} 
              onCanvasInit={handleCanvasInit} currentTool={currentTool} 
            />
          </div>
        )}

        {/* Floating Bottom Bar */}
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: '#fff', borderRadius: '999px', boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 16px',
          zIndex: 500, border: '1px solid #e5e7eb',
        }}>
          <button onClick={() => setScale(s => Math.max(0.25, s - 0.25))}
            style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', color: '#374151', fontSize: '20px', fontWeight: 300 }}>−</button>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#374151', minWidth: '44px', textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.25))}
            style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', color: '#374151', fontSize: '20px', fontWeight: 300 }}>+</button>
        </div>
      </div>

      {showSearchModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e5e7eb', width: '384px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ color: '#111827', fontWeight: 700, marginBottom: '16px', fontSize: '16px' }}>Find &amp; Replace</h3>
            <input
              style={{ width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 14px', marginBottom: '10px', color: '#111827', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
              placeholder="Find text..." value={findText} onChange={e => setFindText(e.target.value)}
            />
            <input
              style={{ width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 14px', marginBottom: '16px', color: '#111827', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
              placeholder="Replace with..." value={replaceText} onChange={e => setReplaceText(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button onClick={() => setShowSearchModal(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', color: '#6b7280', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>Cancel</button>
              <button onClick={handleFindReplace} style={{ padding: '8px 18px', background: '#D2294B', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>Replace All</button>
            </div>
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
              <button onClick={runMagicOCR} disabled={ocrLoading} style={{ width: '100%', padding: '9px', background: ocrLoading ? '#f9fafb' : '#FFF0F2', border: '1.5px solid #D2294B', borderRadius: '8px', color: '#D2294B', cursor: ocrLoading ? 'wait' : 'pointer', fontWeight: 700, fontSize: '13px' }}>
                {ocrLoading ? 'Extracting Text...' : '✨ Magic Edit (Auto OCR)'}
              </button>
              <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '8px', textAlign: 'center' }}>Automatically extracts text from the image into editable text boxes using Tesseract AI.</p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
