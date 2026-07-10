const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// Reusable physical layout constants (converted to PDF points: 1 mm = 2.83465 pt)
const MM_TO_PT = 2.83465;

const FOOTER_HEIGHT = 15 * MM_TO_PT;       // 15 mm = 42.52 pt
const QR_SIZE = 12 * MM_TO_PT;             // 12 mm = 34.02 pt
const LOGO_HEIGHT = 10 * MM_TO_PT;         // 10 mm = 28.35 pt
const SIDE_PADDING = 8 * MM_TO_PT;         // 8 mm = 22.68 pt
const SEPARATOR_THICKNESS = 0.3;           // 0.3 pt (ultra-thin line)

class FooterRenderer {
  constructor(page, pdfDoc, orderHash, orderId, pickupQr, deliveryQr) {
    this.page = page;
    this.pdfDoc = pdfDoc;
    this.orderHash = orderHash;
    this.orderId = orderId;
    this.pickupQr = pickupQr;
    this.deliveryQr = deliveryQr;
    
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
      y: 0,
      width: this.width,
      height: FOOTER_HEIGHT,
      color: rgb(1, 1, 1),
    });
  }

  drawSeparator() {
    // Draw very light, thin separator line
    this.page.drawLine({
      start: { x: SIDE_PADDING, y: FOOTER_HEIGHT },
      end: { x: this.width - SIDE_PADDING, y: FOOTER_HEIGHT },
      thickness: SEPARATOR_THICKNESS,
      color: rgb(0.91, 0.91, 0.93),
    });
  }

  async drawLeftColumn() {
    const logoX = SIDE_PADDING;
    const logoY = (FOOTER_HEIGHT - LOGO_HEIGHT) / 2;
    
    // 1. Draw Logo
    try {
      const logoPath = path.join(__dirname, '../assets/logo.jpg');
      if (fs.existsSync(logoPath)) {
        const logoBytes = fs.readFileSync(logoPath);
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
    
    // Vertical placement centered in FOOTER_HEIGHT (total text height = 20pt)
    const textBlockHeight = size1 + size2 + size3 + 4.0;
    const startY = (FOOTER_HEIGHT - textBlockHeight) / 2;
    
    const y3 = startY;
    const y2 = y3 + size3 + 2.0;
    const y1 = y2 + size2 + 2.0;

    this.page.drawText(line1, {
      x: textX,
      y: y1,
      size: size1,
      font: this.boldFont,
      color: rgb(0.1, 0.1, 0.15),
    });
    
    this.page.drawText(line2, {
      x: textX,
      y: y2,
      size: size2,
      font: this.font,
      color: rgb(0.3, 0.3, 0.35),
    });
    
    this.page.drawText(line3, {
      x: textX,
      y: y3,
      size: size3,
      font: this.font,
      color: rgb(0.55, 0.55, 0.6),
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
    
    // Layout parameters
    const qrY = 11.5;
    const cap1Y = 6.0;
    const cap2Y = 1.5;
    const captionSize = 4.0;
    
    if (qrsToEmbed.length === 1) {
      // Single QR layout (Centered in right column)
      const rightCenterX = (rightAreaMinX + rightAreaMaxX) / 2;
      const qrX = rightCenterX - QR_SIZE / 2;
      
      const qrBytes = Buffer.from(qrsToEmbed[0].base64.replace(/^data:image\/png;base64,/, ''), 'base64');
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
        color: rgb(0.55, 0.55, 0.6),
      });
      
      // Caption Line 2
      const w2 = this.font.widthOfTextAtSize(qrsToEmbed[0].label2, captionSize);
      this.page.drawText(qrsToEmbed[0].label2, {
        x: qrX + (QR_SIZE - w2) / 2,
        y: cap2Y,
        size: captionSize,
        font: this.font,
        color: rgb(0.55, 0.55, 0.6),
      });
      
    } else if (qrsToEmbed.length === 2) {
      // Double QR Layout spaced equally inside right area
      const gap = (rightAreaWidth - 2 * QR_SIZE) / 3;
      const qrX1 = rightAreaMinX + gap;
      const qrX2 = qrX1 + QR_SIZE + gap;
      
      // QR 1
      const qrBytes1 = Buffer.from(qrsToEmbed[0].base64.replace(/^data:image\/png;base64,/, ''), 'base64');
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
        color: rgb(0.55, 0.55, 0.6),
      });
      
      const w2 = this.font.widthOfTextAtSize(qrsToEmbed[0].label2, captionSize);
      this.page.drawText(qrsToEmbed[0].label2, {
        x: qrX1 + (QR_SIZE - w2) / 2,
        y: cap2Y,
        size: captionSize,
        font: this.font,
        color: rgb(0.55, 0.55, 0.6),
      });

      // QR 2
      const qrBytes2 = Buffer.from(qrsToEmbed[1].base64.replace(/^data:image\/png;base64,/, ''), 'base64');
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
        color: rgb(0.55, 0.55, 0.6),
      });
      
      const w4 = this.font.widthOfTextAtSize(qrsToEmbed[1].label2, captionSize);
      this.page.drawText(qrsToEmbed[1].label2, {
        x: qrX2 + (QR_SIZE - w4) / 2,
        y: cap2Y,
        size: captionSize,
        font: this.font,
        color: rgb(0.55, 0.55, 0.6),
      });
    }
  }

  drawVersioning() {
    const versionText = 'CP v1.0';
    const vSize = 5.0;
    const vWidth = this.font.widthOfTextAtSize(versionText, vSize);
    
    // Position at the extreme bottom right, offset by SIDE_PADDING
    const vx = this.width - SIDE_PADDING - vWidth;
    const vy = 1.5;

    // Draw almost-invisible version string
    this.page.drawText(versionText, {
      x: vx,
      y: vy,
      size: vSize,
      font: this.font,
      color: rgb(0.8, 0.8, 0.82),
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
 * Modifies the last page of the PDF to compress it vertically and add a branded footer.
 * 
 * @param {Buffer} pdfBuffer - Original PDF buffer
 * @param {string} orderHash - The order hash (used for short order ID)
 * @param {string} orderId - The order ID
 * @param {string} pickupQrBase64 - Base64 data URL for pickup QR code
 * @param {string} deliveryQrBase64 - Base64 data URL for delivery QR code (optional)
 * @returns {Promise<Buffer>} - Modified PDF buffer
 */
async function modifyPdf(pdfBuffer, orderHash, orderId, pickupQrBase64, deliveryQrBase64) {
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
    const scaledHeight = height - FOOTER_HEIGHT;
    newPage.drawPage(embeddedPage, {
      x: 0,
      y: FOOTER_HEIGHT,
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
      deliveryQrBase64
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
