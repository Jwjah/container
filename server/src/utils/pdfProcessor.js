const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const QRCode = require('qrcode');

// Set to true to draw layout guide lines (physical edge: red, printable margin: green,
// footer bottom: blue, footer top: magenta, separator line: orange)
const DEBUG_MODE = false;

// Configurable Printer Profile object (in mm)
const PrinterProfile = {
  printableBottomMarginMM: 3,
  footerHeightMM: 10,
  footerBottomPaddingMM: 1,
  separatorGapMM: 2,
};

const MM_TO_PT = 2.83465; // 1 mm = 2.83465 PDF points
const A4_WIDTH = 210 * MM_TO_PT; // 595.28 pt
const A4_HEIGHT = 297 * MM_TO_PT; // 841.89 pt

// Calculated physical layout points derived from PrinterProfile
const PRINTER_BOTTOM_MARGIN = PrinterProfile.printableBottomMarginMM * MM_TO_PT;
const FOOTER_BOTTOM_PADDING = PrinterProfile.footerBottomPaddingMM * MM_TO_PT;
const FOOTER_HEIGHT = PrinterProfile.footerHeightMM * MM_TO_PT;
const SEPARATOR_GAP = PrinterProfile.separatorGapMM * MM_TO_PT;

// Compute footer base coordinate (ends exactly printable margin + padding above physical page bottom)
const FOOTER_BOTTOM_Y = PRINTER_BOTTOM_MARGIN + FOOTER_BOTTOM_PADDING;
const FOOTER_TOP_Y = FOOTER_BOTTOM_Y + FOOTER_HEIGHT;

// Original footer dimensions (100% scale, unchanged)
const LOGO_HEIGHT = 10 * MM_TO_PT;         // 10 mm
const QR_SIZE = 15 * MM_TO_PT;             // 15 mm (Optimized printed QR size)
const SIDE_PADDING = 8 * MM_TO_PT;         // 8 mm
const SEPARATOR_THICKNESS = 0.3;           // 0.3 pt

// Align elements exactly as they were in the earlier version, translated by FOOTER_BOTTOM_Y
const qrY = FOOTER_BOTTOM_Y + 11.5;
const cap1Y = FOOTER_BOTTOM_Y + 6.0;
const cap2Y = FOOTER_BOTTOM_Y + 1.5;

// The separator line is drawn at the top of the elements or background box
const SEPARATOR_Y = Math.max(FOOTER_TOP_Y, qrY + QR_SIZE);

// Total reserved space to scale and compress the original PDF page content
const RESERVED_SPACE = SEPARATOR_Y + SEPARATOR_GAP;

class FooterRenderer {
  constructor(page, pdfDoc, orderHash, orderId, pickupQr, deliveryQr, printType = 'bw', orderIdStr = null) {
    this.page = page;
    this.pdfDoc = pdfDoc;
    this.orderHash = orderHash;
    this.orderId = orderId;
    this.pickupQr = pickupQr;
    this.deliveryQr = deliveryQr;
    this.printType = printType;
    this.orderIdStr = orderIdStr;
    
    const { width, height } = page.getSize();
    this.width = width;
    this.height = height;
    
    this.font = null;
    this.boldFont = null;
  }

  async loadFonts() {
    this.font = await this.pdfDoc.embedFont(StandardFonts.Helvetica);
    this.boldFont = await this.pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }

  drawBackground() {
    // Draw minimalist clean white footer background covering up to the separator
    this.page.drawRectangle({
      x: 0,
      y: 0,
      width: this.width,
      height: SEPARATOR_Y,
      color: rgb(1, 1, 1),
    });
  }

  drawSeparator() {
    const isBw = this.printType === 'bw';
    const separatorColor = isBw ? rgb(0.9, 0.9, 0.9) : rgb(0.91, 0.91, 0.93);
    // Draw very light, thin separator line at SEPARATOR_Y
    this.page.drawLine({
      start: { x: SIDE_PADDING, y: SEPARATOR_Y },
      end: { x: this.width - SIDE_PADDING, y: SEPARATOR_Y },
      thickness: SEPARATOR_THICKNESS,
      color: separatorColor,
    });
  }

  async drawLeftColumn() {
    const logoX = SIDE_PADDING;
    const logoY = FOOTER_BOTTOM_Y + 7.08;
    
    // 1. Draw Logo
    try {
      const logoPath = path.join(__dirname, '../assets/logo.jpg');
      if (fs.existsSync(logoPath)) {
        let logoBytes = fs.readFileSync(logoPath);
        if (this.printType === 'bw') {
          logoBytes = await sharp(logoBytes).grayscale().toBuffer();
        }
        const logoImage = await this.pdfDoc.embedJpg(logoBytes);
        this.page.drawImage(logoImage, {
          x: logoX,
          y: logoY,
          width: LOGO_HEIGHT,
          height: LOGO_HEIGHT,
        });
      }
    } catch (logoErr) {
      console.error('Failed to embed logo in PDF:', logoErr.message);
    }

    // 2. Draw Identity Text Stack (Right of Logo)
    const textX = logoX + LOGO_HEIGHT + 4 * MM_TO_PT;
    
    const line1 = 'CampusPrint';
    const line2 = 'Printing made effortless.';
    const line3 = 'campusprint.in';
    
    const size1 = 6.5;
    const size2 = 5.0;
    const size3 = 4.5;
    
    // Vertical placement centered (matches earlier version exactly, shifted by FOOTER_BOTTOM_Y)
    const textBlockHeight = size1 + size2 + size3 + 4.0;
    const startY = FOOTER_BOTTOM_Y + 11.26;
    
    const y3 = startY;
    const y2 = y3 + size3 + 2.0;
    const y1 = y2 + size2 + 2.0;

    const isBw = this.printType === 'bw';
    const colorLine1 = isBw ? rgb(0.1, 0.1, 0.1) : rgb(0.1, 0.1, 0.15);
    const colorLine2 = isBw ? rgb(0.3, 0.3, 0.3) : rgb(0.3, 0.3, 0.35);
    const colorLine3 = isBw ? rgb(0.55, 0.55, 0.55) : rgb(0.55, 0.55, 0.6);

    this.page.drawText(line1, {
      x: textX,
      y: y1,
      size: size1,
      font: this.boldFont,
      color: colorLine1,
    });
    
    this.page.drawText(line2, {
      x: textX,
      y: y2,
      size: size2,
      font: this.font,
      color: colorLine2,
    });
    
    this.page.drawText(line3, {
      x: textX,
      y: y3,
      size: size3,
      font: this.font,
      color: colorLine3,
    });
  }

  async drawRightColumn() {
    const rightAreaMinX = this.width * 0.65;
    const rightAreaMaxX = this.width - SIDE_PADDING;
    const rightAreaWidth = rightAreaMaxX - rightAreaMinX;
    
    const qrsToEmbed = [];
    const shortId = this.orderHash ? this.orderHash.substring(0, 8).toUpperCase() : 'N/A';

    if (this.pickupQr) {
      // Reconstruct payload and generate optimized high-res black & white QR for print
      const pickupPayload = JSON.stringify({
        type: 'pickup',
        orderId: Number(this.orderId),
        hash: this.orderHash,
        action: 'verify_pickup'
      });
      
      const qrBytes = await QRCode.toBuffer(pickupPayload, {
        errorCorrectionLevel: 'L',
        margin: 4,
        width: 512,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      qrsToEmbed.push({
        bytes: qrBytes,
        label1: this.deliveryQr ? 'Order' : 'Pickup',
        label2: `CP${shortId}`,
      });
    }
    if (this.deliveryQr) {
      // Reconstruct payload and generate optimized high-res black & white QR for print
      const deliveryPayload = JSON.stringify({
        type: 'delivery',
        orderId: Number(this.orderId),
        hash: this.orderHash,
        action: 'verify_delivery'
      });
      
      const qrBytes = await QRCode.toBuffer(deliveryPayload, {
        errorCorrectionLevel: 'L',
        margin: 4,
        width: 512,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      qrsToEmbed.push({
        bytes: qrBytes,
        label1: 'Delivery',
        label2: 'Track',
      });
    }
    
    const captionSize = 4.0;
    const isBw = this.printType === 'bw';
    const captionColor = isBw ? rgb(0.55, 0.55, 0.55) : rgb(0.55, 0.55, 0.6);
    
    if (qrsToEmbed.length === 1) {
      // Single QR layout (Centered in right column)
      const rightCenterX = (rightAreaMinX + rightAreaMaxX) / 2;
      const qrX = rightCenterX - QR_SIZE / 2;
      
      const qrImage = await this.pdfDoc.embedPng(qrsToEmbed[0].bytes);
      
      this.page.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: QR_SIZE,
        height: QR_SIZE,
      });
      
      // Caption Line 1
      const w1 = this.font.widthOfTextAtSize(qrsToEmbed[0].label1, captionSize);
      this.page.drawText(qrsToEmbed[0].label1, {
        x: qrX + (QR_SIZE - w1) / 2,
        y: cap1Y,
        size: captionSize,
        font: this.font,
        color: captionColor,
      });
      
      // Caption Line 2
      const w2 = this.font.widthOfTextAtSize(qrsToEmbed[0].label2, captionSize);
      this.page.drawText(qrsToEmbed[0].label2, {
        x: qrX + (QR_SIZE - w2) / 2,
        y: cap2Y,
        size: captionSize,
        font: this.font,
        color: captionColor,
      });
      
    } else if (qrsToEmbed.length === 2) {
      // Double QR Layout spaced equally inside right area
      const gap = (rightAreaWidth - 2 * QR_SIZE) / 3;
      const qrX1 = rightAreaMinX + gap;
      const qrX2 = qrX1 + QR_SIZE + gap;
      
      // QR 1
      const qrImage1 = await this.pdfDoc.embedPng(qrsToEmbed[0].bytes);
      this.page.drawImage(qrImage1, {
        x: qrX1,
        y: qrY,
        width: QR_SIZE,
        height: QR_SIZE,
      });
      
      const w1 = this.font.widthOfTextAtSize(qrsToEmbed[0].label1, captionSize);
      this.page.drawText(qrsToEmbed[0].label1, {
        x: qrX1 + (QR_SIZE - w1) / 2,
        y: cap1Y,
        size: captionSize,
        font: this.font,
        color: captionColor,
      });
      
      const w2 = this.font.widthOfTextAtSize(qrsToEmbed[0].label2, captionSize);
      this.page.drawText(qrsToEmbed[0].label2, {
        x: qrX1 + (QR_SIZE - w2) / 2,
        y: cap2Y,
        size: captionSize,
        font: this.font,
        color: captionColor,
      });

      // QR 2
      const qrImage2 = await this.pdfDoc.embedPng(qrsToEmbed[1].bytes);
      this.page.drawImage(qrImage2, {
        x: qrX2,
        y: qrY,
        width: QR_SIZE,
        height: QR_SIZE,
      });
      
      const w3 = this.font.widthOfTextAtSize(qrsToEmbed[1].label1, captionSize);
      this.page.drawText(qrsToEmbed[1].label1, {
        x: qrX2 + (QR_SIZE - w3) / 2,
        y: cap1Y,
        size: captionSize,
        font: this.font,
        color: captionColor,
      });
      
      const w4 = this.font.widthOfTextAtSize(qrsToEmbed[1].label2, captionSize);
      this.page.drawText(qrsToEmbed[1].label2, {
        x: qrX2 + (QR_SIZE - w4) / 2,
        y: cap2Y,
        size: captionSize,
        font: this.font,
        color: captionColor,
      });
    }
  }

  drawVersioning() {
    const versionText = 'CP v1.0';
    const vSize = 4.0;
    const vWidth = this.font.widthOfTextAtSize(versionText, vSize);
    
    const vx = this.width - SIDE_PADDING - vWidth;
    const vy = FOOTER_BOTTOM_Y + 1.5;

    const isBw = this.printType === 'bw';
    const versionColor = isBw ? rgb(0.8, 0.8, 0.8) : rgb(0.8, 0.8, 0.82);

    this.page.drawText(versionText, {
      x: vx,
      y: vy,
      size: vSize,
      font: this.font,
      color: versionColor,
    });
  }

  drawDebugGuides() {
    // 1. Physical page edges (Red border)
    this.page.drawRectangle({
      x: 2,
      y: 2,
      width: this.width - 4,
      height: this.height - 4,
      borderColor: rgb(1, 0, 0),
      borderWidth: 1,
    });
    
    // 2. Printable bottom margin (Green)
    this.page.drawLine({
      start: { x: 0, y: PRINTER_BOTTOM_MARGIN },
      end: { x: this.width, y: PRINTER_BOTTOM_MARGIN },
      thickness: 1.0,
      color: rgb(0, 1, 0),
    });
    
    // 3. Footer bottom padding limit (Blue)
    this.page.drawLine({
      start: { x: 0, y: FOOTER_BOTTOM_Y },
      end: { x: this.width, y: FOOTER_BOTTOM_Y },
      thickness: 1.0,
      color: rgb(0, 0, 1),
    });
    
    // 4. Footer top config limit (Magenta)
    this.page.drawLine({
      start: { x: 0, y: FOOTER_TOP_Y },
      end: { x: this.width, y: FOOTER_TOP_Y },
      thickness: 1.0,
      color: rgb(1, 0, 1),
    });
    
    // 5. Separator line (Orange)
    this.page.drawLine({
      start: { x: 0, y: SEPARATOR_Y },
      end: { x: this.width, y: SEPARATOR_Y },
      thickness: 1.0,
      color: rgb(1, 0.5, 0),
    });
  }

  drawCenterColumn() {
    const text = this.orderIdStr || this.orderHash || 'N/A';
    const isBw = this.printType === 'bw';
    const orderIdColor = isBw ? rgb(0.1, 0.1, 0.1) : rgb(0.12, 0.12, 0.18);
    const fontSize = 8.0;
    
    const textWidth = this.boldFont.widthOfTextAtSize(text, fontSize);
    const centerX = this.width / 2;
    const x = centerX - (textWidth / 2);
    const y = FOOTER_BOTTOM_Y + 11.5;
    
    this.page.drawText(text, {
      x: x,
      y: y,
      size: fontSize,
      font: this.boldFont,
      color: orderIdColor,
    });
  }

  async render() {
    this.drawBackground();
    this.drawSeparator();
    await this.drawLeftColumn();
    this.drawCenterColumn();
    await this.drawRightColumn();
    this.drawVersioning();
    
    if (DEBUG_MODE) {
        this.drawDebugGuides();
    }
  }
}

/**
 * Modifies the PDF, converting all pages to exactly A4 size, and adds a branded brand footer
 * on the last page. All positions and scaling are derived dynamically from the printer profile.
 * Supports 1-up, 2-up (vertical stack), and 4-up (2x2 grid) formatting in a single pass.
 */
async function modifyPdf(pdfBuffer, orderHash, orderId, pickupQrBase64, deliveryQrBase64, printType = 'bw', pagesPerSheet = 1, orderIdStr = null) {
  try {
    const srcDoc = await PDFDocument.load(pdfBuffer);
    const srcPages = srcDoc.getPages();
    const numPages = srcPages.length;
    
    if (numPages === 0) {
      throw new Error('PDF has no pages');
    }
    
    const pdfDoc = await PDFDocument.create();
    
    // Calculate total sheets (pages in the output document)
    let numSheets = numPages;
    if (pagesPerSheet === 2) {
      numSheets = Math.ceil(numPages / 2);
    } else if (pagesPerSheet === 4) {
      numSheets = Math.ceil(numPages / 4);
    }
    
    console.log(`[PDF PROCESSOR] Starting conversion: A4 output, ${pagesPerSheet} pages per sheet, total sheets: ${numSheets}`);
    
    for (let s = 0; s < numSheets; s++) {
      const newPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      const isLastSheet = (s === numSheets - 1);
      
      const bottomReserve = isLastSheet ? RESERVED_SPACE : 0;
      const availableHeight = A4_HEIGHT - bottomReserve;
      
      if (pagesPerSheet === 1) {
        const page = srcPages[s];
        const { width, height } = page.getSize();
        
        const originalWidth = width;
        const originalHeight = height;
        
        const isLetter = Math.abs(originalWidth - 612) < 5 && Math.abs(originalHeight - 792) < 5;
        const isA4 = Math.abs(originalWidth - A4_WIDTH) < 5 && Math.abs(originalHeight - A4_HEIGHT) < 5;
        const detectedPaper = isA4 ? 'A4' : (isLetter ? 'Letter' : 'Custom');
        
        const [embedded] = await pdfDoc.embedPages([page]);
        newPage.drawPage(embedded, {
          x: 0,
          y: bottomReserve,
          width: A4_WIDTH,
          height: availableHeight,
        });
        
        if (isLastSheet) {
          console.log(`[PDF PROCESSOR LOG] Page Conversion - Sheet #${s + 1} (Last Page):`);
          console.log(`  - Original Page size: ${originalWidth.toFixed(2)} x ${originalHeight.toFixed(2)} pt (${detectedPaper})`);
          console.log(`  - New Page size: ${A4_WIDTH} x ${A4_HEIGHT} pt (A4)`);
          console.log(`  - Footer Y Coordinate (Bottom Y): ${FOOTER_BOTTOM_Y.toFixed(2)} pt (${(FOOTER_BOTTOM_Y / MM_TO_PT).toFixed(2)} mm)`);
          console.log(`  - Remaining bottom whitespace: ${(FOOTER_BOTTOM_Y / MM_TO_PT).toFixed(2)} mm`);
        } else {
          console.log(`[PDF PROCESSOR LOG] Page Conversion - Sheet #${s + 1}:`);
          console.log(`  - Original Page size: ${originalWidth.toFixed(2)} x ${originalHeight.toFixed(2)} pt (${detectedPaper})`);
          console.log(`  - New Page size: ${A4_WIDTH} x ${A4_HEIGHT} pt (A4)`);
        }
      } else if (pagesPerSheet === 2) {
        // 2-up: Portrait pages stacked vertically
        const slotHeight = availableHeight / 2;
        const yScale = slotHeight / A4_HEIGHT;
        const xScale = yScale; // Keep 1:1 aspect ratio
        const w = A4_WIDTH * xScale;
        const dx = (A4_WIDTH - w) / 2; // Center horizontally
        
        console.log(`[PDF PROCESSOR LOG] Sheet #${s + 1} (2-up): yOffset: ${bottomReserve.toFixed(2)}, slotHeight: ${slotHeight.toFixed(2)}, scale: ${xScale.toFixed(3)}`);
        
        // Bottom slot (Page s*2)
        const pageIdx1 = s * 2;
        if (pageIdx1 < numPages) {
          const page1 = srcPages[pageIdx1];
          const [embedded1] = await pdfDoc.embedPages([page1]);
          newPage.drawPage(embedded1, {
            x: dx,
            y: bottomReserve,
            xScale: xScale,
            yScale: yScale,
          });
        }
        
        // Top slot (Page s*2 + 1)
        const pageIdx2 = s * 2 + 1;
        if (pageIdx2 < numPages) {
          const page2 = srcPages[pageIdx2];
          const [embedded2] = await pdfDoc.embedPages([page2]);
          newPage.drawPage(embedded2, {
            x: dx,
            y: bottomReserve + slotHeight,
            xScale: xScale,
            yScale: yScale,
          });
        }
      } else if (pagesPerSheet === 4) {
        // 4-up: 2x2 grid
        const slotWidth = A4_WIDTH / 2;
        const slotHeight = availableHeight / 2;
        const yScale = slotHeight / A4_HEIGHT;
        const xScale = yScale; // Keep 1:1 aspect ratio
        const w = A4_WIDTH * xScale;
        const dx = (slotWidth - w) / 2; // Center horizontally inside each slot
        
        console.log(`[PDF PROCESSOR LOG] Sheet #${s + 1} (4-up): yOffset: ${bottomReserve.toFixed(2)}, slotHeight: ${slotHeight.toFixed(2)}, scale: ${xScale.toFixed(3)}`);
        
        const drawSlot = async (pageIdx, xOffset, yOffset) => {
          if (pageIdx < numPages) {
            const page = srcPages[pageIdx];
            const [embedded] = await pdfDoc.embedPages([page]);
            newPage.drawPage(embedded, {
              x: xOffset + dx,
              y: yOffset,
              xScale: xScale,
              yScale: yScale,
            });
          }
        };
        
        // Bottom-Left (Slot 1)
        await drawSlot(s * 4, 0, bottomReserve);
        // Bottom-Right (Slot 2)
        await drawSlot(s * 4 + 1, slotWidth, bottomReserve);
        // Top-Left (Slot 3)
        await drawSlot(s * 4 + 2, 0, bottomReserve + slotHeight);
        // Top-Right (Slot 4)
        await drawSlot(s * 4 + 3, slotWidth, bottomReserve + slotHeight);
      }
    }
    
    // Render the brand footer on the last A4 page
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    
    const renderer = new FooterRenderer(
      lastPage,
      pdfDoc,
      orderHash,
      orderId,
      pickupQrBase64,
      deliveryQrBase64,
      printType,
      orderIdStr
    );
    await renderer.loadFonts();
    await renderer.render();
    
    const modifiedBytes = await pdfDoc.save();
    return Buffer.from(modifiedBytes);
  } catch (err) {
    console.error('Error modifying PDF in pdfProcessor:', err);
    throw err;
  }
}

module.exports = { modifyPdf, FooterRenderer };
