const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Set to true to draw layout guide lines (physical edge: red, printable margin: green,
// footer bottom: blue, footer top: magenta, separator line: orange)
const DEBUG_MODE = true;

// Configurable Printer Profile object (in mm)
const PrinterProfile = {
  printableBottomMarginMM: 3,
  footerHeightMM: 10,
  footerBottomPaddingMM: 1,
  separatorGapMM: 2,
};

const MM_TO_PT = 2.83465; // 1 mm = 2.83465 PDF points

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
const QR_SIZE = 12 * MM_TO_PT;             // 12 mm
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
  constructor(page, pdfDoc, orderHash, orderId, pickupQr, deliveryQr, printType = 'bw') {
    this.page = page;
    this.pdfDoc = pdfDoc;
    this.orderHash = orderHash;
    this.orderId = orderId;
    this.pickupQr = pickupQr;
    this.deliveryQr = deliveryQr;
    this.printType = printType;
    
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
      qrsToEmbed.push({
        base64: this.pickupQr,
        label1: this.deliveryQr ? 'Order' : 'Pickup',
        label2: `CP${shortId}`,
      });
    }
    if (this.deliveryQr) {
      qrsToEmbed.push({
        base64: this.deliveryQr,
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
      
      let qrBytes = Buffer.from(qrsToEmbed[0].base64.replace(/^data:image\/png;base64,/, ''), 'base64');
      if (isBw) {
        qrBytes = await sharp(qrBytes).grayscale().toBuffer();
      }
      const qrImage = await this.pdfDoc.embedPng(qrBytes);
      
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
      let qrBytes1 = Buffer.from(qrsToEmbed[0].base64.replace(/^data:image\/png;base64,/, ''), 'base64');
      if (isBw) {
        qrBytes1 = await sharp(qrBytes1).grayscale().toBuffer();
      }
      const qrImage1 = await this.pdfDoc.embedPng(qrBytes1);
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
      let qrBytes2 = Buffer.from(qrsToEmbed[1].base64.replace(/^data:image\/png;base64,/, ''), 'base64');
      if (isBw) {
        qrBytes2 = await sharp(qrBytes2).grayscale().toBuffer();
      }
      const qrImage2 = await this.pdfDoc.embedPng(qrBytes2);
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

  async render() {
    this.drawBackground();
    this.drawSeparator();
    await this.drawLeftColumn();
    await this.drawRightColumn();
    this.drawVersioning();
    
    if (DEBUG_MODE) {
      this.drawDebugGuides();
    }
  }
}

/**
 * Modifies the last page of the PDF using embedded FormXObject scaling to avoid content clipping.
 * All positions and scaling are derived dynamically from the printer profile configuration.
 */
async function modifyPdf(pdfBuffer, orderHash, orderId, pickupQrBase64, deliveryQrBase64, printType = 'bw') {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    
    if (pages.length === 0) {
      throw new Error('PDF has no pages');
    }
    
    const lastPageIdx = pages.length - 1;
    const lastPage = pages[lastPageIdx];
    const { width, height } = lastPage.getSize();
    
    // 1. Embed the last page as a template (FormXObject) to preserve all content streams
    const [embeddedPage] = await pdfDoc.embedPages([lastPage]);
    
    // 2. Create a new replacement page with identical dimensions
    const newPage = pdfDoc.addPage([width, height]);
    
    // 3. Draw the embedded page content onto the new page, scaled vertically to leave space for the footer
    const scaledHeight = height - RESERVED_SPACE;
    newPage.drawPage(embeddedPage, {
      x: 0,
      y: RESERVED_SPACE,
      width: width,
      height: scaledHeight,
    });
    
    // 4. Remove the original unscaled last page
    pdfDoc.removePage(lastPageIdx);
    
    // 5. Render the brand footer in the newly created bottom whitespace
    const renderer = new FooterRenderer(
      newPage,
      pdfDoc,
      orderHash,
      orderId,
      pickupQrBase64,
      deliveryQrBase64,
      printType
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
