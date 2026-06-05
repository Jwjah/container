'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { fabric } from 'fabric';
import toast from 'react-hot-toast';

import Toolbar from './Editor/Toolbar';
import PdfViewer from './Editor/PdfViewer';
import CanvasLayer from './Editor/CanvasLayer';
import FontControls from './Editor/FontControls';
import PropertyPanel from './Editor/PropertyPanel';
import SignaturePad from './Editor/SignaturePad';
import { UndoRedoManager } from '@/utils/undoRedo';
import {
  groupTextItems,
  isScannedPage,
  ocrPageToBlocks,
  preprocessCanvasForOCR,
  renderPageToCanvas,
} from '@/utils/textGrouping';

interface PDFEditorProps {
  file: File;
  onSave: (newFile: File) => void;
  onClose: () => void;
}

export default function PDFEditor({ file, onSave, onClose }: PDFEditorProps) {
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [currentTool, setCurrentTool] = useState('select');
  const [showThumbnails, setShowThumbnails] = useState(false); // Default hidden on mobile
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
  const [annotations, setAnnotations] = useState<Record<number, any>>({});
  const [historyManager] = useState(() => new UndoRedoManager<string>(100));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  const isHandlingHistory = useRef(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [scannedPages, setScannedPages] = useState<Set<number>>(new Set());
  const [showOcrBanner, setShowOcrBanner] = useState(false);
  const pageRef = useRef<any>(null);

  // Active object properties
  const [activeObjProps, setActiveObjProps] = useState<any>(null);
  const [showPropertyPanel, setShowPropertyPanel] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  // Font states
  const [fontFamily, setFontFamily] = useState('Helvetica');
  const [fontSize, setFontSize] = useState(16);
  const [fontColor, setFontColor] = useState('#000000');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [textAlign, setTextAlign] = useState('left');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    setShowThumbnails(window.innerWidth >= 768); // Show by default on desktop
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      toast.error('Text not found on this page');
    }
    setShowSearchModal(false);
  };

  // Load PDF
  useEffect(() => {
    const load = async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setPdfBytes(bytes);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      setPdfUrl(url);
      setLoading(false);
    };
    load();
    return () => URL.revokeObjectURL(pdfUrl);
  }, [file]);

  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  const saveState = useCallback((canvas: fabric.Canvas) => {
    if (isHandlingHistory.current) return;
    const json = JSON.stringify(canvas.toJSON());
    const newAnnotations = { ...annotationsRef.current, [currentPageRef.current]: json };
    setAnnotations(newAnnotations);
    
    historyManager.push(JSON.stringify({ page: currentPageRef.current, annotations: newAnnotations }));
    setCanUndo(historyManager.canUndo());
    setCanRedo(historyManager.canRedo());
  }, [historyManager]);

  const handleUndo = useCallback(() => {
    const s = historyManager.undo();
    if (s) {
      const state = JSON.parse(s);
      setAnnotations(state.annotations);
      setCanUndo(historyManager.canUndo());
      setCanRedo(historyManager.canRedo());
      if (fabricCanvas) {
        isHandlingHistory.current = true;
        const pageData = state.annotations[currentPageRef.current];
        if (pageData) {
          fabricCanvas.loadFromJSON(pageData, () => {
            fabricCanvas.renderAll();
            isHandlingHistory.current = false;
          });
        } else {
          fabricCanvas.clear();
          fabricCanvas.renderAll();
          isHandlingHistory.current = false;
        }
      }
    }
  }, [historyManager, fabricCanvas]);

  const handleRedo = useCallback(() => {
    const s = historyManager.redo();
    if (s) {
      const state = JSON.parse(s);
      setAnnotations(state.annotations);
      setCanUndo(historyManager.canUndo());
      setCanRedo(historyManager.canRedo());
      if (fabricCanvas) {
        isHandlingHistory.current = true;
        const pageData = state.annotations[currentPageRef.current];
        if (pageData) {
          fabricCanvas.loadFromJSON(pageData, () => {
            fabricCanvas.renderAll();
            isHandlingHistory.current = false;
          });
        } else {
          fabricCanvas.clear();
          fabricCanvas.renderAll();
          isHandlingHistory.current = false;
        }
      }
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

  const updateActiveObjProps = useCallback((canvas: fabric.Canvas) => {
    const obj = canvas.getActiveObject();
    if (obj) {
      setActiveObjProps({
        type: obj.type,
        x: obj.left, y: obj.top,
        width: obj.getScaledWidth(), height: obj.getScaledHeight(),
        fill: obj.fill, opacity: obj.opacity || 1, angle: obj.angle || 0,
      });
      setShowPropertyPanel(true);
      
      if (obj.type === 'textbox' || obj.type === 'i-text') {
        const textObj = obj as fabric.Textbox;
        setFontFamily(textObj.fontFamily || 'Helvetica');
        setFontSize(textObj.fontSize || 16);
        setFontColor(textObj.fill as string || '#000000');
        setIsBold(textObj.fontWeight === 'bold');
        setIsItalic(textObj.fontStyle === 'italic');
        setIsUnderline(!!textObj.underline);
        setIsStrikethrough(!!textObj.linethrough);
        setTextAlign(textObj.textAlign || 'left');
      }
    } else {
      setShowPropertyPanel(false);
      setActiveObjProps(null);
    }
  }, []);

  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;

  const handleCanvasInit = useCallback((canvas: fabric.Canvas) => {
    setFabricCanvas(canvas);
    canvas.on('object:added', () => saveStateRef.current(canvas));
    canvas.on('object:modified', () => {
      saveStateRef.current(canvas);
      updateActiveObjProps(canvas);
    });
    canvas.on('object:removed', () => {
      saveStateRef.current(canvas);
      updateActiveObjProps(canvas);
    });
    canvas.on('selection:created', () => updateActiveObjProps(canvas));
    canvas.on('selection:updated', () => updateActiveObjProps(canvas));
    canvas.on('selection:cleared', () => updateActiveObjProps(canvas));
  }, [updateActiveObjProps]);

  // Page Change Effect
  useEffect(() => {
    if (fabricCanvas) {
      isHandlingHistory.current = true;
      try {
        if ((fabricCanvas as any).contextContainer) {
          fabricCanvas.clear();
        }
        const saved = annotations[currentPage];
        if (saved) {
          fabricCanvas.loadFromJSON(saved, () => {
            fabricCanvas.renderAll();
            isHandlingHistory.current = false;
          });
        } else {
          isHandlingHistory.current = false;
        }
      } catch (err) {
        isHandlingHistory.current = false;
      }
    }
  }, [currentPage, fabricCanvas, annotations]);

  useEffect(() => {
    if (currentTool === 'sign') {
      setShowSignaturePad(true);
      setCurrentTool('select');
    }
  }, [currentTool]);

  const onPageLoadSuccess = async (page: any) => {
    const viewport = page.getViewport({ scale });
    setPageSize({ width: viewport.width, height: viewport.height });
    pageRef.current = page;
    
    if (!annotations[currentPage] && fabricCanvas && (fabricCanvas as any).contextContainer) {
      isHandlingHistory.current = true;
      try {
        const textContent = await page.getTextContent();
        const scanned = isScannedPage(textContent);

        if (scanned) {
          setScannedPages(prev => new Set(prev).add(currentPage));
          setShowOcrBanner(true);
        } else {
          const blocks = groupTextItems(textContent.items, viewport);
          blocks.forEach(block => {
            const whiteout = new fabric.Rect({
              left: block.x, top: block.y, width: block.width * 1.05, height: block.height,
              fill: 'white', selectable: false, evented: false
            });
            const textbox = new fabric.Textbox(block.text, {
              left: block.x, top: block.y, width: block.width * 1.1,
              fontSize: block.fontSize, fontFamily: 'Helvetica',
              fill: '#000', backgroundColor: 'transparent', editable: true
            });
            fabricCanvas.add(whiteout, textbox);
          });
        }
        
        if (fabricCanvas && (fabricCanvas as any).contextContainer) {
          fabricCanvas.renderAll();
          const json = fabricCanvas.toJSON();
          setAnnotations(prev => ({ ...prev, [currentPage]: json }));
        }
      } catch (err) {
        console.error('Reconstruction failed:', err);
      } finally {
        isHandlingHistory.current = false;
      }
    }
  };

  const runOcrOnCurrentPage = async () => {
    if (!pageRef.current || !fabricCanvas) return;
    setOcrRunning(true);
    setOcrProgress(0);
    const toastId = toast.loading('Running OCR — extracting text...');
    try {
      const rawCanvas = await renderPageToCanvas(pageRef.current, 2.0);
      const processed = preprocessCanvasForOCR(rawCanvas);
      const viewport = pageRef.current.getViewport({ scale });
      const blocks = await ocrPageToBlocks(
        processed, viewport.width, viewport.height, 'eng',
        (p: number) => setOcrProgress(p)
      );
      if (blocks.length === 0) {
        toast.error('No text detected on this page', { id: toastId });
        return;
      }
      isHandlingHistory.current = true;
      blocks.forEach(block => {
        const whiteout = new fabric.Rect({
          left: block.x, top: block.y, width: block.width * 1.05, height: block.height,
          fill: 'white', selectable: false, evented: false, opacity: 0.85
        });
        const textbox = new fabric.Textbox(block.text, {
          left: block.x, top: block.y, width: block.width * 1.15,
          fontSize: block.fontSize, fontFamily: 'Helvetica',
          fill: '#000', backgroundColor: 'transparent', editable: true
        });
        fabricCanvas.add(whiteout, textbox);
      });
      fabricCanvas.renderAll();
      saveState(fabricCanvas);
      isHandlingHistory.current = false;
      setShowOcrBanner(false);
      toast.success(`Extracted ${blocks.length} text blocks via OCR!`, { id: toastId });
    } catch (err) {
      toast.error('OCR failed — try again', { id: toastId });
    } finally {
      setOcrRunning(false);
      setOcrProgress(0);
    }
  };

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

  const handleExport = async () => {
    if (!pdfBytes) return;
    setExporting(true);
    const toastId = toast.loading('Exporting document...');
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();

      for (let i = 0; i < pages.length; i++) {
        const pageAnnos = annotations[i + 1];
        if (!pageAnnos?.objects) continue;
        const page = pages[i];
        const { width, height } = page.getSize();
        
        const renderedWidth = pageSize.width || width;
        const renderedHeight = pageSize.height || height;
        
        const scaleX = width / (renderedWidth / scale);
        const scaleY = height / (renderedHeight / scale);

        for (const obj of pageAnnos.objects) {
          const x = obj.left * scaleX;
          const y = (renderedHeight / scale - obj.top) * scaleY;
          if (obj.type === 'textbox' || obj.type === 'text') {
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            page.drawText(obj.text, { 
                x, y: y - (obj.fontSize * scaleY), 
                size: obj.fontSize * scaleY, font, color: rgb(0,0,0) 
            });
          } else if (obj.type === 'rect') {
            page.drawRectangle({ 
                x, y: y - (obj.height * scaleY), 
                width: obj.width * scaleX, height: obj.height * scaleY, 
                color: obj.fill === 'transparent' ? undefined : (obj.fill === '#ffffff' || obj.fill === 'white' ? rgb(1,1,1) : rgb(0,0,0)),
                borderWidth: obj.stroke ? obj.strokeWidth : 0,
            });
          }
        }
      }

      const bytes = await pdfDoc.save();
      onSave(new File([bytes as any], file.name.replace(/\.[^/.]+$/, "") + "_edited.pdf", { type: 'application/pdf' }));
      toast.success('Export Successful!', { id: toastId });
    } catch (e) {
      toast.error('Export failed', { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  const bgStyle = darkMode ? '#050510' : '#f0f2f5';
  const workspaceBg = darkMode ? '#0a0a1a' : '#e8eaed';

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
      className="fixed inset-0 z-[9999] flex flex-col overflow-hidden"
      style={{ background: bgStyle, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <Toolbar 
        title={file.name}
        currentTool={currentTool} setCurrentTool={setCurrentTool}
        onUndo={handleUndo} onRedo={handleRedo} canUndo={canUndo} canRedo={canRedo}
        onExport={handleExport} onClose={onClose} exportLoading={exporting}
        onSearch={() => setShowSearchModal(true)} onOcr={runOcrOnCurrentPage}
        showThumbnails={showThumbnails} setShowThumbnails={setShowThumbnails}
        darkMode={darkMode} setDarkMode={setDarkMode}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Thumbnails Sidebar / Drawer */}
        <AnimatePresence>
          {showThumbnails && (
            <>
              {isMobile && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }}
                  onClick={() => setShowThumbnails(false)}
                />
              )}
              <motion.div 
                initial={{ x: -240 }} animate={{ x: 0 }} exit={{ x: -240 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                style={{
                  position: isMobile ? 'absolute' : 'relative',
                  top: 0, bottom: 0, left: 0, zIndex: 101,
                  width: '200px', background: darkMode ? '#0f0f23' : '#fff',
                  borderRight: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb'}`,
                  overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '16px'
                }}
                className="custom-scrollbar"
                onClick={e => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', fontWeight: 700 }}>Pages</span>
                  {isMobile && (
                    <button onClick={() => setShowThumbnails(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', padding: 4 }}>✕</button>
                  )}
                </div>
                {pdfUrl && Array.from(new Array(numPages), (_, i) => (
                  <div
                    key={i} onClick={() => { setCurrentPage(i + 1); if(isMobile) setShowThumbnails(false); }}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}
                  >
                    <div style={{
                      width: '100%', aspectRatio: '3/4', borderRadius: '6px', overflow: 'hidden', background: '#fff',
                      boxShadow: currentPage === i+1 ? '0 0 0 2px #D2294B, 0 4px 12px rgba(0,0,0,0.2)' : '0 1px 4px rgba(0,0,0,0.1)',
                      transition: 'box-shadow 0.2s',
                    }}>
                      <div style={{ transform: 'scale(0.25)', transformOrigin: 'top left', width: '400%', height: '400%', pointerEvents: 'none' }}>
                        <PdfViewer pdfUrl={pdfUrl} currentPage={i+1} scale={1} onLoadSuccess={()=>{}} onPageLoadSuccess={()=>{}} />
                      </div>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: currentPage === i+1 ? '#D2294B' : '#9ca3af', textTransform: 'uppercase' }}>
                      {i + 1}
                    </span>
                  </div>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Main Canvas Area */}
        <div style={{
          flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column',
          alignItems: 'center', padding: isMobile ? '20px 10px 100px' : '40px 40px 100px',
          background: workspaceBg, position: 'relative'
        }}>
          {/* Mobile 3-dot menu toggle for thumbnails */}
          {isMobile && !showThumbnails && (
            <button
              onClick={() => setShowThumbnails(true)}
              style={{
                position: 'fixed', top: '76px', left: '16px', zIndex: 90,
                width: 44, height: 44, borderRadius: '50%', background: darkMode ? '#1f2937' : '#fff',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: darkMode ? '#f3f4f6' : '#374151'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
            </button>
          )}

          {/* Font Controls Row (if text tool is active or text is selected) */}
          <AnimatePresence>
            {(currentTool === 'text' || (activeObjProps && (activeObjProps.type === 'text' || activeObjProps.type === 'textbox'))) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                style={{ position: 'sticky', top: isMobile ? 10 : 20, zIndex: 50, marginBottom: 20 }}
              >
                <FontControls
                  fontFamily={fontFamily} fontSize={fontSize} fontColor={fontColor}
                  isBold={isBold} isItalic={isItalic} isUnderline={isUnderline} isStrikethrough={isStrikethrough}
                  textAlign={textAlign} onFontFamilyChange={setFontFamily} onFontSizeChange={setFontSize}
                  onFontColorChange={setFontColor} onBoldToggle={() => setIsBold(!isBold)}
                  onItalicToggle={() => setIsItalic(!isItalic)} onUnderlineToggle={() => setIsUnderline(!isUnderline)}
                  onStrikethroughToggle={() => setIsStrikethrough(!isStrikethrough)} onTextAlignChange={setTextAlign}
                  darkMode={darkMode}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {!loading && pdfUrl && (
              <motion.div 
                key={currentPage}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                style={{ position: 'relative', boxShadow: darkMode ? '0 8px 40px rgba(0,0,0,0.6)' : '0 8px 40px rgba(0,0,0,0.18)', transition: 'transform 0.2s' }}
              >
                <PdfViewer 
                  pdfUrl={pdfUrl} currentPage={currentPage} scale={isMobile ? Math.min(scale, (window.innerWidth - 32) / (pageSize.width || window.innerWidth)) : scale} 
                  onLoadSuccess={({numPages}: {numPages: number}) => setNumPages(numPages)}
                  onPageLoadSuccess={onPageLoadSuccess}
                >
                  {pageSize.width > 0 && (
                    <CanvasLayer 
                      width={pageSize.width} height={pageSize.height} 
                      onCanvasInit={handleCanvasInit} currentTool={currentTool} 
                      fontFamily={fontFamily} fontSize={fontSize} fontColor={fontColor}
                      isBold={isBold} isItalic={isItalic} isUnderline={isUnderline} isStrikethrough={isStrikethrough}
                      textAlign={textAlign}
                    />
                  )}
                </PdfViewer>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Floating Bottom Bar ─────────────────────────── */}
          <div style={{
            position: 'fixed', bottom: isMobile ? '32px' : '24px', left: '50%', transform: 'translateX(-50%)',
            background: darkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(10px)',
            borderRadius: '999px', boxShadow: darkMode ? '0 8px 32px rgba(0,0,0,0.4)' : '0 4px 24px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 16px',
            zIndex: 500, border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb'}`,
          }}>
            <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
              style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: darkMode ? '#e5e7eb' : '#374151', fontSize: '20px', fontWeight: 300, lineHeight: 1 }}
            >−</button>
            <span style={{ fontSize: '13px', fontWeight: 700, color: darkMode ? '#fff' : '#374151', minWidth: '44px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(scale * 100)}%
            </span>
            <button onClick={() => setScale(s => Math.min(3, s + 0.25))}
              style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: darkMode ? '#e5e7eb' : '#374151', fontSize: '20px', fontWeight: 300, lineHeight: 1 }}
            >+</button>

            <div style={{ width: '1px', height: '22px', background: darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb', margin: '0 8px' }} />

            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
              style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'none', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: currentPage <= 1 ? (darkMode ? '#4b5563' : '#d1d5db') : (darkMode ? '#e5e7eb' : '#374151') }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span style={{ fontSize: '13px', fontWeight: 600, color: darkMode ? '#fff' : '#374151', minWidth: '64px', textAlign: 'center' }}>
              {currentPage} / {numPages}
            </span>
            <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}
              style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'none', cursor: currentPage >= numPages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: currentPage >= numPages ? (darkMode ? '#4b5563' : '#d1d5db') : (darkMode ? '#e5e7eb' : '#374151') }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      </div>

      <PropertyPanel
        visible={showPropertyPanel && !!activeObjProps}
        {...activeObjProps}
        onFillChange={(v: string) => { if (fabricCanvas) { fabricCanvas.getActiveObject()?.set('fill', v); fabricCanvas.renderAll(); saveState(fabricCanvas); updateActiveObjProps(fabricCanvas); }}}
        onOpacityChange={(v: number) => { if (fabricCanvas) { fabricCanvas.getActiveObject()?.set('opacity', v); fabricCanvas.renderAll(); saveState(fabricCanvas); updateActiveObjProps(fabricCanvas); }}}
        onDelete={() => { if (fabricCanvas) { fabricCanvas.getActiveObjects().forEach(o => fabricCanvas.remove(o)); fabricCanvas.discardActiveObject(); fabricCanvas.renderAll(); saveState(fabricCanvas); }}}
        onDuplicate={() => { if (fabricCanvas) { fabricCanvas.getActiveObject()?.clone((cloned: any) => { cloned.set({ left: cloned.left + 20, top: cloned.top + 20, evented: true }); fabricCanvas.add(cloned); fabricCanvas.setActiveObject(cloned); fabricCanvas.renderAll(); saveState(fabricCanvas); }); }}}
        onBringForward={() => { if (fabricCanvas) { fabricCanvas.getActiveObject()?.bringForward(); fabricCanvas.renderAll(); saveState(fabricCanvas); }}}
        onSendBackward={() => { if (fabricCanvas) { fabricCanvas.getActiveObject()?.sendBackwards(); fabricCanvas.renderAll(); saveState(fabricCanvas); }}}
        onFlipH={() => { if (fabricCanvas) { const obj = fabricCanvas.getActiveObject(); if (obj) { obj.set('flipX', !obj.flipX); fabricCanvas.renderAll(); saveState(fabricCanvas); }}}}
        onFlipV={() => { if (fabricCanvas) { const obj = fabricCanvas.getActiveObject(); if (obj) { obj.set('flipY', !obj.flipY); fabricCanvas.renderAll(); saveState(fabricCanvas); }}}}
        darkMode={darkMode}
        panelPosition={isMobile ? { top: 120, left: 16 } : undefined}
      />

      <SignaturePad
        isOpen={showSignaturePad}
        onClose={() => setShowSignaturePad(false)}
        onInsert={(dataUrl) => {
          if (!fabricCanvas) return;
          fabric.Image.fromURL(dataUrl, (img) => {
            img.scaleToWidth(200);
            const view = pageRef.current?.getViewport({ scale });
            img.set({ left: (view?.width || 400) / 2 - 100, top: (view?.height || 600) / 2 });
            fabricCanvas.add(img);
            fabricCanvas.setActiveObject(img);
            fabricCanvas.renderAll();
            saveState(fabricCanvas);
          });
        }}
        darkMode={darkMode}
      />

      {/* OCR Banner for scanned/handwritten pages */}
      {showOcrBanner && scannedPages.has(currentPage) && (
        <div style={{
          position: 'fixed', top: '120px', left: '50%', transform: 'translateX(-50%)',
          background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: '12px',
          padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)', zIndex: 10002, maxWidth: '520px',
        }}>
          <span style={{ fontSize: '22px' }}>📝</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#92400e' }}>Scanned Page Detected</div>
            <div style={{ fontSize: '12px', color: '#a16207', marginTop: '2px' }}>No selectable text found. Run OCR to extract.</div>
          </div>
          <button onClick={runOcrOnCurrentPage} disabled={ocrRunning}
            style={{ padding: '7px 16px', background: '#f59e0b', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, fontSize: '12px', cursor: ocrRunning ? 'wait' : 'pointer' }}>
            {ocrRunning ? `OCR ${ocrProgress}%` : '✨ Run OCR'}
          </button>
          <button onClick={() => setShowOcrBanner(false)}
            style={{ background: 'none', border: 'none', color: '#a16207', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>
      )}

      {showSearchModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: darkMode ? '#1f2937' : '#fff', padding: '24px', borderRadius: '16px', border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`, width: '384px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ color: darkMode ? '#fff' : '#111827', fontWeight: 700, marginBottom: '16px', fontSize: '16px' }}>Find &amp; Replace</h3>
            <input 
              style={{ width: '100%', background: darkMode ? '#374151' : '#f9fafb', border: `1px solid ${darkMode ? '#4b5563' : '#e5e7eb'}`, borderRadius: '8px', padding: '8px 14px', marginBottom: '10px', color: darkMode ? '#fff' : '#111827', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
              placeholder="Find text..." value={findText} onChange={e => setFindText(e.target.value)}
            />
            <input 
              style={{ width: '100%', background: darkMode ? '#374151' : '#f9fafb', border: `1px solid ${darkMode ? '#4b5563' : '#e5e7eb'}`, borderRadius: '8px', padding: '8px 14px', marginBottom: '16px', color: darkMode ? '#fff' : '#111827', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
              placeholder="Replace with..." value={replaceText} onChange={e => setReplaceText(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginBottom: '14px' }}>
              <button onClick={() => setShowSearchModal(false)} style={{ padding: '8px 16px', background: 'none', border: `1px solid ${darkMode ? '#4b5563' : '#e5e7eb'}`, borderRadius: '8px', color: darkMode ? '#9ca3af' : '#6b7280', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>Cancel</button>
              <button onClick={handleFindReplace} style={{ padding: '8px 18px', background: '#D2294B', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>Replace All</button>
            </div>
            <div style={{ borderTop: `1px solid ${darkMode ? '#374151' : '#f3f4f6'}`, paddingTop: '14px' }}>
              <button onClick={runOcrOnCurrentPage} disabled={ocrRunning}
                style={{ width: '100%', padding: '9px', background: ocrRunning ? 'transparent' : 'rgba(210,41,75,0.1)', border: '1.5px solid #D2294B', borderRadius: '8px', color: '#D2294B', cursor: ocrRunning ? 'wait' : 'pointer', fontWeight: 700, fontSize: '13px' }}>
                {ocrRunning ? `Extracting Text... ${ocrProgress}%` : '✨ Magic OCR — Extract All Text'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: ${darkMode ? '#4b5563' : '#d1d5db'}; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: ${darkMode ? '#6b7280' : '#9ca3af'}; }
      `}</style>
    </motion.div>
  );
}
