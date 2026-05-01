'use client';

import React, { useEffect, useRef } from 'react';
import { fabric } from 'fabric';

interface CanvasLayerProps {
  width: number;
  height: number;
  onCanvasInit: (canvas: fabric.Canvas) => void;
  currentTool: string;
}

export default function CanvasLayer({ width, height, onCanvasInit, currentTool }: CanvasLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  // Store cleanup function for tool-specific listeners
  const cleanupRef = useRef<(() => void) | null>(null);

  // Canvas init — runs once per mount
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      backgroundColor: 'transparent',
      selection: true,
    });
    fabricRef.current = canvas;
    onCanvasInit(canvas);
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      try { canvas.dispose(); } catch (_) { /* ignore */ }
      fabricRef.current = null;
    };
  }, [onCanvasInit, width, height]);

  // Tool switching — ONLY manages tool-specific behaviour
  // Does NOT touch object:added/modified/removed listeners from PDFEditor
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Clean up previous tool listeners
    cleanupRef.current?.();
    cleanupRef.current = null;

    // Reset drawing mode
    canvas.isDrawingMode = false;
    canvas.defaultCursor = 'default';

    const isSelect = currentTool === 'select';
    canvas.selection = isSelect;

    // Make objects selectable only in select mode, but always keep evented
    // so click-through tools (text, stamps) still get pointer events
    canvas.getObjects().forEach(obj => {
      obj.selectable = isSelect;
      obj.evented = isSelect;
    });

    // --- Tool implementations ---

    if (currentTool === 'select') {
      // Nothing extra needed
      canvas.defaultCursor = 'default';

    } else if (currentTool === 'draw') {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.width = 2;
      canvas.freeDrawingBrush.color = '#6366f1';

    } else if (currentTool === 'whiteout') {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.width = 20;
      canvas.freeDrawingBrush.color = '#ffffff';

    } else if (currentTool === 'highlight') {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.width = 18;
      canvas.freeDrawingBrush.color = 'rgba(255,235,59,0.4)';

    } else if (currentTool === 'sign') {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.width = 2;
      canvas.freeDrawingBrush.color = '#1a1a2e';
      canvas.defaultCursor = 'crosshair';

    } else if (currentTool === 'text' || currentTool === 'add-text') {
      canvas.defaultCursor = 'text';
      const handler = (opt: fabric.IEvent) => {
        if (opt.target) return; // clicked an existing object
        const pointer = canvas.getPointer(opt.e);
        const textbox = new fabric.Textbox('Type here', {
          left: pointer.x,
          top: pointer.y,
          width: 200,
          fontSize: 16,
          fontFamily: 'Helvetica',
          fill: '#000000',
          editable: true,
          selectable: true,
          evented: true,
        });
        canvas.add(textbox);
        canvas.setActiveObject(textbox);
        // Small delay so fabric finishes adding before we enter editing
        setTimeout(() => {
          textbox.enterEditing();
          textbox.selectAll();
          canvas.renderAll();
        }, 50);
      };
      canvas.on('mouse:down', handler);
      cleanupRef.current = () => { canvas.off('mouse:down', handler); };

    } else if (currentTool === 'cross') {
      canvas.defaultCursor = 'crosshair';
      const handler = (opt: fabric.IEvent) => {
        if (opt.target) return;
        const p = canvas.getPointer(opt.e);
        const s = 14;
        const line1 = new fabric.Line([p.x - s, p.y - s, p.x + s, p.y + s], {
          stroke: '#D2294B', strokeWidth: 3, strokeLineCap: 'round',
        });
        const line2 = new fabric.Line([p.x + s, p.y - s, p.x - s, p.y + s], {
          stroke: '#D2294B', strokeWidth: 3, strokeLineCap: 'round',
        });
        const group = new fabric.Group([line1, line2], {
          selectable: true, evented: true,
        });
        canvas.add(group);
        canvas.renderAll();
      };
      canvas.on('mouse:down', handler);
      cleanupRef.current = () => { canvas.off('mouse:down', handler); };

    } else if (currentTool === 'checkmark') {
      canvas.defaultCursor = 'crosshair';
      const handler = (opt: fabric.IEvent) => {
        if (opt.target) return;
        const p = canvas.getPointer(opt.e);
        const path = new fabric.Path('M 0 12 L 8 20 L 24 0', {
          left: p.x - 12, top: p.y - 10,
          fill: 'transparent', stroke: '#22c55e',
          strokeWidth: 3, strokeLineCap: 'round', strokeLineJoin: 'round',
          selectable: true, evented: true,
        });
        canvas.add(path);
        canvas.renderAll();
      };
      canvas.on('mouse:down', handler);
      cleanupRef.current = () => { canvas.off('mouse:down', handler); };

    } else if (currentTool === 'redact') {
      canvas.defaultCursor = 'crosshair';
      cleanupRef.current = setupShapeDraw(canvas, (start, end) => {
        return new fabric.Rect({
          left: Math.min(start.x, end.x), top: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y),
          fill: '#000000', selectable: true, evented: true,
        });
      });

    } else if (currentTool === 'ellipse') {
      canvas.defaultCursor = 'crosshair';
      cleanupRef.current = setupShapeDraw(canvas, (start, end) => {
        return new fabric.Ellipse({
          left: Math.min(start.x, end.x), top: Math.min(start.y, end.y),
          rx: Math.abs(end.x - start.x) / 2, ry: Math.abs(end.y - start.y) / 2,
          fill: 'transparent', stroke: '#D2294B', strokeWidth: 2,
          selectable: true, evented: true,
        });
      });

    } else if (currentTool === 'magic-edit') {
      // Magic edit is handled by PDFEditor (OCR), just set cursor
      canvas.defaultCursor = 'default';
    }

    canvas.renderAll();

    // Cleanup on tool change
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [currentTool]);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 10 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

/**
 * Sets up click-drag shape drawing on the canvas.
 * Returns a cleanup function that removes the listeners.
 */
function setupShapeDraw(
  canvas: fabric.Canvas,
  createFn: (start: { x: number; y: number }, end: { x: number; y: number }) => fabric.Object,
): () => void {
  let startPoint: { x: number; y: number } | null = null;
  let preview: fabric.Object | null = null;

  const onDown = (opt: fabric.IEvent) => {
    if (opt.target) return;
    const p = canvas.getPointer(opt.e);
    startPoint = { x: p.x, y: p.y };
  };

  const onMove = (opt: fabric.IEvent) => {
    if (!startPoint) return;
    const p = canvas.getPointer(opt.e);
    if (preview) canvas.remove(preview);
    const shape = createFn(startPoint, p);
    shape.selectable = false;
    shape.evented = false;
    shape.set('opacity', 0.5);
    preview = shape;
    canvas.add(shape);
    canvas.renderAll();
  };

  const onUp = (opt: fabric.IEvent) => {
    if (!startPoint) return;
    const p = canvas.getPointer(opt.e);
    if (preview) canvas.remove(preview);
    preview = null;
    const w = Math.abs(p.x - startPoint.x);
    const h = Math.abs(p.y - startPoint.y);
    if (w > 3 || h > 3) {
      const shape = createFn(startPoint, p);
      canvas.add(shape);
      canvas.setActiveObject(shape);
      canvas.renderAll();
    }
    startPoint = null;
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
