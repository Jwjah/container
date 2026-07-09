const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

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
    
    // 1.5 cm footer in PDF points: (1.5 / 2.54) * 72 = 42.52
    const footerHeight = 42.52;
    const scaleY = (height - footerHeight) / height;
    
    // 1. Vertical compression of existing content
    lastPage.translateContent(0, footerHeight);
    lastPage.scaleContent(1, scaleY);
    
    // 2. Draw white footer background
    lastPage.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: footerHeight,
      color: rgb(1, 1, 1),
    });
    
    // 3. Draw top separator line
    lastPage.drawLine({
      start: { x: 0, y: footerHeight },
      end: { x: width, y: footerHeight },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    
    // 4. Draw Logo (Left side)
    const logoSize = 25;
    const logoY = (footerHeight - logoSize) / 2;
    const logoX = 20;
    
    try {
      const logoPath = path.join(__dirname, '../assets/logo.jpg');
      if (fs.existsSync(logoPath)) {
        const logoBytes = fs.readFileSync(logoPath);
        const logoImage = await pdfDoc.embedJpg(logoBytes);
        lastPage.drawImage(logoImage, {
          x: logoX,
          y: logoY,
          width: logoSize,
          height: logoSize,
        });
      }
    } catch (logoErr) {
      console.error('Failed to embed logo in PDF:', logoErr.message);
    }
    
    // 5. Draw center branded text
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const greeting = 'Thank you for printing with CampusPrint!';
    const website = 'campusprint.in';
    
    const greetingSize = 8;
    const websiteSize = 7.5;
    
    const greetingWidth = boldFont.widthOfTextAtSize(greeting, greetingSize);
    const websiteWidth = font.widthOfTextAtSize(website, websiteSize);
    
    const greetingX = (width - greetingWidth) / 2;
    const websiteX = (width - websiteWidth) / 2;
    
    lastPage.drawText(greeting, {
      x: greetingX,
      y: 22,
      size: greetingSize,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.2),
    });
    
    lastPage.drawText(website, {
      x: websiteX,
      y: 10,
      size: websiteSize,
      font: font,
      color: rgb(0.4, 0.4, 0.5),
    });
    
    // 6. Draw QR code(s) (Right side)
    const qrSize = 28;
    const qrY = 9.5;
    const qrSpacing = 10;
    const orderIdText = `#${orderHash.substring(0, 8).toUpperCase()}`;
    const fontSize = 5;
    
    const qrsToEmbed = [];
    if (pickupQrBase64) qrsToEmbed.push(pickupQrBase64);
    if (deliveryQrBase64) qrsToEmbed.push(deliveryQrBase64);
    
    if (qrsToEmbed.length === 1) {
      // Single QR layout
      const qrX = width - 20 - qrSize;
      
      const qrBytes = Buffer.from(qrsToEmbed[0].replace(/^data:image\/png;base64,/, ''), 'base64');
      const qrImage = await pdfDoc.embedPng(qrBytes);
      
      lastPage.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: qrSize,
        height: qrSize,
      });
      
      const textWidth = font.widthOfTextAtSize(orderIdText, fontSize);
      const textX = qrX + (qrSize - textWidth) / 2;
      lastPage.drawText(orderIdText, {
        x: textX,
        y: 2.5,
        size: fontSize,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
      });
    } else if (qrsToEmbed.length === 2) {
      // Double QR layout side-by-side
      const qrX2 = width - 20 - qrSize;
      const qrX1 = qrX2 - qrSpacing - qrSize;
      
      // QR 1
      const qrBytes1 = Buffer.from(qrsToEmbed[0].replace(/^data:image\/png;base64,/, ''), 'base64');
      const qrImage1 = await pdfDoc.embedPng(qrBytes1);
      lastPage.drawImage(qrImage1, {
        x: qrX1,
        y: qrY,
        width: qrSize,
        height: qrSize,
      });
      
      const textWidth1 = font.widthOfTextAtSize(orderIdText, fontSize);
      const textX1 = qrX1 + (qrSize - textWidth1) / 2;
      lastPage.drawText(orderIdText, {
        x: textX1,
        y: 2.5,
        size: fontSize,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
      });
      
      // QR 2
      const qrBytes2 = Buffer.from(qrsToEmbed[1].replace(/^data:image\/png;base64,/, ''), 'base64');
      const qrImage2 = await pdfDoc.embedPng(qrBytes2);
      lastPage.drawImage(qrImage2, {
        x: qrX2,
        y: qrY,
        width: qrSize,
        height: qrSize,
      });
      
      const textWidth2 = font.widthOfTextAtSize(orderIdText, fontSize);
      const textX2 = qrX2 + (qrSize - textWidth2) / 2;
      lastPage.drawText(orderIdText, {
        x: textX2,
        y: 2.5,
        size: fontSize,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
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
