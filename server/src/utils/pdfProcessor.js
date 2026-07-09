const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// Reusable physical layout constants (converted to PDF points: 1 mm = 2.83465 pt)
const MM_TO_PT = 2.83465;

const FOOTER_HEIGHT = 15 * MM_TO_PT;       // 15 mm = 42.52 pt
const QR_SIZE = 12 * MM_TO_PT;             // 12 mm = 34.02 pt
const LOGO_HEIGHT = 10 * MM_TO_PT;         // 10 mm = 28.35 pt
const SIDE_PADDING = 8 * MM_TO_PT;         // 8 mm = 22.68 pt
const SEPARATOR_THICKNESS = 0.5;           // 0.5 pt

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
    
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();
    
    // Calculate the vertical scale factor to fit the 15mm footer
    const scaleY = (height - FOOTER_HEIGHT) / height;
    
    // Scale existing content first (relative to origin), then translate it up above the footer.
    // This maps the content from [0, height] to [FOOTER_HEIGHT, height] perfectly without any gaps.
    lastPage.scaleContent(1, scaleY);
    lastPage.translateContent(0, FOOTER_HEIGHT);
    
    // Draw minimalist clean footer background
    lastPage.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: FOOTER_HEIGHT,
      color: rgb(1, 1, 1),
    });
    
    // Draw thin separator line (0.5 pt)
    lastPage.drawLine({
      start: { x: SIDE_PADDING, y: FOOTER_HEIGHT },
      end: { x: width - SIDE_PADDING, y: FOOTER_HEIGHT },
      thickness: SEPARATOR_THICKNESS,
      color: rgb(0.85, 0.85, 0.85),
    });
    
    // --- COLUMN 1: LEFT (20% of width) -> Logo only ---
    const logoX = SIDE_PADDING;
    const logoY = (FOOTER_HEIGHT - LOGO_HEIGHT) / 2;
    
    try {
      const logoPath = path.join(__dirname, '../assets/logo.jpg');
      if (fs.existsSync(logoPath)) {
        const logoBytes = fs.readFileSync(logoPath);
        const logoImage = await pdfDoc.embedJpg(logoBytes);
        
        // Render logo centered vertically
        lastPage.drawImage(logoImage, {
          x: logoX,
          y: logoY,
          width: LOGO_HEIGHT,
          height: LOGO_HEIGHT,
        });
      }
    } catch (logoErr) {
      console.error('Failed to embed logo in PDF:', logoErr.message);
    }
    
    // --- COLUMN 2: CENTER (50% of width) -> Branded text stack ---
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const textCenter = width * 0.45; // Center of the middle 50% column
    
    const line1 = 'CampusPrint';
    const line2 = 'Printing made effortless.';
    const line3 = 'campusprint.in';
    
    const size1 = 7.5;
    const size2 = 6.0;
    const size3 = 5.0;
    
    const w1 = boldFont.widthOfTextAtSize(line1, size1);
    const w2 = font.widthOfTextAtSize(line2, size2);
    const w3 = font.widthOfTextAtSize(line3, size3);
    
    // Alignments
    const x1 = textCenter - w1 / 2;
    const x2 = textCenter - w2 / 2;
    const x3 = textCenter - w3 / 2;
    
    // Vertical placement for equal optical spacing within the 15mm (42.52 pt) height
    const y3 = 5.0;
    const y2 = y3 + size3 + 3.0; // 13.0 pt
    const y1 = y2 + size2 + 3.0; // 22.0 pt
    
    lastPage.drawText(line1, {
      x: x1,
      y: y1,
      size: size1,
      font: boldFont,
      color: rgb(0.05, 0.05, 0.1),
    });
    
    lastPage.drawText(line2, {
      x: x2,
      y: y2,
      size: size2,
      font: font,
      color: rgb(0.2, 0.2, 0.25),
    });
    
    lastPage.drawText(line3, {
      x: x3,
      y: y3,
      size: size3,
      font: font,
      color: rgb(0.5, 0.5, 0.55),
    });
    
    // --- COLUMN 3: RIGHT (30% of width) -> Dynamic QR Codes ---
    const rightAreaMinX = width * 0.70;
    const rightAreaMaxX = width - SIDE_PADDING;
    const rightAreaWidth = rightAreaMaxX - rightAreaMinX;
    
    const qrsToEmbed = [];
    if (pickupQrBase64) {
      qrsToEmbed.push({
        base64: pickupQrBase64,
        label: deliveryQrBase64 ? 'Pickup' : `Order #${orderHash.substring(0, 8).toUpperCase()}`,
      });
    }
    if (deliveryQrBase64) {
      qrsToEmbed.push({
        base64: deliveryQrBase64,
        label: 'Delivery',
      });
    }
    
    // Y coordinates for QR code and caption underneath
    const qrY = 9.0;
    const captionY = 2.5;
    const captionSize = 4.5;
    
    if (qrsToEmbed.length === 1) {
      // Single QR centered in the Right Column area
      const rightCenterX = (rightAreaMinX + rightAreaMaxX) / 2;
      const qrX = rightCenterX - QR_SIZE / 2;
      
      const qrBytes = Buffer.from(qrsToEmbed[0].base64.replace(/^data:image\/png;base64,/, ''), 'base64');
      const qrImage = await pdfDoc.embedPng(qrBytes);
      
      lastPage.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: QR_SIZE,
        height: QR_SIZE,
      });
      
      const labelWidth = font.widthOfTextAtSize(qrsToEmbed[0].label, captionSize);
      const labelX = qrX + (QR_SIZE - labelWidth) / 2;
      lastPage.drawText(qrsToEmbed[0].label, {
        x: labelX,
        y: captionY,
        size: captionSize,
        font: font,
        color: rgb(0.4, 0.4, 0.45),
      });
      
    } else if (qrsToEmbed.length === 2) {
      // Double QRs spaced equally inside the Right Column area
      const gap = (rightAreaWidth - 2 * QR_SIZE) / 3;
      
      const qrX1 = rightAreaMinX + gap;
      const qrX2 = qrX1 + QR_SIZE + gap;
      
      // QR 1 (Order/Pickup)
      const qrBytes1 = Buffer.from(qrsToEmbed[0].base64.replace(/^data:image\/png;base64,/, ''), 'base64');
      const qrImage1 = await pdfDoc.embedPng(qrBytes1);
      lastPage.drawImage(qrImage1, {
        x: qrX1,
        y: qrY,
        width: QR_SIZE,
        height: QR_SIZE,
      });
      
      // Order QR gets Order ID printed under it
      const orderLabel = `Order #${orderHash.substring(0, 8).toUpperCase()}`;
      const labelWidth1 = font.widthOfTextAtSize(orderLabel, captionSize);
      const labelX1 = qrX1 + (QR_SIZE - labelWidth1) / 2;
      lastPage.drawText(orderLabel, {
        x: labelX1,
        y: captionY,
        size: captionSize,
        font: font,
        color: rgb(0.4, 0.4, 0.45),
      });
      
      // QR 2 (Delivery)
      const qrBytes2 = Buffer.from(qrsToEmbed[1].base64.replace(/^data:image\/png;base64,/, ''), 'base64');
      const qrImage2 = await pdfDoc.embedPng(qrBytes2);
      lastPage.drawImage(qrImage2, {
        x: qrX2,
        y: qrY,
        width: QR_SIZE,
        height: QR_SIZE,
      });
      
      const labelWidth2 = font.widthOfTextAtSize(qrsToEmbed[1].label, captionSize);
      const labelX2 = qrX2 + (QR_SIZE - labelWidth2) / 2;
      lastPage.drawText(qrsToEmbed[1].label, {
        x: labelX2,
        y: captionY,
        size: captionSize,
        font: font,
        color: rgb(0.4, 0.4, 0.45),
      });
    }
    
    const modifiedBytes = await pdfDoc.save();
    return Buffer.from(modifiedBytes);
  } catch (err) {
    console.error('Error modifying PDF in pdfProcessor:', err);
    throw err;
  }
}

module.exports = { modifyPdf };
