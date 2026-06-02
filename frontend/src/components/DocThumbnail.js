import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { FileText, File } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { getCachedBlob, setCachedBlob } from '../utils/blobCache';
import { getImageBlob, putImageBlob } from '../offline/imageBlobsRepo';
import { isOfflineEnabled } from '../offline/featureFlag';
import { API_URL } from '../config';

// react-pdf bundles its own pinned `pdfjs-dist` (currently 5.4.296). The
// standalone `pdfjs-dist` we install directly is on a newer version
// (5.7.284), and its worker is incompatible with the API loaded by
// react-pdf — pdf.js refuses to render PDFs whenever the API and Worker
// versions diverge, which silently broke every PDF thumbnail in the SDV.
// We ship react-pdf's bundled worker as a separate file and point this
// consumer at it; the standalone `pdfjs-dist` consumers (PdfPreviewModal)
// continue to use the matching `/pdf.worker.min.mjs`.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.react-pdf.min.mjs';

const DocThumbnail = ({ doc }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [textPreview, setTextPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);
  const ft = (doc.file_type || '').toLowerCase();
  const isPdf = ft.includes('pdf');
  const isImage = ft.includes('image');
  // Plain-text / markdown documents (e.g. the .poa / .trust example
  // files in the demo vault) used to render as a generic gray FileText
  // placeholder because the previewable check only matched PDF/image.
  // We now fetch the text body and render the first few lines so the
  // SDV grid shows real document content for every supported type.
  const isText = !!ft && (
    ft.startsWith('text/') ||
    ft.includes('markdown') ||
    ft === 'application/json' ||
    ft === 'application/xml'
  );
  const isPreviewable = !!ft && (isPdf || isImage || isText);

  useEffect(() => {
    mountedRef.current = true;
    setBlobUrl(null);
    setTextPreview(null);
    setError(false);
    if (!isPreviewable || doc.is_locked) return undefined;

    // Check in-memory LRU cache first (PDF/image only — text previews are
    // tiny strings and cheaper to refetch than to manage in the blob cache).
    if (!isText) {
      const cached = getCachedBlob(doc.id);
      if (cached) { setBlobUrl(cached); return undefined; }
    }

    // Persistent offline cache key. Stored as bytes in IndexedDB so the
    // SDV thumbnail survives an offline relaunch (and SW version bumps).
    const cacheKey = `docthumb:${doc.id}`;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

    const run = async () => {
      // OFFLINE (non-text): serve the persisted blob if we cached it on a
      // prior online visit; otherwise fall back to the placeholder.
      if (offline && !isText) {
        if (isOfflineEnabled()) {
          try {
            const storedBlob = await getImageBlob(cacheKey);
            if (storedBlob && mountedRef.current) {
              setBlobUrl(URL.createObjectURL(storedBlob));
              return;
            }
          } catch { /* non-fatal */ }
        }
        if (mountedRef.current) setError(true);
        return;
      }

      const token = localStorage.getItem('carryon_token');
      if (!token) { if (mountedRef.current) setError(true); return; }

      if (mountedRef.current) setLoading(true);
      try {
        const res = await apiClient.get(`${API_URL}/documents/${doc.id}/preview`, {
          headers: { 'Authorization': `Bearer ${token}` },
          responseType: isText ? 'text' : 'blob',
        });
        if (!mountedRef.current) return;
        if (isText) {
          const txt = typeof res.data === 'string' ? res.data : String(res.data || '');
          setTextPreview(txt.slice(0, 1200));
        } else {
          const blob = new Blob([res.data], { type: doc.file_type });
          const url = URL.createObjectURL(blob);
          setCachedBlob(doc.id, url);
          setBlobUrl(url);
          // Persist for offline relaunch (fire-and-forget, gated by flag).
          if (isOfflineEnabled()) putImageBlob(cacheKey, blob, 'doc_thumb');
        }
      } catch {
        // Network failed (e.g. we just went offline). Fall back to the
        // persisted blob before surfacing the error placeholder.
        if (!isText && isOfflineEnabled()) {
          try {
            const storedBlob = await getImageBlob(cacheKey);
            if (storedBlob && mountedRef.current) {
              setBlobUrl(URL.createObjectURL(storedBlob));
              return;
            }
          } catch { /* non-fatal */ }
        }
        if (mountedRef.current) setError(true);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    run();

    return () => { mountedRef.current = false; };
  }, [doc.id, doc.is_locked, doc.file_type, isPreviewable, isText]);

  if (!isPreviewable || doc.is_locked) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--s)' }}>
        {doc.is_locked ? (
          <div className="text-center">
            <File className="w-6 h-6 text-[var(--t5)] mx-auto" />
            <span className="text-[11px] text-[var(--t5)] mt-1 block">Locked</span>
          </div>
        ) : (
          <FileText className="w-8 h-8 text-[var(--t5)]" />
        )}
      </div>
    );
  }

  // Shared shimmer that suggests "a document is materializing here" while
  // either (a) we fetch the encrypted blob from the server or (b) pdf.js
  // parses the first page. Uses a gold-tinted left→right gradient sweep
  // over fake "paragraph" lines so the SDV grid feels like it's loading
  // something valuable, not just empty rectangles.
  const Shimmer = () => (
    <div
      className="w-full h-full overflow-hidden relative"
      style={{ background: 'linear-gradient(180deg, var(--s) 0%, rgba(var(--gold-rgb), 0.04) 100%)' }}
      data-testid="doc-thumbnail-shimmer"
    >
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 6,
          opacity: 0.5,
        }}
      >
        <div style={{ height: 6, width: '60%', borderRadius: 3, background: 'rgba(var(--gold-rgb), 0.18)' }} />
        <div style={{ height: 4, width: '85%', borderRadius: 2, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ height: 4, width: '78%', borderRadius: 2, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ height: 4, width: '90%', borderRadius: 2, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ height: 4, width: '70%', borderRadius: 2, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ height: 4, width: '82%', borderRadius: 2, background: 'rgba(255,255,255,0.06)' }} />
      </div>
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(110deg, transparent 25%, rgba(var(--gold-rgb), 0.14) 50%, transparent 75%)',
          animation: 'doc-shimmer 1.6s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes doc-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );

  if (loading) {
    return <Shimmer />;
  }

  if (error || (!blobUrl && !textPreview)) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--s)' }}>
        <FileText className="w-8 h-8 text-[var(--t5)]" />
      </div>
    );
  }

  if (isImage) {
    return (
      <img src={blobUrl} alt={doc.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
    );
  }

  if (isPdf) {
    return (
      <div className="w-full h-full overflow-hidden flex items-start justify-center" style={{ background: '#fff' }}>
        <Document
          file={blobUrl}
          loading={<Shimmer />}
          error={<FileText className="w-8 h-8 text-[var(--t5)]" />}
        >
          <Page pageNumber={1} width={200} renderTextLayer={false} renderAnnotationLayer={false} />
        </Document>
      </div>
    );
  }

  if (isText && textPreview) {
    // Render a paper-style preview: white "page" with the first few
    // lines of the document content. Makes plain-text docs (.poa,
    // .trust, .md, etc.) feel like real documents in the SDV grid
    // instead of identical gray FileText placeholders.
    return (
      <div
        className="w-full h-full overflow-hidden relative"
        style={{
          background: '#fbfaf6',
          padding: '10px 12px',
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
          fontSize: 6.5,
          lineHeight: 1.35,
          color: '#1f2937',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
        aria-hidden
      >
        {textPreview}
        <div
          aria-hidden
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 28,
            background: 'linear-gradient(to bottom, rgba(251,250,246,0), #fbfaf6)',
          }}
        />
      </div>
    );
  }

  return null;
};

export default DocThumbnail;
