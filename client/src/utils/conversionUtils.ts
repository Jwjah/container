/**
 * ============================================================================
 * CONVERSION UTILITIES
 * ============================================================================
 * Image ↔ PDF conversion, image merging, and format utilities.
 */

import { PDFDocument } from 'pdf-lib';

/**
 * Convert an image file to a single-page PDF.
 */
export async function imageToPdf(imageFile: File): Promise<File> {
  const pdfDoc = await PDFDocument.create();
  const bytes = new Uint8Array(await imageFile.arrayBuffer());

  let img;
  if (imageFile.type === 'image/png') {
    img = await pdfDoc.embedPng(bytes);
  } else {
    img = await pdfDoc.embedJpg(bytes);
  }

  const page = pdfDoc.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });

  const pdfBytes = await pdfDoc.save();
  const name = imageFile.name.replace(/\.[^/.]+$/, '') + '.pdf';
  return new File([pdfBytes], name, { type: 'application/pdf' });
}

/**
 * Convert each page of a PDF to a PNG image using canvas rendering.
 */
export async function pdfToImages(
  pdfFile: File,
  scale: number = 2.0
): Promise<File[]> {
  const pdfjs = (await import('react-pdf')).pdfjs;
  const bytes = new Uint8Array(await pdfFile.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const images: File[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png')
    );
    const name = pdfFile.name.replace(/\.[^/.]+$/, '') + `_page${i}.png`;
    images.push(new File([blob], name, { type: 'image/png' }));
  }

  return images;
}

/**
 * Merge multiple images into one canvas.
 * layout: 'stack' (vertical), 'grid' (2-col), 'overlay' (all on top)
 */
export async function mergeImages(
  images: File[],
  layout: 'stack' | 'grid' | 'overlay' = 'stack'
): Promise<File> {
  const loaded = await Promise.all(
    images.map(
      (f) =>
        new Promise<HTMLImageElement>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = URL.createObjectURL(f);
        })
    )
  );

  let canvasWidth = 0;
  let canvasHeight = 0;

  if (layout === 'stack') {
    canvasWidth = Math.max(...loaded.map((i) => i.width));
    canvasHeight = loaded.reduce((sum, i) => sum + i.height, 0);
  } else if (layout === 'grid') {
    const cols = 2;
    const rows = Math.ceil(loaded.length / cols);
    canvasWidth = Math.max(...loaded.map((i) => i.width)) * cols;
    canvasHeight = Math.max(...loaded.map((i) => i.height)) * rows;
  } else {
    canvasWidth = Math.max(...loaded.map((i) => i.width));
    canvasHeight = Math.max(...loaded.map((i) => i.height));
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (layout === 'stack') {
    let y = 0;
    for (const img of loaded) {
      ctx.drawImage(img, 0, y);
      y += img.height;
    }
  } else if (layout === 'grid') {
    const colW = canvasWidth / 2;
    loaded.forEach((img, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const rowH = Math.max(...loaded.map((i) => i.height));
      ctx.drawImage(img, col * colW, row * rowH, colW, img.height * (colW / img.width));
    });
  } else {
    for (const img of loaded) {
      ctx.drawImage(img, 0, 0);
    }
  }

  // Cleanup URLs
  loaded.forEach((img) => URL.revokeObjectURL(img.src));

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png')
  );
  return new File([blob], 'merged.png', { type: 'image/png' });
}

/**
 * Sample the dominant color around a rectangular region's border.
 * Used for text camouflage — fills over text with the surrounding background color.
 */
export function sampleSurroundingColor(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  margin: number = 5
): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return '#ffffff';

  const pixels: number[][] = [];
  const samplePoints = [
    // Top edge
    ...Array.from({ length: Math.ceil(w / 4) }, (_, i) => [x + i * 4, Math.max(0, y - margin)]),
    // Bottom edge
    ...Array.from({ length: Math.ceil(w / 4) }, (_, i) => [x + i * 4, Math.min(canvas.height - 1, y + h + margin)]),
    // Left edge
    ...Array.from({ length: Math.ceil(h / 4) }, (_, i) => [Math.max(0, x - margin), y + i * 4]),
    // Right edge
    ...Array.from({ length: Math.ceil(h / 4) }, (_, i) => [Math.min(canvas.width - 1, x + w + margin), y + i * 4]),
  ];

  for (const [sx, sy] of samplePoints) {
    const data = ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
    pixels.push([data[0], data[1], data[2]]);
  }

  if (pixels.length === 0) return '#ffffff';

  // Average color
  const avg = pixels.reduce(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
    [0, 0, 0]
  );
  const r = Math.round(avg[0] / pixels.length);
  const g = Math.round(avg[1] / pixels.length);
  const b = Math.round(avg[2] / pixels.length);

  return `rgb(${r},${g},${b})`;
}

/**
 * Export a fabric canvas to a specific image format.
 */
export function exportCanvas(
  fabricCanvas: any,
  format: 'png' | 'jpeg' | 'webp' = 'png',
  quality: number = 1.0
): Promise<File> {
  const mimeType = `image/${format}`;
  const dataUrl = fabricCanvas.toDataURL({ format, quality });
  return fetch(dataUrl)
    .then((res) => res.blob())
    .then((blob) => new File([blob], `export.${format}`, { type: mimeType }));
}
