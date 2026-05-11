/**
 * PdfPreviewModal — full-screen overlay PDF previewer.
 *
 * Renders as a portal-mounted modal that COVERS the current page rather than
 * navigating away to a separate route. This means:
 *   • The calling page never unmounts → "Back" is instant (no re-fetch / no
 *     boot splash flash on iOS PWA where suspending the webview while a 30s
 *     xAI call runs sometimes triggers a re-launch).
 *   • Print, share-sheet, and rotate behavior all match the previous
 *     PdfPreviewPage exactly so the UX is unchanged from the user's POV.
 *
 * Subscribes to a global `carryon:open-pdf-preview` CustomEvent so any caller
 * can pop the preview without prop-drilling or context coupling. Triggered
 * via `utils/openPdfPreview.js#openPdfPreview()`.
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Printer, AlertTriangle, Loader2 } from 'lucide-react';
import { isIOS } from '../utils/downloadFile';

const PdfPreviewModal = () => {
  const [entry, setEntry] = useState(null); // { blob, url, filename, title, subtitle }
  const canvasContainerRef = useRef(null);
  const wrapRef = useRef(null);
  const printIframeRef = useRef(null);
  const [printing, setPrinting] = useState(false);
  const [renderState, setRenderState] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [pageCount, setPageCount] = useState(0);

  // Global listener — any caller dispatches an event with the blob entry.
  useEffect(() => {
    const handler = (e) => {
      if (!e?.detail?.blob) return;
      setEntry(e.detail);
      setRenderState('loading');
      setPageCount(0);
    };
    window.addEventListener('carryon:open-pdf-preview', handler);
    return () => window.removeEventListener('carryon:open-pdf-preview', handler);
  }, []);

  const handleClose = useCallback(() => {
    if (entry?.url) {
      try { URL.revokeObjectURL(entry.url); } catch { /* ignore */ }
    }
    setEntry(null);
    setRenderState('idle');
    setPageCount(0);
  }, [entry]);

  // Esc / hardware-back support.
  useEffect(() => {
    if (!entry) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entry, handleClose]);

  // Lock body scroll while the modal is open (so the page underneath doesn't
  // scroll under iOS rubber-banding).
  useEffect(() => {
    if (!entry) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [entry]);

  // Render every page of the PDF as a stacked canvas with FIT-TO-WIDTH scale.
  useEffect(() => {
    if (!entry) return undefined;
    let cancelled = false;
    let pdfHandle = null;
    let renderToken = 0;

    const renderAtCurrentSize = async (pdf) => {
      const myToken = ++renderToken;
      const container = canvasContainerRef.current;
      const wrap = wrapRef.current;
      if (!container || !wrap) return;

      // Fit-to-WIDTH only — page exactly fills horizontal space; height
      // overflows naturally into vertical scroll. No horizontal scroll ever.
      const breath = 24;
      const availW = Math.max(120, (wrap.clientWidth || 320) - breath);
      const dpr = window.devicePixelRatio || 1;

      container.replaceChildren();

      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled || myToken !== renderToken) return;
        const page = await pdf.getPage(i);
        if (cancelled || myToken !== renderToken) return;
        const base = page.getViewport({ scale: 1 });
        const cssScale = availW / base.width;
        const renderScale = cssScale * dpr;
        const viewport = page.getViewport({ scale: renderScale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(base.width * cssScale)}px`;
        canvas.style.height = `${Math.floor(base.height * cssScale)}px`;
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto 16px';
        canvas.style.background = '#ffffff';
        canvas.style.boxShadow = '0 1px 6px rgba(0,0,0,0.18)';
        canvas.dataset.pageIndex = String(i);
        canvas.setAttribute('data-testid', `pdf-preview-page-${i}`);
        container.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled || myToken !== renderToken) return;
      }
    };

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const arrayBuffer = await entry.blob.arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        pdfHandle = pdf;
        setPageCount(pdf.numPages);
        await renderAtCurrentSize(pdf);
        if (!cancelled) setRenderState('ready');
      } catch (err) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error('PdfPreviewModal render failed:', err);
          setRenderState('error');
        }
      }
    })();

    let debounceTimer = null;
    const resizeHandler = () => {
      if (!pdfHandle) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        renderAtCurrentSize(pdfHandle).catch(() => {});
      }, 120);
    };
    window.addEventListener('resize', resizeHandler);
    window.addEventListener('orientationchange', resizeHandler);
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined' && wrapRef.current) {
      resizeObserver = new ResizeObserver(resizeHandler);
      resizeObserver.observe(wrapRef.current);
    }
    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      window.removeEventListener('resize', resizeHandler);
      window.removeEventListener('orientationchange', resizeHandler);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [entry]);

  const handlePrint = async () => {
    if (printing || !entry) return;
    setPrinting(true);
    try {
      if (isIOS() && navigator.share) {
        try {
          const file = new File([entry.blob], entry.filename, { type: 'application/pdf' });
          await navigator.share({ files: [file], title: entry.title });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
          // fall through
        }
      }
      const iframe = printIframeRef.current;
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          return;
        } catch { /* fall through to download */ }
      }
      const a = document.createElement('a');
      a.href = entry.url;
      a.download = entry.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setPrinting(false);
    }
  };

  const portalContent = useMemo(() => {
    if (!entry) return null;
    return (
      <div className="pdf-preview-modal" role="dialog" aria-modal="true" data-testid="pdf-preview-shell">
        <style>{`
          @page { size: letter; margin: 0.4in; }
          @media print {
            body > *:not(.pdf-preview-modal) { display: none !important; }
            .pdf-preview-modal { position: static !important; height: auto !important; overflow: visible !important; }
            .pdf-preview-modal .pdf-preview-toolbar,
            .pdf-preview-modal .pdf-preview-header,
            .pdf-preview-modal .pdf-preview-canvas-wrap { display: none !important; }
          }
          .pdf-preview-modal {
            position: fixed; inset: 0;
            background: #f4f4f4;
            color: #0f172a;
            display: flex; flex-direction: column;
            z-index: 2147482000;
            overflow: hidden;
            /* Use both vh AND dvh so iOS PWA always picks the dynamic value */
            height: 100vh; height: 100dvh;
          }
          .pdf-preview-modal .pdf-preview-toolbar {
            display: flex; gap: 8px;
            padding: 12px;
            padding-top: max(12px, env(safe-area-inset-top));
            padding-left: max(12px, env(safe-area-inset-left));
            padding-right: max(12px, env(safe-area-inset-right));
            background: #f4f4f4;
            flex: 0 0 auto;
          }
          .pdf-preview-modal .pdf-preview-toolbar button {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 8px 14px; border-radius: 9999px;
            font-size: 13px; font-weight: 700;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
          }
          .pdf-preview-modal .pdf-preview-toolbar button[disabled] {
            opacity: 0.55; cursor: not-allowed;
          }
          .pdf-preview-modal .pdf-preview-back {
            background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1;
          }
          .pdf-preview-modal .pdf-preview-print {
            background: #fffaf0; color: #B8860B; border: 1px solid #B8860B;
            margin-left: auto;
          }
          .pdf-preview-modal .pdf-preview-header {
            border-bottom: 2px solid #B8860B;
            padding: 0 16px 10px;
            margin: 0 4px 8px;
            display: flex; align-items: baseline; gap: 10px;
            flex: 0 0 auto;
          }
          .pdf-preview-modal .pdf-preview-header h1 {
            margin: 0;
            font-size: 18px;
            font-weight: 800;
            color: #B8860B;
            letter-spacing: 0.02em;
            line-height: 1.2;
          }
          .pdf-preview-modal .pdf-preview-header .subtitle {
            font-size: 12px;
            color: #475569;
          }
          .pdf-preview-modal .pdf-preview-header .pages {
            margin-left: auto;
            font-size: 11px;
            color: #94a3b8;
            font-weight: 600;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }
          .pdf-preview-modal .pdf-preview-canvas-wrap {
            flex: 1 1 auto;
            min-height: 0;
            width: 100%;
            overflow: auto;
            -webkit-overflow-scrolling: touch;
            padding: 0 8px 8px;
            padding-bottom: max(8px, env(safe-area-inset-bottom));
          }
          .pdf-preview-modal .pdf-preview-loading {
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 48px 24px;
            gap: 12px;
            color: #475569;
            font-size: 13px;
          }
          .pdf-preview-modal .pdf-preview-loading .spin {
            animation: pdf-spin 1s linear infinite;
            color: #B8860B;
          }
          @keyframes pdf-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
          .pdf-preview-modal .pdf-preview-error {
            padding: 24px 16px;
            color: #B91C1C;
            font-size: 14px;
            text-align: center;
          }
          .pdf-preview-modal .pdf-preview-print-iframe {
            position: absolute;
            width: 0; height: 0;
            border: 0;
            visibility: hidden;
            pointer-events: none;
          }
        `}</style>

        <div className="pdf-preview-toolbar">
          <button
            type="button"
            className="pdf-preview-back"
            onClick={handleClose}
            data-testid="pdf-preview-back"
          >
            <ChevronLeft size={14} /> Back
          </button>
          <button
            type="button"
            className="pdf-preview-print"
            onClick={handlePrint}
            disabled={printing || renderState === 'loading'}
            data-testid="pdf-preview-print"
          >
            <Printer size={14} /> {printing ? 'Opening…' : 'Print'}
          </button>
        </div>

        <div className="pdf-preview-header">
          <h1 data-testid="pdf-preview-title">{entry.title}</h1>
          {entry.subtitle ? <div className="subtitle">{entry.subtitle}</div> : null}
          {pageCount > 0 ? (
            <div className="pages" data-testid="pdf-preview-page-count">
              {pageCount} page{pageCount === 1 ? '' : 's'}
            </div>
          ) : null}
        </div>

        <div className="pdf-preview-canvas-wrap" data-testid="pdf-preview-canvas-wrap" ref={wrapRef}>
          {renderState === 'loading' && (
            <div className="pdf-preview-loading" data-testid="pdf-preview-loading">
              <Loader2 size={28} className="spin" />
              <div>Rendering pages…</div>
            </div>
          )}
          {renderState === 'error' && (
            <div className="pdf-preview-error" data-testid="pdf-preview-error">
              Failed to render PDF. Tap Print to view it in your browser's PDF dialog.
            </div>
          )}
          <div ref={canvasContainerRef} />
        </div>

        <iframe
          ref={printIframeRef}
          src={entry.url}
          title="print"
          className="pdf-preview-print-iframe"
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>
    );
  }, [entry, printing, renderState, pageCount, handleClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(portalContent, document.body);
};

export default PdfPreviewModal;

// Helper for legacy /pdf-preview/:key route compatibility — shows an
// "expired" message since the in-memory blob map no longer drives the UX.
export const PdfPreviewLegacyExpired = () => {
  return (
    <div data-testid="pdf-preview-expired" style={{
      minHeight: '100dvh', background: '#f4f4f4',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 24, color: '#0f172a',
    }}>
      <AlertTriangle style={{ width: 56, height: 56, color: '#B8860B', marginBottom: 16 }} />
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px', color: '#B8860B' }}>Preview unavailable</h2>
      <p style={{ fontSize: 14, color: '#475569', maxWidth: 360, margin: '0 0 24px' }}>
        PDF previews are now shown as an in-app overlay. Generate a new one from any export button.
      </p>
      <button
        type="button"
        onClick={() => window.history.back()}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '10px 18px', borderRadius: 9999, fontSize: 14, fontWeight: 700,
          background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', cursor: 'pointer',
        }}
        data-testid="pdf-preview-expired-back"
      >
        <ChevronLeft size={14} /> Back
      </button>
    </div>
  );
};
