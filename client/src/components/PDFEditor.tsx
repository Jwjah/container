'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { fabric } from 'fabric';
import toast from 'react-hot-toast';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import Toolbar from './Editor/Toolbar';
import PdfViewer from './Editor/PdfViewer';
import CanvasLayer from './Editor/CanvasLayer';
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
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
  const [annotations, setAnnotations] = useState<Record<number, any>>({});
  const [historyManager] = useState(() => new UndoRedoManager<string>());
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

  // Use refs to avoid stale closures in canvas event handlers
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

  // handleCanvasInit must NOT depend on saveState to avoid re-creating canvas
  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;

  const handleCanvasInit = useCallback((canvas: fabric.Canvas) => {
    setFabricCanvas(canvas);
    canvas.on('object:added', () => saveStateRef.current(canvas));
    canvas.on('object:modified', () => saveStateRef.current(canvas));
    canvas.on('object:removed', () => saveStateRef.current(canvas));
  }, []); // Empty deps — canvas never re-creates

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
        console.warn('Canvas clear error:', err);
        isHandlingHistory.current = false;
      }
    }
  }, [currentPage, fabricCanvas, annotations]);

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
      console.error('OCR failed:', err);
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

  // Tool switching is handled entirely by CanvasLayer — no duplicate logic here

  const handleExport = async () => {
    if (!pdfBytes) return;
    setExporting(true);
    const toastId = toast.loading('Exporting document...');
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      for (let i = 0; i < pages.length; i++) {
        const pageAnnos = annotations[i + 1];
        if (!pageAnnos?.objects) continue;
        const page = pages[i];
        const { width, height } = page.getSize();
        
        // Use a default size if pageSize is not yet set (should not happen in practice)
        const renderedWidth = pageSize.width || width;
        const renderedHeight = pageSize.height || height;
        
        const scaleX = width / (renderedWidth / scale);
        const scaleY = height / (renderedHeight / scale);

        for (const obj of pageAnnos.objects) {
          const x = obj.left * scaleX;
          const y = (renderedHeight / scale - obj.top) * scaleY;
          if (obj.type === 'textbox' || obj.type === 'text') {
            page.drawText(obj.text, { 
                x, y: y - (obj.fontSize * scaleY), 
                size: obj.fontSize * scaleY, font, color: rgb(0,0,0) 
            });
          } else if (obj.type === 'rect') {
            page.drawRectangle({ 
                x, y: y - (obj.height * scaleY), 
                width: obj.width * scaleX, height: obj.height * scaleY, 
                color: obj.fill === 'black' ? rgb(0,0,0) : rgb(1,1,1) 
            });
          }
        }
      }

      const bytes = await pdfDoc.save();
      onSave(new File([bytes as any], file.name.replace(/\\.[^/.]+$/, "") + "_edited.pdf", { type: 'application/pdf' }));
      toast.success('Export Successful!', { id: toastId });
    } catch (e) {
      toast.error('Export failed', { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
      className="fixed inset-0 z-[9999] flex flex-col overflow-hidden"
      style={{ background: '#f0f2f5', fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <Toolbar 
        title={file.name}
        currentTool={currentTool} setCurrentTool={setCurrentTool}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo} canRedo={canRedo}
        onExport={handleExport} onClose={onClose} exportLoading={exporting}
        onSearch={() => setShowSearchModal(true)}
        onOcr={runOcrOnCurrentPage}
        showThumbnails={showThumbnails} setShowThumbnails={setShowThumbnails}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Thumbnails Sidebar */}
        {showThumbnails && (
          <motion.div 
            initial={{ x: -240 }} animate={{ x: 0 }} exit={{ x: -240 }}
            style={{ width: '200px', background: '#fff', borderRight: '1px solid #e5e7eb', overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '16px' }}
            className="custom-scrollbar"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '4px' }}>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', fontWeight: 700 }}>Pages</span>
              <div style={{ height: '1px', background: '#f3f4f6', width: '100%' }} />
            </div>
            {pdfUrl && Array.from(new Array(numPages), (_, i) => (
              <div
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}
              >
                <div style={{
                  width: '100%', aspectRatio: '3/4', borderRadius: '6px', overflow: 'hidden', background: '#fff',
                  boxShadow: currentPage === i+1 ? '0 0 0 2px #D2294B, 0 4px 12px rgba(0,0,0,0.12)' : '0 1px 4px rgba(0,0,0,0.12)',
                  transition: 'box-shadow 0.2s',
                }}>
                  <div style={{ transform: 'scale(0.25)', transformOrigin: 'top left', width: '400%', height: '400%' }}>
                    <PdfViewer pdfUrl={pdfUrl} currentPage={i+1} scale={1} onLoadSuccess={()=>{}} onPageLoadSuccess={()=>{}} />
                  </div>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: currentPage === i+1 ? '#D2294B' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {i + 1}
                </span>
              </div>
            ))}
          </motion.div>
        )}

        {/* Main Canvas Area */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 40px 100px', background: '#e8eaed', position: 'relative' }}>
          <AnimatePresence mode="wait">
            {!loading && pdfUrl && (
              <motion.div 
                key={currentPage}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                style={{ position: 'relative', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}
              >
                <PdfViewer 
                  pdfUrl={pdfUrl} currentPage={currentPage} scale={scale} 
                  onLoadSuccess={({numPages}: {numPages: number}) => setNumPages(numPages)}
                  onPageLoadSuccess={onPageLoadSuccess}
                >
                  {pageSize.width > 0 && (
                    <CanvasLayer 
                      width={pageSize.width} height={pageSize.height} 
                      onCanvasInit={handleCanvasInit} currentTool={currentTool} 
                    />
                  )}
                </PdfViewer>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Floating Bottom Bar ─────────────────────────── */}
          <div style={{
            position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
            background: '#fff', borderRadius: '999px', boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 16px',
            zIndex: 500, border: '1px solid #e5e7eb',
          }}>
            {/* Zoom Out */}
            <button
              onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
              style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', fontSize: '20px', fontWeight: 300, lineHeight: 1 }}
            >−</button>
            {/* Zoom % */}
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#374151', minWidth: '44px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(scale * 100)}%
            </span>
            {/* Zoom In */}
            <button
              onClick={() => setScale(s => Math.min(3, s + 0.25))}
              style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', fontSize: '20px', fontWeight: 300, lineHeight: 1 }}
            >+</button>

            <div style={{ width: '1px', height: '22px', background: '#e5e7eb', margin: '0 8px' }} />

            {/* Prev Page */}
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'none', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: currentPage <= 1 ? '#d1d5db' : '#374151' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            {/* Page info */}
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151', minWidth: '64px', textAlign: 'center' }}>
              {currentPage} / {numPages}
            </span>
            {/* Next Page */}
            <button
              onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages}
              style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'none', cursor: currentPage >= numPages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: currentPage >= numPages ? '#d1d5db' : '#374151' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      </div>

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
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#92400e' }}>Scanned / Handwritten Page Detected</div>
            <div style={{ fontSize: '12px', color: '#a16207', marginTop: '2px' }}>No selectable text found. Run OCR to extract and edit text.</div>
          </div>
          <button onClick={runOcrOnCurrentPage} disabled={ocrRunning}
            style={{ padding: '7px 16px', background: '#f59e0b', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, fontSize: '12px', cursor: ocrRunning ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
            {ocrRunning ? `OCR ${ocrProgress}%` : '✨ Run OCR'}
          </button>
          <button onClick={() => setShowOcrBanner(false)}
            style={{ background: 'none', border: 'none', color: '#a16207', cursor: 'pointer', fontSize: '16px', padding: '2px' }}>✕</button>
        </div>
      )}

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
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginBottom: '14px' }}>
              <button onClick={() => setShowSearchModal(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', color: '#6b7280', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>Cancel</button>
              <button onClick={handleFindReplace} style={{ padding: '8px 18px', background: '#D2294B', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>Replace All</button>
            </div>
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '14px' }}>
              <button onClick={runOcrOnCurrentPage} disabled={ocrRunning}
                style={{ width: '100%', padding: '9px', background: ocrRunning ? '#f9fafb' : '#FFF0F2', border: '1.5px solid #D2294B', borderRadius: '8px', color: '#D2294B', cursor: ocrRunning ? 'wait' : 'pointer', fontWeight: 700, fontSize: '13px' }}>
                {ocrRunning ? `Extracting Text... ${ocrProgress}%` : '✨ Magic OCR — Extract All Text'}
              </button>
              <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '6px', textAlign: 'center' }}>Works on scanned PDFs, handwritten pages, and image-based documents.</p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
      `}</style>
    </motion.div>
  );
}
