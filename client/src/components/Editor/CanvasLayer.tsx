'use client';

import React, { useEffect, useRef } from 'react';
import { fabric } from 'fabric';

interface CanvasLayerProps {
  width: number;
  height: number;
  onCanvasInit: (canvas: fabric.Canvas) => void;
  currentTool: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikethrough?: boolean;
  textAlign?: string;
  camouflageColor?: string;
}

export default function CanvasLayer({
  width, height, onCanvasInit, currentTool,
  fontFamily = 'Helvetica', fontSize = 16, fontColor = '#000000',
  isBold = false, isItalic = false, isUnderline = false, isStrikethrough = false, textAlign = 'left',
  camouflageColor = '#ffffff'
}: CanvasLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Canvas init
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      backgroundColor: 'transparent',
      selection: true,
      preserveObjectStacking: true, // Keep stacking order when selecting
    });
    fabricRef.current = canvas;
    onCanvasInit(canvas);
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      try { canvas.dispose(); } catch (_) {}
      fabricRef.current = null;
    };
  }, [onCanvasInit, width, height]);

  // Handle active font/style changes for currently selected text object
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (activeObj && (activeObj.type === 'textbox' || activeObj.type === 'i-text')) {
      (activeObj as fabric.Textbox).set({
        fontFamily,
        fontSize,
        fill: fontColor,
        fontWeight: isBold ? 'bold' : 'normal',
        fontStyle: isItalic ? 'italic' : 'normal',
        underline: isUnderline,
        linethrough: isStrikethrough,
        textAlign: textAlign as any,
      });
      canvas.renderAll();
      // We don't trigger object:modified here to avoid history spam on every font size tick,
      // but the parent handles saving history appropriately.
    }
  }, [fontFamily, fontSize, fontColor, isBold, isItalic, isUnderline, isStrikethrough, textAlign]);

  // Tool switching
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    cleanupRef.current?.();
    cleanupRef.current = null;

    canvas.isDrawingMode = false;
    canvas.defaultCursor = 'default';
    canvas.selection = currentTool === 'select';

    canvas.getObjects().forEach(obj => {
      obj.selectable = currentTool === 'select';
      obj.evented = currentTool === 'select';
    });

    if (currentTool === 'select') {
      canvas.defaultCursor = 'default';
    } else if (currentTool === 'draw') {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.width = 3;
      canvas.freeDrawingBrush.color = fontColor || '#6366f1';
    } else if (currentTool === 'whiteout') {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.width = 24;
      canvas.freeDrawingBrush.color = '#ffffff';
    } else if (currentTool === 'highlight') {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.width = 18;
      canvas.freeDrawingBrush.color = 'rgba(255,235,59,0.4)';
    } else if (currentTool === 'camouflage') {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.width = 24;
      canvas.freeDrawingBrush.color = camouflageColor;
    } else if (currentTool === 'text') {
      canvas.defaultCursor = 'text';
      const handler = (opt: fabric.IEvent) => {
        if (opt.target) return;
        const p = canvas.getPointer(opt.e);
        const textbox = new fabric.Textbox('', {
          left: p.x, top: p.y, width: 200,
          fontSize, fontFamily, fill: fontColor,
          fontWeight: isBold ? 'bold' : 'normal',
          fontStyle: isItalic ? 'italic' : 'normal',
          underline: isUnderline, linethrough: isStrikethrough,
          textAlign: textAlign as any,
          editable: true, selectable: true, evented: true,
        });
        canvas.add(textbox);
        canvas.setActiveObject(textbox);
        setTimeout(() => {
          textbox.enterEditing();
          canvas.renderAll();
        }, 50);
      };
      canvas.on('mouse:down', handler);
      cleanupRef.current = () => canvas.off('mouse:down', handler);
    } else if (currentTool === 'rect') {
      canvas.defaultCursor = 'crosshair';
      cleanupRef.current = setupShapeDraw(canvas, (s, e) => new fabric.Rect({
        left: Math.min(s.x, e.x), top: Math.min(s.y, e.y),
        width: Math.abs(e.x - s.x), height: Math.abs(e.y - s.y),
        fill: 'transparent', stroke: fontColor, strokeWidth: 2,
        selectable: true, evented: true,
      }));
    } else if (currentTool === 'ellipse') {
      canvas.defaultCursor = 'crosshair';
      cleanupRef.current = setupShapeDraw(canvas, (s, e) => new fabric.Ellipse({
        left: Math.min(s.x, e.x), top: Math.min(s.y, e.y),
        rx: Math.abs(e.x - s.x) / 2, ry: Math.abs(e.y - s.y) / 2,
        fill: 'transparent', stroke: fontColor, strokeWidth: 2,
        selectable: true, evented: true,
      }));
    } else if (currentTool === 'line') {
      canvas.defaultCursor = 'crosshair';
      cleanupRef.current = setupShapeDraw(canvas, (s, e) => new fabric.Line([s.x, s.y, e.x, e.y], {
        stroke: fontColor, strokeWidth: 2, selectable: true, evented: true,
      }));
    } else if (currentTool === 'arrow') {
      canvas.defaultCursor = 'crosshair';
      cleanupRef.current = setupShapeDraw(canvas, (s, e) => {
        const dx = e.x - s.x; const dy = e.y - s.y;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const len = Math.sqrt(dx*dx + dy*dy);
        const line = new fabric.Line([0,0,len,0], { stroke: fontColor, strokeWidth: 2 });
        const head = new fabric.Triangle({ width: 12, height: 12, fill: fontColor, left: len, top: 0, originX: 'center', originY: 'center', angle: 90 });
        const group = new fabric.Group([line, head], { left: s.x, top: s.y, angle, selectable: true, evented: true });
        return group;
      });
    } else if (currentTool === 'cross') {
      canvas.defaultCursor = 'crosshair';
      const handler = (opt: fabric.IEvent) => {
        if (opt.target) return;
        const p = canvas.getPointer(opt.e);
        const s = 14;
        const l1 = new fabric.Line([p.x - s, p.y - s, p.x + s, p.y + s], { stroke: fontColor, strokeWidth: 3 });
        const l2 = new fabric.Line([p.x + s, p.y - s, p.x - s, p.y + s], { stroke: fontColor, strokeWidth: 3 });
        const g = new fabric.Group([l1, l2], { selectable: true, evented: true });
        canvas.add(g); canvas.renderAll();
      };
      canvas.on('mouse:down', handler);
      cleanupRef.current = () => canvas.off('mouse:down', handler);
    } else if (currentTool === 'checkmark') {
      canvas.defaultCursor = 'crosshair';
      const handler = (opt: fabric.IEvent) => {
        if (opt.target) return;
        const p = canvas.getPointer(opt.e);
        const path = new fabric.Path('M 0 12 L 8 20 L 24 0', {
          left: p.x - 12, top: p.y - 10, fill: 'transparent', stroke: fontColor, strokeWidth: 3,
          strokeLineCap: 'round', strokeLineJoin: 'round', selectable: true, evented: true,
        });
        canvas.add(path); canvas.renderAll();
      };
      canvas.on('mouse:down', handler);
      cleanupRef.current = () => canvas.off('mouse:down', handler);
    }

    canvas.renderAll();

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [currentTool, fontColor, fontSize, fontFamily, camouflageColor]);

  // Keyboard shortcuts (Delete, Copy, Paste)
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    let clipboard: any = null;

    const handleKey = (e: KeyboardEvent) => {
      if (!canvas) return;
      const activeObj = canvas.getActiveObject();
      const activeGroup = canvas.getActiveObjects();

      // Skip if editing text
      if (activeObj && (activeObj as any).isEditing) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && activeGroup.length) {
        e.preventDefault();
        activeGroup.forEach(obj => canvas.remove(obj));
        canvas.discardActiveObject();
        canvas.renderAll();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && activeObj) {
        activeObj.clone((cloned: any) => { clipboard = cloned; });
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && clipboard) {
        clipboard.clone((clonedObj: any) => {
          canvas.discardActiveObject();
          clonedObj.set({
            left: clonedObj.left + 20,
            top: clonedObj.top + 20,
            evented: true,
          });
          if (clonedObj.type === 'activeSelection') {
            clonedObj.canvas = canvas;
            clonedObj.forEachObject((obj: any) => canvas.add(obj));
            clonedObj.setCoords();
          } else {
            canvas.add(clonedObj);
          }
          clipboard.top += 20;
          clipboard.left += 20;
          canvas.setActiveObject(clonedObj);
          canvas.renderAll();
        });
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 10 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function setupShapeDraw(canvas: fabric.Canvas, createFn: (s: {x:number,y:number}, e: {x:number,y:number}) => fabric.Object) {
  let start: { x: number; y: number } | null = null;
  let preview: fabric.Object | null = null;

  const onDown = (opt: fabric.IEvent) => {
    if (opt.target) return;
    const p = canvas.getPointer(opt.e);
    start = { x: p.x, y: p.y };
  };

  const onMove = (opt: fabric.IEvent) => {
    if (!start) return;
    const p = canvas.getPointer(opt.e);
    if (preview) canvas.remove(preview);
    preview = createFn(start, p);
    preview.selectable = false;
    preview.evented = false;
    preview.set('opacity', 0.5);
    canvas.add(preview);
    canvas.renderAll();
  };

  const onUp = (opt: fabric.IEvent) => {
    if (!start) return;
    const p = canvas.getPointer(opt.e);
    if (preview) canvas.remove(preview);
    preview = null;
    const w = Math.abs(p.x - start.x);
    const h = Math.abs(p.y - start.y);
    if (w > 2 || h > 2) {
      const shape = createFn(start, p);
      canvas.add(shape);
      canvas.setActiveObject(shape);
    }
    start = null;
    canvas.renderAll();
  };

  canvas.on('mouse:down', onDown);
  canvas.on('mouse:move', onMove);
  canvas.on('mouse:up', onUp);

  return () => {
    canvas.off('mouse:down', onDown);
    canvas.off('mouse:move', onMove);
    canvas.off('mouse:up', onUp);
  };
}
