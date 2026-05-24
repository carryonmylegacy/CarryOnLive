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
import { ChevronLeft, Printer, Download, AlertTriangle, Loader2, Share2, RefreshCw, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { isIOS } from '../utils/downloadFile';
import ShareBinderModal from './ShareBinderModal';
import { API_URL } from '../config';
import { toast } from '../utils/toast';

// LocalStorage key for remembering the user's "collapse manifest"
// preference across binder opens — they pick once, we honor it forever.
const MANIFEST_COLLAPSED_KEY = 'carryon_binder_manifest_collapsed';

// Sections that support in-place server-side regeneration. Each
// entry maps a `pdf_type` to a builder that returns the absolute API
// path to POST to (no body required — the endpoint reads the
// authenticated user and authorizes from there). The handler below
// awaits that POST, then refetches the binder PDF + manifest so the
// modal swaps in place. No iframes, no postMessage handshake — just
// the same server-renders-bytes pattern every other section uses.
const SERVER_REFRESH_ENDPOINTS = {
  entities_structures: (section) => {
    // section.capture_route is supplied by the binder manifest and
    // always points at `/financial/entities/<estateId>/print?...` —
    // extract the estate id from the second-to-last segment so we
    // don't need a separate field on the manifest payload.
    const m = (section.capture_route || '').match(/\/financial\/entities\/([^/?]+)\/print/);
    return m ? `${API_URL}/financial/entities/${m[1]}/render-pdf` : null;
  },
};

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
  const [skippingType, setSkippingType] = useState(null);
  // "Refresh Binder" toolbar button — rebuilds the binder PDF
  // in-place using whatever cached section PDFs exist right now.
  // Shown only for the Estate Binder preview (not for one-off PDFs).
  const [refreshingBinder, setRefreshingBinder] = useState(false);
  // Timestamp of the last successful binder assembly. Set on initial
  // open (any open of the binder modal IS a fresh assembly — the
  // EstateBinderButton calls POST /generate before dispatching the
  // event) and re-set whenever any in-place regen finishes.
  const [lastBinderRefreshAt, setLastBinderRefreshAt] = useState(null);
  // Persistent collapse state for the manifest — frees up screen
  // real estate for the actual PDF preview below it. Defaults to
  // COLLAPSED on first open (Barnet's preference) so the preview
  // jumps straight to the PDF. Once the user toggles it open, the
  // expanded state is persisted via localStorage.
  const [manifestCollapsed, setManifestCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(MANIFEST_COLLAPSED_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const toggleManifestCollapsed = useCallback(() => {
    setManifestCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MANIFEST_COLLAPSED_KEY, next ? '1' : '0');
      } catch { /* localStorage unavailable */ }
      return next;
    });
  }, []);

  // ── Helper: regen the binder + refetch the manifest after any
  // mutation (refresh, skip, unskip). Re-used by both the Refresh
  // handler and the Skip / Include-again handlers so the modal
  // always reflects the post-mutation state with no manual page
  // reload from the user.
  const _regenBinderInPlace = useCallback(async (authHeaders) => {
    const binderRes = await fetch(`${API_URL}/estate-binder/generate`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
    });
    if (!binderRes.ok) throw new Error(`binder regen ${binderRes.status}`);
    const ct = binderRes.headers.get('content-type') || '';
    let nextSections = entry?.sections || [];
    let nextMissing = entry?.missingSections || [];
    let nextSkipped = entry?.skippedSections || [];
    try {
      const mres = await fetch(`${API_URL}/estate-binder/manifest`, { headers: authHeaders });
      if (mres.ok) {
        const mdata = await mres.json();
        nextSections = mdata.available || [];
        nextMissing = mdata.missing || [];
        nextSkipped = mdata.skipped || [];
      }
    } catch { /* keep stale manifest — better than blanking it */ }

    if (ct.includes('application/pdf')) {
      const blob = await binderRes.blob();
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);
      setEntry((prev) => {
        if (!prev) return prev;
        try { URL.revokeObjectURL(prev.url); } catch { /* ignore */ }
        return {
          ...prev,
          blob: pdfBlob,
          url,
          sections: nextSections,
          missingSections: nextMissing,
          skippedSections: nextSkipped,
        };
      });
      setRenderState('loading');
      setPageCount(0);
      setLastBinderRefreshAt(new Date().toISOString());
    } else {
      // Empty-binder JSON case — manifest still updates so the user
      // can see what's left to skip / un-skip.
      setEntry((prev) => prev ? {
        ...prev,
        sections: nextSections,
        missingSections: nextMissing,
        skippedSections: nextSkipped,
      } : prev);
    }
  }, [entry?.sections, entry?.missingSections, entry?.skippedSections]);

  // ── "Refresh Binder" toolbar button (Part A of May 23, 2026 ask) ──
  // One-tap rebuild of the binder PDF using whatever cached sections
  // exist NOW. Useful when the user has refreshed an underlying
  // section page in a separate tab and wants the binder to pick up
  // the new cache without closing/re-opening the modal. Does NOT
  // regenerate individual section PDFs — that's Part B (post-pitch).
  const handleRefreshBinder = useCallback(async () => {
    if (refreshingBinder) return;
    setRefreshingBinder(true);
    const token = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem('carryon_token') : null;
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      await _regenBinderInPlace(authHeaders);
      toast.success('Estate Binder Updated');
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(`Couldn't refresh the binder: ${err?.message || 'unknown error'}`);
    } finally {
      setRefreshingBinder(false);
    }
  }, [refreshingBinder, _regenBinderInPlace]);

  // ── Skip / Include-again handler (May 19, 2026 user mandate) ──────
  // Skipping a section soft-vetos it from the binder — the cached
  // PDF stays in S3 + latest_pdfs, so the user can include it again
  // with one tap. Solves the immediate pain of a stale/ugly cached
  // E&S sitting in the binder before Chromium is installed on prod.
  const handleSectionSkipToggle = useCallback(async (section, skip) => {
    if (!section || skippingType) return;
    setSkippingType(section.pdf_type);
    const token = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem('carryon_token') : null;
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const url = `${API_URL}/estate-binder/skip/${encodeURIComponent(section.pdf_type)}`;
      const skipRes = await fetch(url, {
        method: skip ? 'POST' : 'DELETE',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      });
      if (!skipRes.ok) {
        const detail = await skipRes.text().catch(() => '');
        throw new Error(`skip ${skipRes.status}: ${detail.slice(0, 200)}`);
      }
      await _regenBinderInPlace(authHeaders);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(`Couldn't ${skip ? 'skip' : 'include'} ${section.display_title}: ${err?.message || 'unknown error'}`);
    } finally {
      setSkippingType(null);
    }
  }, [skippingType, _regenBinderInPlace]);

  // ── In-place "Refresh" for a binder section (May 23, 2026 mandate) ─
  // For sections registered in `SERVER_REFRESH_ENDPOINTS`, we POST to
  // the backend's headless-Chromium render endpoint. The endpoint
  // returns once the cache is updated, then we re-fetch the binder
  // PDF + manifest and swap the modal's preview in place. No iframes,
  // no postMessage handshake — same architecture as every other
  // section that produces a server-rendered PDF.
  //
  // For sections NOT yet wired to a server endpoint, we fall back to
  // navigating the user to that section's page (graceful degrade —
  // identical to the original behavior).
  const handleSectionRefresh = useCallback(async (section) => {
    if (!section || refreshingType) return;
    const endpointBuilder = SERVER_REFRESH_ENDPOINTS[section.pdf_type];
    const endpoint = endpointBuilder ? endpointBuilder(section) : null;
    if (!endpoint) {
      // Graceful fallback: navigate to the section's page so the user
      // can generate it manually. Same UX as the legacy Refresh flow
      // for sections without a server-render path.
      handleClose();
      navigate(section.route || '/dashboard');
      return;
    }

    setRefreshingType(section.pdf_type);
    const token = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem('carryon_token') : null;
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      // 1) Trigger the server render. Endpoint blocks until the
      //    headless Chromium has captured the PDF and written it to
      //    S3 + `latest_pdfs`. 30 s soft deadline matches the Python
      //    side's `timeout_ms`.
      const renderRes = await fetch(endpoint, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      });
      if (!renderRes.ok) {
        const detail = await renderRes.text().catch(() => '');
        throw new Error(`render ${renderRes.status}: ${detail.slice(0, 200)}`);
      }

      // 2) Regenerate the binder PDF so the modal reflects the
      //    new cached section. Same endpoint EstateBinderButton hits.
      const binderRes = await fetch(`${API_URL}/estate-binder/generate`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      });
      if (!binderRes.ok) throw new Error(`binder regen ${binderRes.status}`);
      const ct = binderRes.headers.get('content-type') || '';
      if (!ct.includes('application/pdf')) throw new Error('binder regen returned non-PDF');
      const blob = await binderRes.blob();
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);

      // 3) Refresh the manifest so timestamps + missing-list update.
      let nextSections = entry?.sections || [];
      let nextMissing = entry?.missingSections || [];
      let nextSkipped = entry?.skippedSections || [];
      try {
        const mres = await fetch(`${API_URL}/estate-binder/manifest`, { headers: authHeaders });
        if (mres.ok) {
          const mdata = await mres.json();
          nextSections = mdata.available || [];
          nextMissing = mdata.missing || [];
          nextSkipped = mdata.skipped || [];
        }
      } catch { /* keep stale manifest — better than blanking it */ }

      // 4) Swap the preview blob in place; the existing render
      //    pipeline picks up the new entry transparently.
      setEntry((prev) => {
        if (!prev) return prev;
        try { URL.revokeObjectURL(prev.url); } catch { /* ignore */ }
        return {
          ...prev,
          blob: pdfBlob,
          url,
          sections: nextSections,
          missingSections: nextMissing,
          skippedSections: nextSkipped,
        };
      });
      setRenderState('loading');
      setPageCount(0);
      setLastBinderRefreshAt(new Date().toISOString());
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(`Couldn't refresh ${section.display_title}: ${err?.message || 'unknown error'}`);
    } finally {
      setRefreshingType(null);
    }
  }, [refreshingType, navigate, entry?.sections, entry?.missingSections]); // eslint-disable-line react-hooks/exhaustive-deps

  // Global listener — any caller dispatches an event with the blob entry.
  useEffect(() => {
    const handler = (e) => {
      if (!e?.detail?.blob) return;
      setEntry(e.detail);
      setRenderState('loading');
      setPageCount(0);
      // Any open of the binder modal IS a fresh assembly (the
      // EstateBinderButton calls POST /generate before dispatching).
      // Stamp "now" so the manifest note reads correctly even before
      // the user hits Refresh Binder.
      if (e.detail?.title === 'Estate Binder') {
        setLastBinderRefreshAt(new Date().toISOString());
      }
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
            flex-wrap: wrap;
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
            white-space: nowrap !important;
            word-break: keep-all;
            flex: 0 0 auto;
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
          .pdf-preview-modal .pdf-preview-manifest.manifest-collapsed {
            padding: 6px 12px 6px;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-toggle {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            background: transparent;
            border: none;
            padding: 0;
            margin-bottom: 6px;
            font-size: 11px;
            font-weight: 700;
            color: #94a3b8;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
          }
          .pdf-preview-modal .pdf-preview-manifest.manifest-collapsed .manifest-toggle {
            margin-bottom: 0;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-toggle:hover {
            color: #7a5c00;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-toggle-label {
            font-size: 11px;
            font-weight: 700;
            color: inherit;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-label {
            font-size: 11px;
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
          .pdf-preview-modal .pdf-preview-manifest .manifest-note {
            font-size: 11px;
            line-height: 1.45;
            color: #64748b;
            background: rgba(212, 175, 55, 0.08);
            border-left: 3px solid #d4af37;
            padding: 8px 10px;
            border-radius: 0 6px 6px 0;
            margin-bottom: 6px;
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
          .pdf-preview-modal .pdf-preview-manifest .manifest-row-missing .manifest-title-missing {
            color: #64748b;
            font-style: italic;
            font-weight: 600;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-row-missing .manifest-ago-missing {
            color: #94a3b8;
            font-style: italic;
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
          .pdf-preview-modal .pdf-preview-manifest .manifest-row .manifest-skip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            font-weight: 700;
            color: #64748b;
            background: transparent;
            border: 1px solid rgba(100, 116, 139, 0.35);
            border-radius: 9999px;
            padding: 3px 9px;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
            transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
            white-space: nowrap;
            flex-shrink: 0;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-row .manifest-skip:disabled {
            opacity: 0.55;
            cursor: progress;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-row .manifest-skip:hover {
            background: rgba(100, 116, 139, 0.10);
            border-color: rgba(100, 116, 139, 0.55);
            color: #334155;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-row-skipped .manifest-title-skipped {
            color: #64748b;
            font-weight: 600;
            text-decoration: line-through;
            text-decoration-color: rgba(100, 116, 139, 0.45);
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-row-skipped .manifest-ago-skipped {
            color: #94a3b8;
            font-style: italic;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-row .manifest-include-again {
            margin-left: auto;
          }
          /* ── Per-section include-in-binder checkbox (May 24, 2026
             user mandate). Sits left-most in every manifest row.
             Checked = section is in the binder (TOC + PDF).
             Unchecked = section is hidden. Loading state shows a
             spinner in place of the box. */
          .pdf-preview-modal .pdf-preview-manifest .manifest-include-toggle {
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            border-radius: 5px;
            border: 1.5px solid rgba(100, 116, 139, 0.55);
            background: #ffffff;
            color: #0f172a;
            cursor: pointer;
            padding: 0;
            -webkit-tap-highlight-color: transparent;
            transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-include-toggle:hover {
            border-color: rgba(212, 175, 55, 0.65);
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-include-toggle[aria-checked="true"] {
            background: #d4af37;
            border-color: #b8962e;
            color: #0f172a;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-include-toggle:disabled {
            opacity: 0.55;
            cursor: progress;
          }
          .pdf-preview-modal .pdf-preview-manifest .manifest-include-toggle:focus-visible {
            outline: 2px solid rgba(212, 175, 55, 0.55);
            outline-offset: 2px;
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
          {entry?.title === 'Estate Binder' && (
            <button
              type="button"
              className="pdf-preview-print"
              onClick={handleRefreshBinder}
              disabled={refreshingBinder || renderState === 'loading'}
              data-testid="pdf-preview-refresh-binder"
              title="Rebuild the binder from all currently cached sections"
            >
              {refreshingBinder
                ? <Loader2 size={14} className="spin" />
                : <RefreshCw size={14} />}
              {refreshingBinder ? 'Refreshing…' : 'Refresh Binder'}
            </button>
          )}
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

        {(Array.isArray(entry.sections) && entry.sections.length > 0)
          || (Array.isArray(entry.missingSections) && entry.missingSections.length > 0)
          || (Array.isArray(entry.skippedSections) && entry.skippedSections.length > 0) ? (
          <div
            className={`pdf-preview-manifest${manifestCollapsed ? ' manifest-collapsed' : ''}`}
            data-testid="pdf-preview-manifest"
          >
            <button
              type="button"
              className="manifest-toggle"
              onClick={toggleManifestCollapsed}
              data-testid="pdf-preview-manifest-toggle"
              aria-expanded={!manifestCollapsed}
              title={manifestCollapsed
                ? 'Show binder sections list'
                : 'Hide binder sections list (frees up screen for the preview below)'}
            >
              <span className="manifest-toggle-label">
                Sections in this binder
                {manifestCollapsed && (entry.sections?.length || entry.missingSections?.length || entry.skippedSections?.length)
                  ? ` · ${(entry.sections?.length || 0) + (entry.missingSections?.length || 0) + (entry.skippedSections?.length || 0)} total`
                  : ''}
              </span>
              {manifestCollapsed
                ? <ChevronDown size={14} aria-hidden="true" />
                : <ChevronUp size={14} aria-hidden="true" />}
            </button>
            {!manifestCollapsed && (
              <div className="manifest-rows">
                {entry?.title === 'Estate Binder' && (
                  <div
                    className="manifest-note"
                    data-testid="pdf-preview-manifest-note"
                  >
                    Binder {lastBinderRefreshAt ? `last refreshed ${_formatAgo(lastBinderRefreshAt)}` : 'refreshed'} —
                    pulls all currently cached PDFs across the platform.
                    To update a cached PDF, visit that section.
                  </div>
                )}
                {(entry.sections || []).map((s) => {
                  const ago = _formatAgo(s.updated_at);
                  const isRefreshing = refreshingType === s.pdf_type;
                  const isSkipping = skippingType === s.pdf_type;
                  const busy = !!refreshingType || !!skippingType;
                  const supportsServerRefresh = !!SERVER_REFRESH_ENDPOINTS[s.pdf_type];
                  return (
                    <div
                      key={s.pdf_type}
                      className="manifest-row"
                      data-testid={`pdf-preview-manifest-row-${s.pdf_type}`}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked="true"
                        aria-label={`Hide ${s.display_title} from this binder (keeps the cached PDF — include again anytime)`}
                        className="manifest-include-toggle"
                        onClick={() => handleSectionSkipToggle(s, true)}
                        disabled={busy}
                        title={`Hide ${s.display_title} from this binder (keeps the cached PDF — include it again anytime)`}
                        data-testid={`pdf-preview-manifest-toggle-${s.pdf_type}`}
                      >
                        {isSkipping
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Check size={14} strokeWidth={3} />}
                      </button>
                      <span className="manifest-title">{s.display_title}</span>
                      {ago && <span className="manifest-ago">· {ago}</span>}
                      <button
                        type="button"
                        className="manifest-refresh"
                        onClick={() => handleSectionRefresh(s)}
                        disabled={busy}
                        title={supportsServerRefresh
                          ? `Regenerate ${s.display_title} on the server and refresh the binder in place`
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
                {(entry.missingSections || []).map((s) => {
                  const isRefreshing = refreshingType === s.pdf_type;
                  const isSkipping = skippingType === s.pdf_type;
                  const busy = !!refreshingType || !!skippingType;
                  const supportsServerRefresh = !!SERVER_REFRESH_ENDPOINTS[s.pdf_type];
                  return (
                    <div
                      key={s.pdf_type}
                      className="manifest-row manifest-row-missing"
                      data-testid={`pdf-preview-manifest-row-${s.pdf_type}`}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked="true"
                        aria-label={`Hide ${s.display_title} from this binder`}
                        className="manifest-include-toggle"
                        onClick={() => handleSectionSkipToggle(s, true)}
                        disabled={busy}
                        title={`Hide ${s.display_title} from this binder`}
                        data-testid={`pdf-preview-manifest-toggle-${s.pdf_type}`}
                      >
                        {isSkipping
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Check size={14} strokeWidth={3} />}
                      </button>
                      <span className="manifest-title manifest-title-missing">{s.display_title}</span>
                      <span className="manifest-ago manifest-ago-missing">· not yet generated</span>
                      <button
                        type="button"
                        className="manifest-refresh"
                        onClick={() => handleSectionRefresh(s)}
                        disabled={busy}
                        title={supportsServerRefresh
                          ? `Generate ${s.display_title} on the server and add it to the binder in place`
                          : `Open ${s.display_title} to generate its PDF, then re-open the binder`}
                        data-testid={`pdf-preview-manifest-refresh-${s.pdf_type}`}
                      >
                        {isRefreshing
                          ? <Loader2 size={11} className="animate-spin" />
                          : <RefreshCw size={11} />}
                        {isRefreshing ? 'Generating…' : 'Generate'}
                      </button>
                    </div>
                  );
                })}
                {(entry.skippedSections || []).map((s) => {
                  const isSkipping = skippingType === s.pdf_type;
                  const busy = !!refreshingType || !!skippingType;
                  return (
                    <div
                      key={s.pdf_type}
                      className="manifest-row manifest-row-skipped"
                      data-testid={`pdf-preview-manifest-row-${s.pdf_type}`}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked="false"
                        aria-label={`Include ${s.display_title} in this binder again`}
                        className="manifest-include-toggle"
                        onClick={() => handleSectionSkipToggle(s, false)}
                        disabled={busy}
                        title={`Include ${s.display_title} in this binder again`}
                        data-testid={`pdf-preview-manifest-toggle-${s.pdf_type}`}
                      >
                        {isSkipping && <Loader2 size={12} className="animate-spin" />}
                      </button>
                      <span className="manifest-title manifest-title-skipped">{s.display_title}</span>
                      <span className="manifest-ago manifest-ago-skipped">· hidden from binder</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

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
  }, [entry, printing, renderState, pageCount, shareOpen, handleClose, handleDownload, navigate, refreshingType, skippingType, refreshingBinder, handleRefreshBinder, lastBinderRefreshAt, manifestCollapsed, toggleManifestCollapsed, handleSectionRefresh, handleSectionSkipToggle]);

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
