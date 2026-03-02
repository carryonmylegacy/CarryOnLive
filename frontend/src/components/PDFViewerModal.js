import React, { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  Eye, Download, X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, FileText
} from 'lucide-react';
import { Button } from './ui/button';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PDFViewerModal = ({ open, onClose, doc, blobUrl, loading, onDownload }) => {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pdfError, setPdfError] = useState(false);

  const isPdf = doc?.file_type?.toLowerCase().includes('pdf');
  const isImage = doc?.file_type?.toLowerCase().includes('image');

  const onDocumentLoadSuccess = useCallback(({ numPages: total }) => {
    setNumPages(total);
    setCurrentPage(1);
    setPdfError(false);
  }, []);

  const onDocumentLoadError = useCallback(() => {
    setPdfError(true);
  }, []);

  const goToPrev = () => setCurrentPage(p => Math.max(1, p - 1));
  const goToNext = () => setCurrentPage(p => Math.min(numPages || 1, p + 1));
  const zoomIn = () => setScale(s => Math.min(2.5, s + 0.25));
  const zoomOut = () => setScale(s => Math.max(0.5, s - 0.25));

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      data-testid="pdf-viewer-modal"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Close button — outside the frame, top-right corner */}
      <button
        onClick={onClose}
        className="absolute z-[101] w-10 h-10 rounded-full flex items-center justify-center bg-[#1a2440] border border-[rgba(255,255,255,0.15)] text-white transition-transform active:scale-90"
        style={{
          top: 'calc(env(safe-area-inset-top, 16px) + 12px)',
          right: '12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}
        data-testid="pdf-viewer-close"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Floating tile — centered */}
      <div
        className="relative w-[90vw] max-w-4xl max-h-[80vh] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: 'var(--bg, #0F1629)',
          border: '1px solid var(--b, rgba(255,255,255,0.08))',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,175,55,0.1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--b)]" style={{ background: 'rgba(212,175,55,0.04)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <Eye className="w-5 h-5 text-[#d4af37] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-white font-semibold text-sm truncate" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {doc?.name || 'Document Preview'}
              </h3>
              {isPdf && numPages && (
                <p className="text-[#64748b] text-xs">{numPages} page{numPages !== 1 ? 's' : ''}</p>
              )}
            </div>
          </div>
          <Button
            variant="ghost" size="sm"
            onClick={() => { onDownload?.(doc); }}
            className="text-[#94a3b8] hover:text-white h-8 px-3"
            data-testid="pdf-viewer-download"
          >
            <Download className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:inline text-xs">Download</span>
          </Button>
        </div>

        {/* PDF Controls (only for PDFs) */}
        {isPdf && !loading && blobUrl && !pdfError && (
          <div className="flex items-center justify-center gap-3 px-4 py-2 border-b border-[var(--b)]" style={{ background: 'rgba(0,0,0,0.2)' }}>
            <Button variant="ghost" size="sm" onClick={zoomOut} disabled={scale <= 0.5}
              className="text-[#94a3b8] hover:text-white h-7 w-7 p-0">
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <span className="text-[#94a3b8] text-xs min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
            <Button variant="ghost" size="sm" onClick={zoomIn} disabled={scale >= 2.5}
              className="text-[#94a3b8] hover:text-white h-7 w-7 p-0">
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <div className="w-px h-4 bg-[var(--b)] mx-1" />
            <Button variant="ghost" size="sm" onClick={goToPrev} disabled={currentPage <= 1}
              className="text-[#94a3b8] hover:text-white h-7 w-7 p-0">
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-[#94a3b8] text-xs min-w-[4rem] text-center">
              {currentPage} / {numPages || '—'}
            </span>
            <Button variant="ghost" size="sm" onClick={goToNext} disabled={currentPage >= (numPages || 1)}
              className="text-[#94a3b8] hover:text-white h-7 w-7 p-0">
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-4" style={{ background: isPdf ? '#525659' : 'transparent' }}>
          {loading ? (
            <div className="flex flex-col items-center justify-center h-96 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#d4af37]" />
              <p className="text-[#94a3b8] text-sm">Decrypting document...</p>
            </div>
          ) : !blobUrl ? (
            <div className="flex flex-col items-center justify-center h-96 gap-3">
              <FileText className="w-12 h-12 text-[#64748b]" />
              <p className="text-[#94a3b8] text-sm">Preview not available</p>
              <Button className="gold-button mt-2" onClick={() => onDownload?.(doc)}>
                <Download className="w-4 h-4 mr-2" />Download Instead
              </Button>
            </div>
          ) : isPdf ? (
            pdfError ? (
              <div className="flex flex-col items-center justify-center h-96 gap-3">
                <FileText className="w-12 h-12 text-[#64748b]" />
                <p className="text-[#94a3b8] text-sm">Could not render PDF</p>
                <Button className="gold-button mt-2" onClick={() => onDownload?.(doc)}>
                  <Download className="w-4 h-4 mr-2" />Download Instead
                </Button>
              </div>
            ) : (
              <Document
                file={blobUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="flex items-center justify-center h-96">
                    <Loader2 className="w-8 h-8 animate-spin text-[#d4af37]" />
                  </div>
                }
              >
                <Page
                  pageNumber={currentPage}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  loading=""
                />
              </Document>
            )
          ) : isImage ? (
            <img
              src={blobUrl}
              alt={doc?.name}
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-96 gap-3">
              <FileText className="w-12 h-12 text-[#64748b]" />
              <p className="text-[#94a3b8] text-sm">Preview not available for this file type</p>
              <Button className="gold-button mt-2" onClick={() => onDownload?.(doc)}>
                <Download className="w-4 h-4 mr-2" />Download Instead
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFViewerModal;
