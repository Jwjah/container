/**
 * ============================================================================
 * TEXT GROUPING & OCR UTILITIES
 * ============================================================================
 * 
 * Comprehensive text extraction pipeline for PDFs:
 * 1. groupTextItems()  — groups PDF.js text content into logical blocks
 * 2. isScannedPage()   — detects if a PDF page is a scan/image (no selectable text)
 * 3. ocrPageToBlocks() — runs Tesseract OCR on a rendered page canvas
 * 4. mergeOcrBlocks()  — deduplicates OCR results against existing text
 * 5. Various helpers for coordinate transforms, font detection, etc.
 */

/* ─── Types ─────────────────────────────────────────── */

export interface TextBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  confidence?: number;     // OCR confidence 0–100
  source?: 'pdf' | 'ocr'; // where this block came from
  rotation?: number;       // text rotation in degrees
  lineIndex?: number;      // which line this block belongs to
  blockIndex?: number;     // which paragraph block
  color?: string;          // detected text color
  isBold?: boolean;
  isItalic?: boolean;
}

export interface LineGroup {
  y: number;
  height: number;
  items: TextBlock[];
}

export interface ParagraphBlock {
  lines: LineGroup[];
  x: number;
  y: number;
  width: number;
  height: number;
}

/* ─── Constants ─────────────────────────────────────── */

const LINE_Y_THRESHOLD = 5;          // px tolerance to consider items on the same line
const WORD_SPACE_FACTOR = 0.5;        // fraction of fontSize to consider same word group
const PARAGRAPH_GAP_FACTOR = 1.8;     // lines separated by more than this * fontSize = new paragraph
const MIN_TEXT_LENGTH = 1;            // minimum text block length to keep
const OCR_CONFIDENCE_THRESHOLD = 40;  // minimum Tesseract confidence to keep a word
const SCANNED_PAGE_TEXT_THRESHOLD = 5; // if fewer than this many chars, page is likely scanned

/* ─── 1. Group PDF.js Text Items into Blocks ────────── */

export function groupTextItems(items: any[], viewport: any): TextBlock[] {
  if (!items || items.length === 0) return [];

  // Step 1: Convert all items to viewport (canvas) coordinates
  const convertedItems = items
    .filter(item => item.str && item.str.trim().length >= MIN_TEXT_LENGTH)
    .map((item, idx) => {
      const tx = item.transform[4];
      const ty = item.transform[5];
      const scaleX = Math.sqrt(item.transform[0] ** 2 + item.transform[1] ** 2);
      const fontSize = scaleX;
      const rotation = Math.atan2(item.transform[1], item.transform[0]) * (180 / Math.PI);

      // Convert PDF coordinates to viewport (canvas) coordinates
      const [canvasX, canvasY] = viewport.convertToViewportPoint(tx, ty);

      // Detect font style from font name
      const fontName = (item.fontName || '').toLowerCase();
      const isBold = fontName.includes('bold') || fontName.includes('black') || fontName.includes('heavy');
      const isItalic = fontName.includes('italic') || fontName.includes('oblique');

      return {
        str: item.str,
        canvasX,
        canvasY,
        fontSize,
        fontName: item.fontName || 'Helvetica',
        width: item.width || 0,
        height: item.height || fontSize,
        top: canvasY - fontSize,
        rotation,
        isBold,
        isItalic,
        index: idx,
      };
    });

  if (convertedItems.length === 0) return [];

  // Step 2: Group by y-coordinate (same line)
  const lineGroups = groupByLine(convertedItems);

  // Step 3: Within each line, merge horizontally adjacent items
  const blocks: TextBlock[] = [];
  let lineIdx = 0;

  for (const lineY of Object.keys(lineGroups).sort((a, b) => parseFloat(a) - parseFloat(b))) {
    const lineItems = lineGroups[parseFloat(lineY)];
    lineItems.sort((a: any, b: any) => a.canvasX - b.canvasX);

    let currentBlock: any = null;

    for (const item of lineItems) {
      if (!currentBlock) {
        currentBlock = {
          text: item.str,
          canvasX: item.canvasX,
          top: item.top,
          width: item.width,
          fontSize: item.fontSize,
          fontName: item.fontName,
          isBold: item.isBold,
          isItalic: item.isItalic,
          rotation: item.rotation,
        };
      } else {
        const gap = item.canvasX - (currentBlock.canvasX + currentBlock.width);
        const spaceThreshold = item.fontSize * WORD_SPACE_FACTOR;

        if (gap < spaceThreshold && gap > -item.fontSize * 0.3) {
          // Merge: add space if there's a visible gap
          if (gap > item.fontSize * 0.15) {
            currentBlock.text += ' ';
          }
          currentBlock.text += item.str;
          currentBlock.width = (item.canvasX + item.width) - currentBlock.canvasX;
          // Use largest fontSize in the merged block
          if (item.fontSize > currentBlock.fontSize) {
            currentBlock.fontSize = item.fontSize;
          }
        } else {
          // Emit current block, start new one
          blocks.push(convertToTextBlock(currentBlock, lineIdx, 'pdf'));
          currentBlock = {
            text: item.str,
            canvasX: item.canvasX,
            top: item.top,
            width: item.width,
            fontSize: item.fontSize,
            fontName: item.fontName,
            isBold: item.isBold,
            isItalic: item.isItalic,
            rotation: item.rotation,
          };
        }
      }
    }

    if (currentBlock) {
      blocks.push(convertToTextBlock(currentBlock, lineIdx, 'pdf'));
    }
    lineIdx++;
  }

  return blocks;
}

/* ─── 2. Detect Scanned / Image-based PDF Pages ────── */

/**
 * Determines if a PDF page is a scan (image-only, no selectable text).
 * If the page has very few text items, it's likely a scanned document
 * and needs OCR to extract text.
 */
export function isScannedPage(textContent: any): boolean {
  if (!textContent || !textContent.items) return true;

  // Count total characters in all text items
  const totalChars = textContent.items.reduce((sum: number, item: any) => {
    return sum + (item.str || '').trim().length;
  }, 0);

  return totalChars < SCANNED_PAGE_TEXT_THRESHOLD;
}

/**
 * Determines if a page is likely handwritten by checking:
 * - Very few text items with low-confidence or non-standard fonts
 * - Presence of drawing paths but minimal text content
 */
export function isLikelyHandwritten(textContent: any): boolean {
  if (!textContent || !textContent.items) return true;

  const items = textContent.items.filter((item: any) => (item.str || '').trim().length > 0);
  
  if (items.length === 0) return true;
  if (items.length < 3) return true;

  // Check for non-standard font names (often indicates embedded/custom fonts
  // that may be handwriting or decorative)
  const fontNames = items.map((item: any) => item.fontName || '').filter(Boolean);
  const standardFonts = ['Helvetica', 'Arial', 'TimesNewRoman', 'Times-Roman', 'Courier', 'Symbol'];
  const nonStandardCount = fontNames.filter((fn: string) => 
    !standardFonts.some(sf => fn.toLowerCase().includes(sf.toLowerCase()))
  ).length;

  return nonStandardCount > fontNames.length * 0.8;
}

/* ─── 3. OCR a Rendered Page Canvas ─────────────────── */

/**
 * Runs Tesseract OCR on a canvas element to extract text blocks.
 * This is used for scanned PDFs, image-based PDFs, and handwritten documents.
 *
 * @param canvas - An HTML canvas element with the page rendered on it
 * @param pageWidth - The width of the page in viewport coordinates
 * @param pageHeight - The height of the page in viewport coordinates
 * @param language - Tesseract language code (default 'eng')
 * @returns Array of TextBlock with OCR-extracted text
 */
export async function ocrPageToBlocks(
  canvas: HTMLCanvasElement,
  pageWidth: number,
  pageHeight: number,
  language: string = 'eng',
  onProgress?: (progress: number) => void
): Promise<TextBlock[]> {
  // Dynamically import Tesseract to avoid SSR issues
  const Tesseract = (await import('tesseract.js')).default;

  const result = await Tesseract.recognize(canvas, language, {
    logger: (m: any) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  const blocks: TextBlock[] = [];
  const data = result.data as any;

  if (!data || !data.lines) return blocks;

  // Process each line from Tesseract
  data.lines.forEach((line: any, lineIdx: number) => {
    if (!line.words || line.words.length === 0) return;

    // Build line text from words
    const lineText = line.words
      .filter((w: any) => w.confidence >= OCR_CONFIDENCE_THRESHOLD)
      .map((w: any) => w.text)
      .join(' ')
      .trim();

    if (lineText.length < MIN_TEXT_LENGTH) return;

    // Use the bounding box of the entire line
    const bbox = line.bbox;
    const lineHeight = bbox.y1 - bbox.y0;
    const estimatedFontSize = Math.max(8, lineHeight * 0.75);

    // Scale coordinates from canvas pixels to viewport coordinates
    const scaleFactorX = pageWidth / canvas.width;
    const scaleFactorY = pageHeight / canvas.height;

    blocks.push({
      text: lineText,
      x: bbox.x0 * scaleFactorX,
      y: bbox.y0 * scaleFactorY,
      width: (bbox.x1 - bbox.x0) * scaleFactorX,
      height: lineHeight * scaleFactorY,
      fontSize: estimatedFontSize * scaleFactorY,
      fontFamily: 'Helvetica',
      confidence: line.confidence,
      source: 'ocr',
      lineIndex: lineIdx,
    });
  });

  return blocks;
}

/**
 * OCR using individual words (higher precision for editing)
 */
export async function ocrPageToWordBlocks(
  canvas: HTMLCanvasElement,
  pageWidth: number,
  pageHeight: number,
  language: string = 'eng',
  onProgress?: (progress: number) => void
): Promise<TextBlock[]> {
  const Tesseract = (await import('tesseract.js')).default;

  const result = await Tesseract.recognize(canvas, language, {
    logger: (m: any) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  const blocks: TextBlock[] = [];
  const data = result.data as any;

  if (!data || !data.words) return blocks;

  const scaleFactorX = pageWidth / canvas.width;
  const scaleFactorY = pageHeight / canvas.height;

  data.words.forEach((word: any, idx: number) => {
    if (word.confidence < OCR_CONFIDENCE_THRESHOLD) return;
    if (!word.text || word.text.trim().length < MIN_TEXT_LENGTH) return;

    const bbox = word.bbox;
    const wordHeight = bbox.y1 - bbox.y0;
    const estimatedFontSize = Math.max(8, wordHeight * 0.75);

    blocks.push({
      text: word.text.trim(),
      x: bbox.x0 * scaleFactorX,
      y: bbox.y0 * scaleFactorY,
      width: (bbox.x1 - bbox.x0) * scaleFactorX,
      height: wordHeight * scaleFactorY,
      fontSize: estimatedFontSize * scaleFactorY,
      fontFamily: 'Helvetica',
      confidence: word.confidence,
      source: 'ocr',
      blockIndex: idx,
    });
  });

  return blocks;
}

/* ─── 4. Merge / Deduplicate Blocks ─────────────────── */

/**
 * Merges OCR blocks with existing PDF text blocks, removing duplicates.
 * If an OCR block overlaps significantly with an existing PDF block,
 * the PDF block takes priority (it has higher fidelity).
 */
export function mergeOcrBlocks(
  pdfBlocks: TextBlock[],
  ocrBlocks: TextBlock[],
  overlapThreshold: number = 0.5
): TextBlock[] {
  const result = [...pdfBlocks];

  for (const ocrBlock of ocrBlocks) {
    let isDuplicate = false;

    for (const pdfBlock of pdfBlocks) {
      const overlap = calculateOverlap(ocrBlock, pdfBlock);
      if (overlap > overlapThreshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      result.push(ocrBlock);
    }
  }

  return result;
}

/* ─── 5. Coordinate & Geometry Helpers ──────────────── */

function groupByLine(items: any[]): Record<number, any[]> {
  const lines: Record<number, any[]> = {};

  items.forEach(item => {
    const matchingLine = Object.keys(lines).find(
      y => Math.abs(parseFloat(y) - item.top) < LINE_Y_THRESHOLD
    );

    if (matchingLine) {
      lines[parseFloat(matchingLine)].push(item);
    } else {
      lines[item.top] = [item];
    }
  });

  return lines;
}

function convertToTextBlock(item: any, lineIndex: number, source: 'pdf' | 'ocr'): TextBlock {
  return {
    text: item.text,
    x: item.canvasX,
    y: item.top,
    width: Math.max(item.width, 10),
    height: item.fontSize,
    fontSize: item.fontSize,
    fontFamily: item.fontName || 'Helvetica',
    source,
    lineIndex,
    rotation: item.rotation || 0,
    isBold: item.isBold || false,
    isItalic: item.isItalic || false,
  };
}

function calculateOverlap(a: TextBlock, b: TextBlock): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const overlapArea = xOverlap * yOverlap;
  const aArea = a.width * a.height;
  const bArea = b.width * b.height;
  const minArea = Math.min(aArea, bArea);
  return minArea > 0 ? overlapArea / minArea : 0;
}

/**
 * Groups blocks into paragraphs based on vertical proximity.
 */
export function groupIntoParagraphs(blocks: TextBlock[]): ParagraphBlock[] {
  if (blocks.length === 0) return [];

  // Sort by Y then X
  const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);

  const paragraphs: ParagraphBlock[] = [];
  let currentLines: LineGroup[] = [];
  let prevY = sorted[0].y;
  let prevFontSize = sorted[0].fontSize;

  // Group into lines first
  let currentLine: TextBlock[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const block = sorted[i];
    const yDiff = Math.abs(block.y - prevY);

    if (yDiff < LINE_Y_THRESHOLD) {
      // Same line
      currentLine.push(block);
    } else {
      // New line — flush current line
      currentLines.push({
        y: prevY,
        height: prevFontSize,
        items: [...currentLine],
      });

      // Check if this is a new paragraph
      const gap = block.y - (prevY + prevFontSize);
      if (gap > prevFontSize * PARAGRAPH_GAP_FACTOR && currentLines.length > 0) {
        paragraphs.push(buildParagraph(currentLines));
        currentLines = [];
      }

      currentLine = [block];
      prevY = block.y;
      prevFontSize = block.fontSize;
    }
  }

  // Flush remaining
  if (currentLine.length > 0) {
    currentLines.push({
      y: prevY,
      height: prevFontSize,
      items: currentLine,
    });
  }
  if (currentLines.length > 0) {
    paragraphs.push(buildParagraph(currentLines));
  }

  return paragraphs;
}

function buildParagraph(lines: LineGroup[]): ParagraphBlock {
  const allItems = lines.flatMap(l => l.items);
  const minX = Math.min(...allItems.map(i => i.x));
  const maxX = Math.max(...allItems.map(i => i.x + i.width));
  const minY = Math.min(...lines.map(l => l.y));
  const maxY = Math.max(...lines.map(l => l.y + l.height));

  return {
    lines,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Renders a PDF page to a canvas for OCR processing.
 * Returns the canvas element.
 */
export async function renderPageToCanvas(
  page: any,
  scaleFactor: number = 2.0
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: scaleFactor });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas 2d context');

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/**
 * Preprocesses a canvas image for better OCR results.
 * Applies grayscale, contrast enhancement, and noise reduction.
 */
export function preprocessCanvasForOCR(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return sourceCanvas;

  // Draw the original image
  ctx.drawImage(sourceCanvas, 0, 0);

  // Get image data for pixel manipulation
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Convert to grayscale and enhance contrast
  for (let i = 0; i < data.length; i += 4) {
    // Grayscale using luminance formula
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    // Apply contrast stretch (simple thresholding for text)
    // This helps with handwritten text and faded prints
    const enhanced = gray < 128 ? Math.max(0, gray * 0.6) : Math.min(255, gray * 1.2 + 30);

    data[i] = enhanced;     // R
    data[i + 1] = enhanced; // G
    data[i + 2] = enhanced; // B
    // Alpha stays the same
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
