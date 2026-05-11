/**
 * PdfPreviewPage — universal preview wrapper for ALL server-generated PDFs
 * across the platform (EGA, IAC, CFP Hand-off, CCP, SOC2, Messages…).
 *
 * Renders the PDF page-by-page via PDF.js so users can SCROLL through every
 * page inside the preview surface itself — not just see page 1. iOS Safari's
 * native PDF viewer in an <iframe src=blob:> only shows the first page with
 * no scrolling, which is exactly the bug the user reported.
 *
 * Mirrors the EntitiesPrintPage toolbar:
 *   • Sticky Back + Print at top (safe-area aware)
 *   • @media print hides the toolbar; print uses a hidden iframe with the
 *     blob URL so the OS print dialog still gets a clean, vectored PDF.
 *   • Print:  iOS  → navigator.share() (native share sheet)
 *             else → hidden iframe contentWindow.print()
 *             else → download fallback
 *   • Back  → navigate(-1)
 *
 * The E&S print page (EntitiesPrintPage.js) is intentionally NOT routed
 * through here — it remains its own dedicated page per user's standing rule.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Printer, AlertTriangle, Loader2 } from 'lucide-react';
import { consumePreviewEntry, disposePreviewEntry } from '../../utils/openPdfPreview';
import { isIOS } from '../../utils/downloadFile';

export default function PdfPreviewPage() {
  const navigate = useNavigate();
  const { key } = useParams();
  const canvasContainerRef = useRef(null);
  const wrapRef = useRef(null);
  const printIframeRef = useRef(null);
  const [printing, setPrinting] = useState(false);
  const [renderState, setRenderState] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [pageCount, setPageCount] = useState(0);

  const entry = useMemo(() => consumePreviewEntry(key), [key]);

  // Render every page of the PDF as a stacked canvas. Uses dynamic import
  // so the ~500 KB pdfjs library is lazy-loaded only when a user actually
  // hits a preview page (not on every app load).
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    let pdfHandle = null;
    let renderToken = 0;

    const renderAtCurrentSize = async (pdf) => {
      const myToken = ++renderToken;
      const container = canvasContainerRef.current;
      const wrap = wrapRef.current;
      if (!container || !wrap) return;

      // Available width for ONE page: subtract small breathing-room padding
      // on each side so the page never crowds the edges of the scrollable
      // area. We scale each page to fit the WIDTH of the visible area —
      // height is allowed to overflow into vertical scroll. No horizontal
      // scroll ever, on any device. The user explicitly opted for this:
      // "fit width, don't mind scrolling down for the rest of the height."
      const breath = 24; // ~12px margin on each side
      const availW = Math.max(120, (wrap.clientWidth || 320) - breath);
      const dpr = window.devicePixelRatio || 1;

      // Pre-flight: collect viewports so we can render quickly without
      // re-fetching pages on resize.
      container.replaceChildren();

      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled || myToken !== renderToken) return;
        const page = await pdf.getPage(i);
        if (cancelled || myToken !== renderToken) return;
        const base = page.getViewport({ scale: 1 });
        // FIT-TO-WIDTH only: page exactly fits the visible width; vertical
        // overflow is fine and produces normal scroll-down behavior.
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
        // Worker is shipped in /public so it's served same-origin and works
        // even when the PWA is being inspected offline-first.
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const arrayBuffer = await entry.blob.arrayBuffer();
        if (cancelled) return;
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        pdfHandle = pdf;
        setPageCount(pdf.numPages);
        await renderAtCurrentSize(pdf);
        if (!cancelled) setRenderState('ready');
      } catch (err) {
        if (!cancelled) {
          console.error('PdfPreviewPage render failed:', err);
          setRenderState('error');
        }
      }
    })();

    // Re-render on viewport changes (orientation flip, window resize,
    // browser chrome show/hide, split-screen toggle on iPad). Debounced
    // to avoid thrashing during a drag-to-resize on desktop.
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

  if (!entry) {
    return (
      <div className="pdf-preview-empty" data-testid="pdf-preview-expired">
        <style>{`
          .pdf-preview-empty {
            min-height: 100vh; min-height: 100dvh;
            background: #f4f4f4;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            text-align: center; padding: 24px;
            color: #0f172a;
          }
          .pdf-preview-empty .icon {
            width: 56px; height: 56px; color: #B8860B; margin-bottom: 16px;
          }
          .pdf-preview-empty h2 {
            font-size: 18px; font-weight: 800; margin: 0 0 6px;
            color: #B8860B; letter-spacing: 0.02em;
          }
          .pdf-preview-empty p {
            font-size: 14px; color: #475569; margin: 0 0 24px; max-width: 360px;
          }
          .pdf-preview-empty button {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 10px 18px; border-radius: 9999px;
            font-size: 14px; font-weight: 700; cursor: pointer;
            background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1;
          }
        `}</style>
        <AlertTriangle className="icon" />
        <h2>Preview expired</h2>
        <p>This PDF preview was generated more than 30 minutes ago, or the page was refreshed. Tap Back and generate it again.</p>
        <button type="button" onClick={() => navigate(-1)} data-testid="pdf-preview-expired-back">
          <ChevronLeft size={14} /> Back
        </button>
      </div>
    );
  }

  const { url, filename, title, subtitle, blob } = entry;

  const handlePrint = async () => {
    if (printing) return;
    setPrinting(true);
    try {
      // iOS: native share sheet handles Print / Save to Files / etc.
      if (isIOS() && navigator.share) {
        try {
          const file = new File([blob], filename, { type: 'application/pdf' });
          await navigator.share({ files: [file], title });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
          // fall through to hidden iframe print
        }
      }
      // Desktop / Android: print via a hidden iframe loaded with the blob URL.
      // We render the PDF as canvases for VIEWING (because iOS can't scroll
      // an inline PDF iframe), but for PRINTING we hand the raw PDF to the
      // browser so the print dialog gets a vector PDF, not rasterized images.
      const iframe = printIframeRef.current;
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          return;
        } catch {
          // Some browsers block iframe.print() — fall through to download.
        }
      }
      // Last resort: download.
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="pdf-preview-shell" data-testid="pdf-preview-shell">
      <style>{`
        @page { size: letter; margin: 0.4in; }
        @media print {
          .pdf-preview-toolbar { display: none !important; }
          .pdf-preview-header  { display: none !important; }
          .pdf-preview-shell   { padding: 0 !important; height: auto !important; overflow: visible !important; }
          .pdf-preview-canvas-wrap { display: none !important; }
        }
        html, body, #root { background: #f4f4f4 !important; }
        .pdf-preview-shell {
          min-height: 100vh; min-height: 100dvh;
          height: 100vh; height: 100dvh;
          background: #f4f4f4;
          color: #0f172a;
          display: flex; flex-direction: column;
          position: relative;
          overflow: hidden;
        }
        .pdf-preview-toolbar {
          display: flex; gap: 8px;
          padding: 12px;
          padding-top: max(12px, env(safe-area-inset-top));
          padding-left: max(12px, env(safe-area-inset-left));
          padding-right: max(12px, env(safe-area-inset-right));
          position: sticky; top: 0;
          background: #f4f4f4;
          z-index: 10;
        }
        .pdf-preview-toolbar button {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 9999px;
          font-size: 13px; font-weight: 700;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .pdf-preview-toolbar button[disabled] {
          opacity: 0.55; cursor: not-allowed;
        }
        .pdf-preview-back {
          background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1;
        }
        .pdf-preview-print {
          background: #fffaf0; color: #B8860B; border: 1px solid #B8860B;
          margin-left: auto;
        }
        .pdf-preview-header {
          border-bottom: 2px solid #B8860B;
          padding: 0 16px 10px;
          margin: 0 4px 8px;
          display: flex; align-items: baseline; gap: 10px;
        }
        .pdf-preview-header h1 {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          color: #B8860B;
          letter-spacing: 0.02em;
          line-height: 1.2;
        }
        .pdf-preview-header .subtitle {
          font-size: 12px;
          color: #475569;
        }
        .pdf-preview-header .pages {
          margin-left: auto;
          font-size: 11px;
          color: #94a3b8;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .pdf-preview-canvas-wrap {
          flex: 1 1 auto;
          min-height: 0;
          width: 100%;
          overflow: auto;
          -webkit-overflow-scrolling: touch;
          padding: 0 8px 8px;
          padding-bottom: max(8px, env(safe-area-inset-bottom));
        }
        .pdf-preview-loading {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 48px 24px;
          gap: 12px;
          color: #475569;
          font-size: 13px;
        }
        .pdf-preview-loading .spin {
          animation: pdf-spin 1s linear infinite;
          color: #B8860B;
        }
        @keyframes pdf-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        .pdf-preview-error {
          padding: 24px 16px;
          color: #B91C1C;
          font-size: 14px;
          text-align: center;
        }
        /* Hidden print iframe — invisible to the user, used only as the
           target for window.print() so the OS dialog gets the raw PDF. */
        .pdf-preview-print-iframe {
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
          onClick={() => navigate(-1)}
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
        <h1 data-testid="pdf-preview-title">{title}</h1>
        {subtitle ? <div className="subtitle">{subtitle}</div> : null}
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

      {/* Hidden iframe used only for the Print button on non-iOS platforms.
          The blob URL renders as a vector PDF inside the OS print dialog. */}
      <iframe
        ref={printIframeRef}
        src={url}
        title="print"
        className="pdf-preview-print-iframe"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}

// Re-export so call-sites can dispose entries if they need to (rare).
export { disposePreviewEntry };
