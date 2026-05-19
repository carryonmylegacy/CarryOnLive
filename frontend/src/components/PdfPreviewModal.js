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
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Printer, Download, AlertTriangle, Loader2, Share2, RefreshCw } from 'lucide-react';
import { isIOS } from '../utils/downloadFile';
import ShareBinderModal from './ShareBinderModal';
import { API_URL } from '../config';

// pdf_types that the modal can refresh IN-PLACE via a hidden
// iframe + autoCache=1 query param. Other types fall back to the
// "navigate to the section" behavior (the manifest's `route` field).
// Extending this is a one-line addition once the destination print
// page implements the autoCache useEffect + postMessage handshake.
const IN_PLACE_REFRESH_TYPES = new Set(['entities_structures']);

const _formatAgo = (iso) => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const PdfPreviewModal = () => {
  const [entry, setEntry] = useState(null); // { blob, url, filename, title, subtitle, sections }
  const navigate = useNavigate();
  const canvasContainerRef = useRef(null);
  const wrapRef = useRef(null);
  const printIframeRef = useRef(null);
  const [printing, setPrinting] = useState(false);
  const [renderState, setRenderState] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [pageCount, setPageCount] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [refreshingType, setRefreshingType] = useState(null);
  const refreshIframeRef = useRef(null);
  const refreshTimerRef = useRef(null);

  // ── In-place "Refresh" for a binder section (May 22, 2026 mandate) ─
  // Spawns a hidden iframe at the section's print page with
  // `?autoCache=1`, listens for a `carryon:section-cached`
  // postMessage from that page, then re-runs the binder generate
  // endpoint and swaps the modal's PDF blob with the fresh one —
  // all without the user leaving the preview. Other sections that
  // haven't yet implemented the autoCache hook fall back to
  // navigating to their page (graceful degrade — same UX as before).
  const handleSectionRefresh = useCallback(async (section) => {
    if (!section || refreshingType) return;
    if (!IN_PLACE_REFRESH_TYPES.has(section.pdf_type) || !section.capture_route) {
      // Graceful fallback: navigate (legacy behavior). Other section
      // pages can opt-in to in-place by adding an autoCache useEffect
      // mirroring EntitiesPrintPage's pattern.
      handleClose();
      navigate(section.route || '/dashboard');
      return;
    }

    setRefreshingType(section.pdf_type);

    // Build the hidden iframe.
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;left:-99999px;top:-99999px;width:1280px;height:900px;border:0;opacity:0;pointer-events:none;';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.src = section.capture_route;
    refreshIframeRef.current = iframe;

    const cleanup = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      window.removeEventListener('message', onMessage);
      try { iframe.parentNode?.removeChild(iframe); } catch { /* already detached */ }
      refreshIframeRef.current = null;
    };

    const refreshBinderBlob = async () => {
      // Re-call the binder generator so the modal's preview reflects
      // the new cached section. Same endpoint EstateBinderButton hits.
      const token = (typeof window !== 'undefined' && window.localStorage)
        ? window.localStorage.getItem('carryon_token') : null;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_URL}/estate-binder/generate`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`binder regen failed: ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/pdf')) throw new Error('binder regen returned non-PDF');
      const blob = await res.blob();
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);
      // Also refresh the manifest so the row timestamps update.
      let nextSections = entry?.sections || [];
      try {
        const mres = await fetch(`${API_URL}/estate-binder/manifest`, { headers });
        if (mres.ok) {
          const mdata = await mres.json();
          nextSections = mdata.available || [];
        }
      } catch { /* keep stale manifest — better than blanking it */ }
      // Swap the preview blob in place. Reusing the open-pdf-preview
      // event triggers the existing render pipeline for free.
      setEntry((prev) => {
        if (!prev) return prev;
        try { URL.revokeObjectURL(prev.url); } catch { /* ignore */ }
        return { ...prev, blob: pdfBlob, url, sections: nextSections };
      });
      setRenderState('loading');
      setPageCount(0);
    };

    const onMessage = async (e) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data || {};
      if (d.type !== 'carryon:section-cached') return;
      if (d.pdfType !== section.pdf_type) return;
      cleanup();
      if (!d.ok) {
        setRefreshingType(null);
        // eslint-disable-next-line no-alert
        alert(`Couldn't refresh ${section.display_title}: ${d.error || 'unknown error'}`);
        return;
      }
      try {
        await refreshBinderBlob();
      } catch (err) {
        // eslint-disable-next-line no-alert
        alert(`Section refreshed but binder regen failed: ${err?.message || 'unknown'}`);
      } finally {
        setRefreshingType(null);
      }
    };

    window.addEventListener('message', onMessage);
    refreshTimerRef.current = setTimeout(() => {
      cleanup();
      setRefreshingType(null);
      // eslint-disable-next-line no-alert
      alert(`Refresh of ${section.display_title} timed out. Try again from the section page.`);
    }, 45000);

    document.body.appendChild(iframe);
  }, [refreshingType, navigate, entry?.sections]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up the iframe + timer if the modal closes mid-refresh.
  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const iframe = refreshIframeRef.current;
    if (iframe?.parentNode) iframe.parentNode.removeChild(iframe);
  }, []);

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

        // Overlay an HTML annotation layer so PDF Link annotations
        // (the TOC hot-links we embed in the Estate Binder) actually
        // click through. PDF.js renders pages as flat canvases by
        // default — annotations don't survive — so we manually draw
        // anchor elements positioned on top of the canvas using the
        // viewport's `convertToViewportRectangle`.
        try {
          const annotations = await page.getAnnotations({ intent: 'display' });
          const linkAnnots = (annotations || []).filter((a) => a.subtype === 'Link');
          if (linkAnnots.length) {
            // CSS viewport for positioning (1:1 with canvas style px,
            // independent of the dpr-scaled render bitmap).
            const cssViewport = page.getViewport({ scale: cssScale });
            const overlay = document.createElement('div');
            overlay.style.position = 'absolute';
            overlay.style.inset = '0';
            overlay.style.pointerEvents = 'none';
            for (const annot of linkAnnots) {
              const rect = cssViewport.convertToViewportRectangle(annot.rect);
              const [x1, y1, x2, y2] = rect;
              const left = Math.min(x1, x2);
              const top = Math.min(y1, y2);
              const width = Math.abs(x2 - x1);
              const height = Math.abs(y2 - y1);
              // Use <button> instead of <a href="#"> so a failed
              // destination resolve can never trigger a hash-route
              // navigation that bounces the user back to /dashboard.
              const a = document.createElement('button');
              a.type = 'button';
              a.setAttribute('data-pdf-link', '1');
              a.setAttribute('aria-label', 'Jump to section');
              a.style.position = 'absolute';
              a.style.left = `${left}px`;
              a.style.top = `${top}px`;
              a.style.width = `${width}px`;
              a.style.height = `${height}px`;
              a.style.pointerEvents = 'auto';
              a.style.cursor = 'pointer';
              a.style.background = 'transparent';
              a.style.border = 'none';
              a.style.padding = '0';
              a.style.margin = '0';
              // Resolve target page index. PDF.js may give us:
              //   - annot.dest (string name OR array)
              //   - annot.action / annot.unsafeUrl for /A actions
              // We handle the explicit /A → /GoTo → /D path that pypdf
              // 6.x produces for internal links.
              let targetIndex = null;
              try {
                let dest = annot.dest;
                if (!dest && annot.url == null) {
                  // Some PDF.js versions surface internal /GoTo actions
                  // via annot.dest being null and the destination
                  // hiding under `annot.action`/`annot.unsafeUrl`. Pull
                  // from the raw dict when we can.
                  const raw = annot;
                  dest = raw.dest || null;
                }
                if (typeof dest === 'string') dest = await pdf.getDestination(dest);
                if (Array.isArray(dest) && dest[0]) {
                  targetIndex = await pdf.getPageIndex(dest[0]);
                }
              } catch { /* leave null */ }
              a.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (targetIndex == null) return;
                const target = container.querySelector(
                  `canvas[data-page-index="${targetIndex + 1}"]`,
                );
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              });
              overlay.appendChild(a);
            }
            // Wrap the canvas in a relative positioned container so
            // the absolute overlay coordinates anchor correctly.
            const wrapper = document.createElement('div');
            wrapper.style.position = 'relative';
            wrapper.style.width = canvas.style.width;
            wrapper.style.height = canvas.style.height;
            wrapper.style.margin = '0 auto 16px';
            canvas.style.margin = '0';
            container.removeChild(canvas);
            wrapper.appendChild(canvas);
            wrapper.appendChild(overlay);
            container.appendChild(wrapper);
          }
        } catch (annoErr) {
          // Non-fatal — fall back to the no-link canvas already rendered.
          // eslint-disable-next-line no-console
          console.debug('PdfPreviewModal: annotation layer skipped', annoErr);
        }
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

  const handleDownload = useCallback(() => {
    // Hand the user the ORIGINAL PDF blob — not a print-rasterized
    // copy — so link annotations, bookmarks, and metadata survive.
    if (!entry) return;
    const a = document.createElement('a');
    a.href = entry.url;
    a.download = entry.filename || 'document.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
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
          .pdf-preview-modal .pdf-preview-back,
          .pdf-preview-modal .pdf-preview-print {
            background: #fffaf0; color: #7a5c00; border: 1px solid #a87a00;
          }
          .pdf-preview-modal .pdf-preview-print {
            margin-left: auto;
          }
          .pdf-preview-modal .pdf-preview-print + .pdf-preview-print {
            /* Subsequent action buttons stack flush against the first
               (which already absorbed the auto-margin). Resetting the
               margin here prevents per-button auto-margin from
               creating uneven gaps in the toolbar. */
            margin-left: 0;
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
          .pdf-preview-modal .pdf-preview-manifest {
            margin: 0 4px 10px;
            padding: 8px 16px 10px;
            background: rgba(212, 175, 55, 0.06);
            border: 1px solid rgba(212, 175, 55, 0.18);
            border-radius: 10px;
            flex: 0 0 auto;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-label {
            font-size: 10px;
            font-weight: 700;
            color: #94a3b8;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            margin-bottom: 6px;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-rows {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-row {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            line-height: 1.3;
            color: #0f172a;
            min-width: 0;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-row .manifest-title {
            font-weight: 700;
            /* Truncate long titles instead of pushing the Refresh pill
               into a two-line wrap (May 22, 2026 user report: the "H"
               of "Refresh" was wrapping to its own line because the
               title chewed up the row). */
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            min-width: 0;
            flex-shrink: 1;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-row .manifest-ago {
            color: #64748b;
            font-weight: 500;
            white-space: nowrap;
            flex-shrink: 0;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-row .manifest-refresh {
            margin-left: auto;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            font-weight: 700;
            color: #7a5c00;
            background: rgba(212, 175, 55, 0.10);
            border: 1px solid rgba(212, 175, 55, 0.35);
            border-radius: 9999px;
            padding: 3px 9px;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
            transition: background 120ms ease, border-color 120ms ease;
            white-space: nowrap;
            flex-shrink: 0;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-row .manifest-refresh:disabled {
            opacity: 0.55;
            cursor: progress;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-row .manifest-refresh:hover {
            background: rgba(212, 175, 55, 0.20);
            border-color: rgba(212, 175, 55, 0.55);
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
            onClick={handleDownload}
            disabled={renderState === 'loading'}
            data-testid="pdf-preview-download"
            title="Save the PDF (keeps clickable links)"
          >
            <Download size={14} /> Save PDF
          </button>
          {entry?.shareEnabled && (
            <button
              type="button"
              className="pdf-preview-print"
              onClick={() => setShareOpen(true)}
              disabled={renderState === 'loading'}
              data-testid="pdf-preview-share"
              title="Create a private link to share this binder"
            >
              <Share2 size={14} /> Share
            </button>
          )}
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

        {Array.isArray(entry.sections) && entry.sections.length > 0 && (
          <div className="pdf-preview-manifest" data-testid="pdf-preview-manifest">
            <div className="manifest-label">Sections in this binder</div>
            <div className="manifest-rows">
              {entry.sections.map((s) => {
                const ago = _formatAgo(s.updated_at);
                const isRefreshing = refreshingType === s.pdf_type;
                const supportsInPlace = IN_PLACE_REFRESH_TYPES.has(s.pdf_type) && !!s.capture_route;
                return (
                  <div
                    key={s.pdf_type}
                    className="manifest-row"
                    data-testid={`pdf-preview-manifest-row-${s.pdf_type}`}
                  >
                    <span className="manifest-title">{s.display_title}</span>
                    {ago && <span className="manifest-ago">· {ago}</span>}
                    <button
                      type="button"
                      className="manifest-refresh"
                      onClick={() => handleSectionRefresh(s)}
                      disabled={!!refreshingType}
                      title={supportsInPlace
                        ? `Regenerate ${s.display_title} and refresh the binder in place`
                        : `Open ${s.display_title} to regenerate its PDF`}
                      data-testid={`pdf-preview-manifest-refresh-${s.pdf_type}`}
                    >
                      {isRefreshing
                        ? <Loader2 size={11} className="animate-spin" />
                        : <RefreshCw size={11} />}
                      {isRefreshing ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
        <ShareBinderModal open={shareOpen} onClose={() => setShareOpen(false)} />
      </div>
    );
  }, [entry, printing, renderState, pageCount, shareOpen, handleClose, handleDownload, navigate, refreshingType, handleSectionRefresh]);

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
