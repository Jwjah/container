'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fabric } from 'fabric';
import toast from 'react-hot-toast';

import Toolbar from './Editor/Toolbar';
import CanvasLayer from './Editor/CanvasLayer';
import FontControls from './Editor/FontControls';
import PropertyPanel from './Editor/PropertyPanel';
import SignaturePad from './Editor/SignaturePad';
import ImageFilters from './Editor/ImageFilters';
import CropTool from './Editor/CropTool';
import ColorSampler from './Editor/ColorSampler';
import { UndoRedoManager } from '@/utils/undoRedo';
import { exportCanvas, imageToPdf, sampleSurroundingColor } from '@/utils/conversionUtils';

interface ImageEditorProps {
  file: File;
  onSave: (newFile: File) => void;
  onClose: () => void;
}

export default function ImageEditor({ file, onSave, onClose }: ImageEditorProps) {
  const [imageUrl, setImageUrl] = useState('');
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [currentTool, setCurrentTool] = useState('select');
  const [darkMode, setDarkMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [scale, setScale] = useState(1.0);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
  const [bgImage, setBgImage] = useState<fabric.Image | null>(null);
  
  const [historyManager] = useState(() => new UndoRedoManager<string>(50));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isHandlingHistory = useRef(false);

  // Panels & Tools state
  const [activeObjProps, setActiveObjProps] = useState<any>(null);
  const [showPropertyPanel, setShowPropertyPanel] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const [samplingColor, setSamplingColor] = useState(false);
  const [camouflageColor, setCamouflageColor] = useState('#ffffff');
  
  const [filters, setFilters] = useState({ brightness: 0, contrast: 0, saturation: 0, blur: 0 });

  // Font states
  const [fontFamily, setFontFamily] = useState('Inter');
  const [fontSize, setFontSize] = useState(32);
  const [fontColor, setFontColor] = useState('#D2294B');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [textAlign, setTextAlign] = useState('left');

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      if (containerRef.current) {
        setContainerSize({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load Image
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Adjust scale when image or container size changes
  useEffect(() => {
    if (imageSize.width > 0 && containerSize.width > 0) {
      const padding = isMobile ? 32 : 80;
      const scaleX = (containerSize.width - padding) / imageSize.width;
      const scaleY = (containerSize.height - padding) / imageSize.height;
      let newScale = Math.min(scaleX, scaleY, 1);
      setScale(newScale);
    }
  }, [imageSize, containerSize, isMobile]);

  const saveState = useCallback((canvas: fabric.Canvas) => {
    if (isHandlingHistory.current) return;
    const json = JSON.stringify(canvas.toJSON(['selectable', 'evented']));
    historyManager.push(json);
    setCanUndo(historyManager.canUndo());
    setCanRedo(historyManager.canRedo());
  }, [historyManager]);

  const handleUndo = useCallback(() => {
    const s = historyManager.undo();
    if (s && fabricCanvas) {
      isHandlingHistory.current = true;
      fabricCanvas.loadFromJSON(JSON.parse(s), () => {
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
      fabricCanvas.loadFromJSON(JSON.parse(s), () => {
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
        if (e.shiftKey) { e.preventDefault(); handleRedo(); } 
        else { e.preventDefault(); handleUndo(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const updateActiveObjProps = useCallback((canvas: fabric.Canvas) => {
    const obj = canvas.getActiveObject();
    if (obj) {
      setActiveObjProps({
        type: obj.type, x: obj.left, y: obj.top,
        width: obj.getScaledWidth(), height: obj.getScaledHeight(),
        fill: obj.fill, opacity: obj.opacity || 1, angle: obj.angle || 0,
      });
      setShowPropertyPanel(true);
      
      if (obj.type === 'textbox' || obj.type === 'i-text') {
        const textObj = obj as fabric.Textbox;
        setFontFamily(textObj.fontFamily || 'Inter');
        setFontSize(textObj.fontSize || 32);
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

  const handleCanvasInit = useCallback((canvas: fabric.Canvas) => {
    setFabricCanvas(canvas);
    
    // Set background image
    fabric.Image.fromURL(imageUrl, (img) => {
      setBgImage(img);
      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
        originX: 'left', originY: 'top',
        scaleX: 1, scaleY: 1
      });
      saveState(canvas);
    });

    canvas.on('object:added', () => saveState(canvas));
    canvas.on('object:modified', () => { saveState(canvas); updateActiveObjProps(canvas); });
    canvas.on('object:removed', () => { saveState(canvas); updateActiveObjProps(canvas); });
    canvas.on('selection:created', () => updateActiveObjProps(canvas));
    canvas.on('selection:updated', () => updateActiveObjProps(canvas));
    canvas.on('selection:cleared', () => updateActiveObjProps(canvas));

    // Color Sampler click handler
    canvas.on('mouse:down', (opt) => {
      if ((canvas as any)._samplingColor) {
        const p = canvas.getPointer(opt.e);
        const ctx = canvas.getContext();
        const data = ctx.getImageData(p.x, p.y, 1, 1).data;
        const hex = `#${((1 << 24) + (data[0] << 16) + (data[1] << 8) + data[2]).toString(16).slice(1)}`;
        setCamouflageColor(hex);
        setSamplingColor(false);
        (canvas as any)._samplingColor = false;
        setCurrentTool('camouflage');
        toast.success(`Sampled color: ${hex}. Now draw over the text to hide it.`, { icon: '🎨' });
      }
    });
  }, [imageUrl, saveState, updateActiveObjProps]);

  // Handle Camouflage Tool Click
  useEffect(() => {
    if (currentTool === 'camouflage') {
      if (!fabricCanvas) return;
      if (samplingColor) return;
      // When first selecting camouflage, enter sampling mode
      setSamplingColor(true);
      (fabricCanvas as any)._samplingColor = true;
      setCurrentTool('select');
      toast('Click anywhere on the image to sample the background color to use for hiding text.', { icon: '🔍', duration: 4000 });
    } else if (currentTool === 'sign') {
      setShowSignaturePad(true);
      setCurrentTool('select');
    } else {
      if (fabricCanvas) (fabricCanvas as any)._samplingColor = false;
      setSamplingColor(false);
    }
  }, [currentTool, fabricCanvas, samplingColor]);

  const handleApplyCrop = (cropData: any) => {
    // In a full implementation, this would crop the canvas. 
    // Here we'll show a toast.
    toast.success('Crop applied! (Visual simulation)');
    setShowCrop(false);
  };

  const applyFabricFilter = (filterObj: any, index: number) => {
    if (!bgImage || !fabricCanvas) return;
    if (!bgImage.filters) bgImage.filters = [];
    bgImage.filters[index] = filterObj;
    bgImage.applyFilters();
    fabricCanvas.renderAll();
    saveState(fabricCanvas);
  };

  const handleFilterChange = (key: string, value: number) => {
    setFilters(f => ({ ...f, [key]: value }));
    if (!bgImage || !fabricCanvas) return;
    
    // Convert to fabric filters
    if (key === 'brightness') applyFabricFilter(new fabric.Image.filters.Brightness({ brightness: value / 100 }), 0);
    if (key === 'contrast') applyFabricFilter(new fabric.Image.filters.Contrast({ contrast: value / 100 }), 1);
    if (key === 'saturation') applyFabricFilter(new fabric.Image.filters.Saturation({ saturation: value / 100 }), 2);
    if (key === 'blur') applyFabricFilter(new fabric.Image.filters.Blur({ blur: value / 100 }), 3);
  };

  const handleApplyPreset = (preset: string) => {
    if (!bgImage || !fabricCanvas) return;
    bgImage.filters = []; // Clear previous
    if (preset === 'Grayscale') bgImage.filters.push(new fabric.Image.filters.Grayscale());
    if (preset === 'Sepia') bgImage.filters.push(new fabric.Image.filters.Sepia());
    if (preset === 'Invert') bgImage.filters.push(new fabric.Image.filters.Invert());
    if (preset === 'Vintage') bgImage.filters.push(new (fabric.Image.filters as any).Vintage());
    if (preset === 'Polaroid') bgImage.filters.push(new (fabric.Image.filters as any).Polaroid());
    if (preset === 'Kodachrome') bgImage.filters.push(new (fabric.Image.filters as any).Kodachrome());
    bgImage.applyFilters();
    fabricCanvas.renderAll();
    saveState(fabricCanvas);
    setFilters({ brightness: 0, contrast: 0, saturation: 0, blur: 0 }); // reset sliders
    toast.success(`Applied ${preset} filter`);
  };

  const handleInsertImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const imgFile = e.target.files[0];
      if (!imgFile || !fabricCanvas) return;
      const reader = new FileReader();
      reader.onload = (f) => {
        fabric.Image.fromURL(f.target?.result as string, (img) => {
          img.scaleToWidth(imageSize.width / 3);
          img.set({ left: imageSize.width / 2 - (img.getScaledWidth() / 2), top: imageSize.height / 2 });
          fabricCanvas.add(img);
          fabricCanvas.setActiveObject(img);
          fabricCanvas.renderAll();
          saveState(fabricCanvas);
        });
      };
      reader.readAsDataURL(imgFile);
    };
    input.click();
  };

  useEffect(() => {
    (window as any).handleInsertImage = handleInsertImage;
    return () => { (window as any).handleInsertImage = undefined; };
  }, [fabricCanvas, imageSize]);

  const handleExport = async () => {
    if (!fabricCanvas) return;
    setExporting(true);
    const toastId = toast.loading('Exporting image...');
    try {
      // Original size export
      fabricCanvas.discardActiveObject();
      fabricCanvas.renderAll();
      const ext = file.name.split('.').pop()?.toLowerCase();
      const format = ext === 'png' ? 'png' : 'jpeg';
      const output = await exportCanvas(fabricCanvas, format as any, 1.0);
      onSave(new File([output], file.name.replace(/\.[^/.]+$/, "") + "_edited." + format, { type: output.type }));
      toast.success('Export Successful!', { id: toastId });
    } catch (e) {
      toast.error('Export failed', { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  const handleExportAsPdf = async () => {
    if (!fabricCanvas) return;
    setExporting(true);
    const toastId = toast.loading('Converting to PDF...');
    try {
      fabricCanvas.discardActiveObject();
      fabricCanvas.renderAll();
      const output = await exportCanvas(fabricCanvas, 'png', 1.0);
      const pdf = await imageToPdf(output);
      onSave(new File([pdf], file.name.replace(/\.[^/.]+$/, "") + "_edited.pdf", { type: 'application/pdf' }));
      toast.success('Converted to PDF successfully!', { id: toastId });
    } catch (e) {
      toast.error('Conversion failed', { id: toastId });
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
        onFilters={() => setShowFilters(true)} onCrop={() => setShowCrop(true)}
        darkMode={darkMode} setDarkMode={setDarkMode}
        isImageEditor={true}
      />

      <div ref={containerRef} className="flex flex-1 overflow-hidden relative" style={{ background: workspaceBg }}>
        <div style={{
          flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: isMobile ? '16px' : '40px',
          position: 'relative'
        }}>

          <AnimatePresence>
            {(currentTool === 'text' || (activeObjProps && (activeObjProps.type === 'text' || activeObjProps.type === 'textbox'))) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                style={{ position: 'absolute', top: 20, zIndex: 50 }}
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

          {imageSize.width > 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              style={{
                position: 'relative',
                width: imageSize.width * scale, height: imageSize.height * scale,
                boxShadow: darkMode ? '0 12px 60px rgba(0,0,0,0.8)' : '0 12px 60px rgba(0,0,0,0.15)',
                background: `url('data:image/svg+xml;utf8,<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="${darkMode?'%231f2937':'%23e5e7eb'}"/><rect x="10" y="10" width="10" height="10" fill="${darkMode?'%231f2937':'%23e5e7eb'}"/></svg>')`
              }}
            >
              <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
                <CanvasLayer 
                  width={imageSize.width} height={imageSize.height} 
                  onCanvasInit={handleCanvasInit} currentTool={currentTool} 
                  fontFamily={fontFamily} fontSize={fontSize} fontColor={fontColor}
                  isBold={isBold} isItalic={isItalic} isUnderline={isUnderline} isStrikethrough={isStrikethrough}
                  textAlign={textAlign} camouflageColor={camouflageColor}
                />
              </div>
            </motion.div>
          )}

          {/* Controls Bar */}
          <div style={{
            position: 'absolute', bottom: isMobile ? 32 : 24, left: '50%', transform: 'translateX(-50%)',
            background: darkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(10px)',
            borderRadius: '999px', boxShadow: darkMode ? '0 8px 32px rgba(0,0,0,0.4)' : '0 4px 24px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px',
            zIndex: 500, border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb'}`,
          }}>
            <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))}
              style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: darkMode ? '#e5e7eb' : '#374151', fontSize: '20px', fontWeight: 300 }}
            >−</button>
            <span style={{ fontSize: '13px', fontWeight: 700, color: darkMode ? '#fff' : '#374151', minWidth: '44px', textAlign: 'center' }}>
              {Math.round(scale * 100)}%
            </span>
            <button onClick={() => setScale(s => Math.min(3, s + 0.1))}
              style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: darkMode ? '#e5e7eb' : '#374151', fontSize: '20px', fontWeight: 300 }}
            >+</button>

            <div style={{ width: '1px', height: '22px', background: darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb', margin: '0 4px' }} />

            <button onClick={handleExportAsPdf} disabled={exporting}
              style={{ padding: '4px 12px', background: 'rgba(210,41,75,0.1)', color: '#D2294B', border: '1px solid rgba(210,41,75,0.3)', borderRadius: '16px', fontSize: '12px', fontWeight: 700, cursor: exporting ? 'wait' : 'pointer' }}>
              Save as PDF
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
        isOpen={showSignaturePad} onClose={() => setShowSignaturePad(false)}
        onInsert={(dataUrl) => {
          if (!fabricCanvas) return;
          fabric.Image.fromURL(dataUrl, (img) => {
            img.scaleToWidth(imageSize.width / 3);
            img.set({ left: imageSize.width / 2 - (img.getScaledWidth() / 2), top: imageSize.height / 2 });
            fabricCanvas.add(img); fabricCanvas.setActiveObject(img); fabricCanvas.renderAll(); saveState(fabricCanvas);
          });
        }}
        darkMode={darkMode}
      />

      <ImageFilters 
        visible={showFilters} onClose={() => setShowFilters(false)}
        filters={filters} onFilterChange={handleFilterChange} onApplyPreset={handleApplyPreset}
        darkMode={darkMode}
      />

      <CropTool 
        visible={showCrop} onApply={handleApplyCrop} onCancel={() => setShowCrop(false)}
        imageWidth={imageSize.width} imageHeight={imageSize.height}
      />

      <ColorSampler 
        visible={samplingColor} onColorPicked={(c) => { setCamouflageColor(c); setSamplingColor(false); }}
        onCancel={() => { setSamplingColor(false); setCurrentTool('select'); }}
      />
    </motion.div>
  );
}
