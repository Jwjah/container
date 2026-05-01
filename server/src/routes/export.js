const express = require('express');
const router = express.Router();
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const multer = require('multer');
const upload = multer();

router.post('/pdf', upload.single('file'), async (req, res) => {
  try {
    const { annotations } = req.body;
    const parsedAnnos = JSON.parse(annotations || '{}');
    const pdfBytes = req.file.buffer;

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    for (let i = 0; i < pages.length; i++) {
      const pageAnnos = parsedAnnos[i + 1];
      if (!pageAnnos?.objects) continue;
      const page = pages[i];
      const { width, height } = page.getSize();

      // Note: Scale info would be needed here for perfect matching if client resolution differs
      // For now we assume a standard coordinate system passed from client
      for (const obj of pageAnnos.objects) {
        if (obj.type === 'textbox' || obj.type === 'text') {
          page.drawText(obj.text, {
            x: obj.left,
            y: height - obj.top - obj.fontSize,
            size: obj.fontSize,
            font,
            color: rgb(0, 0, 0)
          });
        } else if (obj.type === 'rect') {
          page.drawRectangle({
            x: obj.left,
            y: height - obj.top - obj.height,
            width: obj.width,
            height: obj.height,
            color: rgb(1, 1, 1)
          });
        }
      }
    }

    const modifiedBytes = await pdfDoc.save();
    res.contentType('application/pdf');
    res.send(Buffer.from(modifiedBytes));
  } catch (err) {
    res.status(500).json({ error: 'Failed to export PDF' });
  }
});

module.exports = router;
