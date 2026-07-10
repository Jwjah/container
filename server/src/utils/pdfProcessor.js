const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Configurable Printer Profile constants (in mm)
const printerBottomMarginMM = 3.0;      // Physical non-printable area at the bottom
const footerHeightMM = 10.0;           // Height of the CampusPrint brand footer box
const footerBottomPaddingMM = 1.0;     // Padding below the footer box
const separatorGapMM = 2.0;            // Gap between the separator line and document content

const MM_TO_PT = 2.83465; // 1 mm = 2.83465 PDF points

// Calculated physical layout points
const PRINTER_BOTTOM_MARGIN = printerBottomMarginMM * MM_TO_PT;
const FOOTER_BOTTOM_PADDING = footerBottomPaddingMM * MM_TO_PT;
const FOOTER_HEIGHT = footerHeightMM * MM_TO_PT;
const SEPARATOR_GAP = separatorGapMM * MM_TO_PT;

// Compute footer position dynamically
const FOOTER_BOTTOM_Y = PRINTER_BOTTOM_MARGIN + FOOTER_BOTTOM_PADDING;
const FOOTER_TOP_Y = FOOTER_BOTTOM_Y + FOOTER_HEIGHT;
const SEPARATOR_Y = FOOTER_TOP_Y;

// Total reserved space at the bottom to compress/scale the last page content
const RESERVED_SPACE = SEPARATOR_Y + SEPARATOR_GAP;

// Element dimensions scaled down to fit cleanly inside the 10mm footer
const QR_SIZE = 7.5 * MM_TO_PT;             
const LOGO_HEIGHT = 7.5 * MM_TO_PT;         
const SIDE_PADDING = 8 * MM_TO_PT;         
const SEPARATOR_THICKNESS = 0.3;           

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
    // Draw minimalist clean white footer background
    this.page.drawRectangle({
      x: 0,
      y: FOOTER_BOTTOM_Y,
      width: this.width,
      height: FOOTER_HEIGHT,
      color: rgb(1, 1, 1),
    });
  }

  drawSeparator() {
    const isBw = this.printType === 'bw';
    const separatorColor = isBw ? rgb(0.9, 0.9, 0.9) : rgb(0.91, 0.91, 0.93);
    // Draw very light, thin separator line
    this.page.drawLine({
      start: { x: SIDE_PADDING, y: SEPARATOR_Y },
      end: { x: this.width - SIDE_PADDING, y: SEPARATOR_Y },
      thickness: SEPARATOR_THICKNESS,
      color: separatorColor,
    });
  }

  async drawLeftColumn() {
    const logoX = SIDE_PADDING;
    const logoY = FOOTER_BOTTOM_Y + (FOOTER_HEIGHT - LOGO_HEIGHT) / 2;
    
    // 1. Draw Logo (Grayscale converted dynamically via sharp if B&W)
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
    
    const size1 = 5.5;
    const size2 = 4.0;
    const size3 = 3.5;
    
    // Vertical placement centered inside the footer box
    const textBlockHeight = size1 + size2 + size3 + 3.0;
    const startY = FOOTER_BOTTOM_Y + (FOOTER_HEIGHT - textBlockHeight) / 2;
    
    const y3 = startY;
    const y2 = y3 + size3 + 1.5;
    const y1 = y2 + size2 + 1.5;

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
    // Dynamic QR Column range: [65% of width, width - SIDE_PADDING]
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
    
    // Layout parameters centered inside footer height
    const qrY = FOOTER_BOTTOM_Y + (FOOTER_HEIGHT - QR_SIZE) / 2;
    const cap1Y = FOOTER_BOTTOM_Y + 1.2 * MM_TO_PT;
    const cap2Y = FOOTER_BOTTOM_Y + 0.3 * MM_TO_PT;
    const captionSize = 3.0;
    
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
    const vy = FOOTER_BOTTOM_Y + 0.5 * MM_TO_PT;

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

  async render() {
    this.drawBackground();
    this.drawSeparator();
    await this.drawLeftColumn();
    await this.drawRightColumn();
    this.drawVersioning();
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
