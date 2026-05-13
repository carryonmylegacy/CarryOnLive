/**
 * CachedPdfIcon — inline "view latest PDF" affordance.
 *
 * Drops in next to each section's "Generate PDF" button. Polls the
 * backend cache for the section's most recently generated PDF; if
 * present, renders a small gold FileText icon button. Tap → fetches
 * the bytes back from `/api/pdfs/latest/{type}`, builds a blob URL,
 * and dispatches `carryon:open-pdf-preview` to pop the existing
 * preview modal (same code path the live-generated preview uses).
 *
 * Stays in sync via two channels:
 *   • Listens for `carryon:pdf-job-complete` events with a matching
 *     `pdfType` so the icon appears the moment a fresh generation
 *     finishes, without a network round-trip.
 *   • Re-fetches on mount so the icon is restored after PWA cold
 *     start, route navigation, or device switch.
 *
 * Usage:
 *   <CachedPdfIcon pdfType="ega_todo" />
 *
 * The component is intentionally tiny — no labels, no toasts. The
 * icon is its own affordance; tooltip on hover shows the title.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { API_URL } from '../config';
import { toast } from '../utils/toast';

const CachedPdfIcon = ({ pdfType, className = '', size = 18, testIdSuffix = '' }) => {
  const [meta, setMeta] = useState(null);    // {title, subtitle, filename, updated_at}
  const [loading, setLoading] = useState(false); // tap → fetching bytes

  // Read token straight from localStorage — same race-safe pattern we
  // use in PartnersTab. AuthContext's React state isn't always
  // hydrated when this component first mounts during a deep-link.
  const authHeader = () => {
    const t = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem('carryon_token') : null;
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  // Hydrate from backend on mount and whenever pdfType changes.
  useEffect(() => {
    let alive = true;
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[CachedPdfIcon] mount', pdfType);
    }
    (async () => {
      try {
        const headers = authHeader();
        // eslint-disable-next-line no-console
        console.log('[CachedPdfIcon] before-fetch', pdfType, 'has-auth=', !!headers.Authorization);
        const res = await fetch(`${API_URL}/pdfs/latest`, { headers });
        // eslint-disable-next-line no-console
        console.log('[CachedPdfIcon] after-fetch', pdfType, 'status=', res.status, 'alive=', alive);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const hit = (data.pdfs || []).find((p) => p.pdf_type === pdfType);
        // eslint-disable-next-line no-console
        console.log('[CachedPdfIcon] parsed', pdfType, 'pdfs_count=', (data.pdfs || []).length, 'hit=', !!hit, 'alive=', alive);
        if (alive) setMeta(hit || null);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CachedPdfIcon] caught', pdfType, err?.message);
        if (alive) setMeta(null);
      }
    })();
    return () => { alive = false; };
  }, [pdfType]);

  // Update the icon state when ANY freshly generated PDF tagged with
  // this same type completes (event fired from openPdfPreview).
  useEffect(() => {
    const onComplete = (e) => {
      const d = e.detail || {};
      if (d.pdfType !== pdfType) return;
      // Optimistic: use the freshly delivered title/subtitle so the
      // icon appears instantly even before the backend cache write
      // finishes. The next mount will reconcile against the server.
      setMeta((prev) => ({
        ...(prev || {}),
        pdf_type: pdfType,
        title: d.title || prev?.title || '',
        subtitle: d.subtitle || prev?.subtitle || '',
        filename: d.filename || prev?.filename || `${pdfType}.pdf`,
        updated_at: new Date().toISOString(),
      }));
    };
    window.addEventListener('carryon:pdf-job-complete', onComplete);
    return () => window.removeEventListener('carryon:pdf-job-complete', onComplete);
  }, [pdfType]);

  const handleClick = useCallback(async () => {
    if (!meta || loading) return;
    setLoading(true);
    try {
      // Plain fetch (see hydrate effect for rationale) — bypasses
      // the global axios offline interceptor.
      const res = await fetch(`${API_URL}/pdfs/latest/${pdfType}`, { headers: authHeader() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.blob();
      const blob = new Blob([data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.dispatchEvent(new CustomEvent('carryon:open-pdf-preview', {
        detail: {
          blob,
          url,
          filename: meta.filename || `${pdfType}.pdf`,
          title: meta.title || pdfType,
          subtitle: meta.subtitle || '',
        },
      }));
    } catch (err) {
      if (String(err?.message).includes('404')) {
        setMeta(null);
        toast.error('Cached PDF is no longer available. Generate a fresh one.');
      } else {
        toast.error('Couldn\u2019t open the cached PDF — try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [meta, loading, pdfType]);

  if (!meta) return null;

  const updatedAgo = (() => {
    if (!meta.updated_at) return '';
    const then = new Date(meta.updated_at).getTime();
    const diff = Math.max(0, Date.now() - then);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  })();

  const tooltip = `View latest ${meta.title}${updatedAgo ? ` · ${updatedAgo}` : ''}`;
  const testId = `cached-pdf-icon-${pdfType}${testIdSuffix ? `-${testIdSuffix}` : ''}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      title={tooltip}
      aria-label={tooltip}
      data-testid={testId}
      className={`inline-flex items-center justify-center rounded-lg transition-all ${className}`}
      style={{
        width: size + 14,
        height: size + 14,
        background: 'rgba(212,175,55,0.10)',
        border: '1px solid rgba(212,175,55,0.35)',
        color: '#d4af37',
        cursor: loading ? 'wait' : 'pointer',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (loading) return;
        e.currentTarget.style.background = 'rgba(212,175,55,0.18)';
        e.currentTarget.style.borderColor = 'rgba(212,175,55,0.55)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(212,175,55,0.10)';
        e.currentTarget.style.borderColor = 'rgba(212,175,55,0.35)';
      }}
    >
      {loading
        ? <Loader2 size={size} className="animate-spin" />
        : <FileText size={size} />}
    </button>
  );
};

export default CachedPdfIcon;
