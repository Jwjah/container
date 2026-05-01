'use client';

import React from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  pdfUrl: string;
  currentPage: number;
  scale: number;
  onLoadSuccess: (info: any) => void;
  onPageLoadSuccess: (page: any) => void;
  children?: React.ReactNode;
}

export default function PdfViewer({ 
  pdfUrl, currentPage, scale, onLoadSuccess, onPageLoadSuccess, children 
}: PdfViewerProps) {
  return (
    <div style={{ position: 'relative', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
      <Document file={pdfUrl} onLoadSuccess={onLoadSuccess}>
        <div style={{ position: 'relative' }}>
          <Page 
            pageNumber={currentPage} 
            scale={scale} 
            renderTextLayer={true} 
            renderAnnotationLayer={false}
            onLoadSuccess={onPageLoadSuccess}
          />
          {children}
        </div>
      </Document>
      <style jsx global>{`
        .textLayer { z-index: 1; }
        .canvas-container { margin: 0 auto !important; }
      `}</style>
    </div>
  );
}
