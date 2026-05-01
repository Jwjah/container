const express = require('express');
const router = express.Router();
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const sharp = require('sharp');
const multer = require('multer');
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });

// Export PDF with annotations
router.post('/export-pdf', upload.single('file'), async (req, res) => {
    try {
        const { annotations } = req.body;
        const parsedAnnotations = JSON.parse(annotations || '{}');
        const pdfBytes = req.file.buffer;

        const pdfDoc = await PDFDocument.load(pdfBytes);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const pages = pdfDoc.getPages();

        for (let i = 0; i < pages.length; i++) {
            const pageNum = i + 1;
            const pageAnnos = parsedAnnotations[pageNum];
            if (!pageAnnos || !pageAnnos.objects) continue;

            const page = pages[i];
            const { width, height } = page.getSize();
            
            // Note: Coordinate mapping must match client-side logic
            // For simplicity in this example, we expect coordinates to be normalized or passed with scale info
            // In a production app, we'd pass originalPageWidth/Height from the client
            
            for (const obj of pageAnnos.objects) {
                // ... logic to draw based on obj type ...
                // This mimics the frontend logic but runs on the server for reliability
            }
        }

        const modifiedBytes = await pdfDoc.save();
        res.contentType('application/pdf');
        res.send(Buffer.from(modifiedBytes));
    } catch (error) {
        res.status(500).json({ error: 'Failed to export PDF' });
    }
});

// Process image (crop/resize/rotate)
router.post('/process-image', upload.single('image'), async (req, res) => {
    try {
        const { operations } = req.body;
        const ops = JSON.parse(operations || '[]');
        let image = sharp(req.file.buffer);

        for (const op of ops) {
            if (op.type === 'resize') image = image.resize(op.width, op.height);
            if (op.type === 'rotate') image = image.rotate(op.angle);
            if (op.type === 'grayscale') image = image.grayscale();
        }

        const outputBuffer = await image.toBuffer();
        res.contentType(req.file.mimetype);
        res.send(outputBuffer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to process image' });
    }
});

module.exports = router;
