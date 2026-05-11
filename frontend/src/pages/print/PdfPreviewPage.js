/**
 * PdfPreviewPage — universal preview wrapper for ALL server-generated PDFs
 * across the platform (EGA, IAC, CFP Hand-off, CCP, SOC2, Messages…).
 *
 * Mirrors the EntitiesPrintPage toolbar exactly so the UX is identical:
 *   • Sticky Back + Print buttons at the top (safe-area aware)
 *   • PDF rendered inline via <iframe src=blob:>
 *   • Print:  iOS  → navigator.share() (native share sheet w/ Print / Save)
 *             else → iframe.contentWindow.print()
 *             else → download fallback
 *   • Back  → navigate(-1)
 *   • @media print hides the toolbar; iframe takes the page
 *
 * Entries are passed in via the `openPdfPreview` utility which seeds a
 * module-level Map keyed by UUID. The URL carries only the key, so refreshes
 * land on a friendly "preview expired" message rather than a dead blob URL.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Printer, AlertTriangle } from 'lucide-react';
import { consumePreviewEntry, disposePreviewEntry } from '../../utils/openPdfPreview';
import { isIOS } from '../../utils/downloadFile';

export default function PdfPreviewPage() {
  const navigate = useNavigate();
  const { key } = useParams();
  const iframeRef = useRef(null);
  const [printing, setPrinting] = useState(false);

  const entry = useMemo(() => consumePreviewEntry(key), [key]);

  // Revoke the blob URL when the user navigates away. We keep the entry
  // alive (not disposed) so a tap-back / forward-nav re-renders without
  // refetching, but the URL is GC'd after the 30-min TTL.
  useEffect(() => {
    return () => {
      // No-op cleanup — the Map's TTL gc() will reclaim. We don't dispose
      // on unmount because users routinely backswipe-then-forward on iOS.
    };
  }, []);

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
      // iOS PWA: native share sheet handles Print / Save to Files / etc.
      if (isIOS() && navigator.share) {
        try {
          const file = new File([blob], filename, { type: 'application/pdf' });
          await navigator.share({ files: [file], title });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
          // fall through to iframe.print() or download
        }
      }
      // Desktop / Android: trigger the iframe's print dialog.
      const iframe = iframeRef.current;
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          return;
        } catch {
          // Some browsers block iframe.print() — fall through to download.
        }
      }
      // Last resort: download the blob as a file.
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
          .pdf-preview-shell   { padding: 0 !important; height: auto !important; }
          .pdf-preview-iframe-wrap { height: auto !important; }
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
          margin-top: 2px;
          font-size: 12px;
          color: #475569;
        }
        .pdf-preview-iframe-wrap {
          flex: 1 1 auto;
          min-height: 0;
          width: 100%;
          background: #ffffff;
          margin: 0 4px;
          margin-bottom: max(4px, env(safe-area-inset-bottom));
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
        }
        .pdf-preview-iframe-wrap iframe,
        .pdf-preview-iframe-wrap embed,
        .pdf-preview-iframe-wrap object {
          width: 100%; height: 100%; border: 0; display: block;
          background: #ffffff;
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
          disabled={printing}
          data-testid="pdf-preview-print"
        >
          <Printer size={14} /> {printing ? 'Opening…' : 'Print'}
        </button>
      </div>

      <div className="pdf-preview-header">
        <h1 data-testid="pdf-preview-title">{title}</h1>
        {subtitle ? <div className="subtitle">{subtitle}</div> : null}
      </div>

      <div className="pdf-preview-iframe-wrap">
        {/* iOS Safari renders blob: PDFs via the native viewer inside the
            iframe. Desktop browsers use their built-in PDF viewer. We use
            <iframe> (not <embed>/<object>) because it's the only element
            whose `contentWindow.print()` we can call from the toolbar. */}
        <iframe
          ref={iframeRef}
          src={url}
          title={title}
          data-testid="pdf-preview-iframe"
        />
      </div>
    </div>
  );
}

// Re-export so call-sites can dispose entries if they need to (rare).
export { disposePreviewEntry };
