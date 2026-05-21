/**
 * CachedPdfIcon — standardized "Latest PDF · X ago" pill.
 *
 * Drops in next to each section's "Generate PDF" button. Polls the
 * backend cache for the section's most recently generated PDF; if
 * present, renders a single gold-tinted pill containing:
 *
 *   [FileText icon]  Latest PDF · 3m ago
 *
 * Tap → fetches the bytes back from `/api/pdfs/latest/{type}`,
 * builds a blob URL, and dispatches `carryon:open-pdf-preview` to
 * pop the existing preview modal (same code path the live-generated
 * preview uses).
 *
 * Design contract (May 22, 2026 — pitch-prep standardization):
 *   • ONE visual treatment, used identically on every section page
 *     that can produce a PDF (E&S, EGA-transcript/-plan/-checklist,
 *     IAC, CFP Handoff, CCP Report, Beneficiary Packet).
 *   • NO warning/red state for stale dates. Estate documents are
 *     valid for years; we never imply the user should regenerate.
 *   • On mobile (< sm) the label collapses to "{X}m ago" / "{X}h ago"
 *     to preserve toolbar real-estate without dropping the
 *     freshness cue entirely.
 *
 * Stays in sync via two channels:
 *   • Listens for `carryon:pdf-job-complete` events with a matching
 *     `pdfType` so the icon appears the moment a fresh generation
 *     finishes, without a network round-trip.
 *   • Re-fetches on mount so the icon is restored after PWA cold
 *     start, route navigation, or device switch.
 *
 * Usage:
 *   <CachedPdfIcon pdfType="entities_structures" />
 */

import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { API_URL } from '../config';
import { toast } from '../utils/toast';

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

const CachedPdfIcon = ({ pdfType, className = '', testIdSuffix = '' }) => {
  const [meta, setMeta] = useState(null);    // {title, subtitle, filename, updated_at}
  const [loading, setLoading] = useState(false); // tap → fetching bytes

  // Read token straight from localStorage — AuthContext's React state
  // isn't always hydrated when this component first mounts during a
  // deep-link.
  const authHeader = () => {
    const t = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem('carryon_token') : null;
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  // Hydrate from backend on mount and whenever pdfType changes.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/pdfs/latest`, { headers: authHeader() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const hit = (data.pdfs || []).find((p) => p.pdf_type === pdfType);
        if (alive) setMeta(hit || null);
      } catch {
        if (alive) setMeta(null);
      }
    })();
    return () => { alive = false; };
  }, [pdfType]);

  // Update the pill state when ANY freshly generated PDF tagged with
  // this same type completes (event fired from openPdfPreview).
  useEffect(() => {
    const onComplete = (e) => {
      const d = e.detail || {};
      if (d.pdfType !== pdfType) return;
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

  // Re-render every 30s so the "X ago" label stays accurate without
  // forcing a network round-trip. Lightweight: only re-renders the
  // visible pill string, no state churn.
  const [, _setTick] = useState(0);
  useEffect(() => {
    if (!meta) return undefined;
    const t = setInterval(() => _setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, [meta]);

  const handleClick = useCallback(async () => {
    if (!meta || loading) return;
    setLoading(true);
    try {
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

  const ago = _formatAgo(meta.updated_at);
  const tooltip = `View latest ${meta.title || 'PDF'}${ago ? ` · generated ${ago}` : ''}`;
  const testId = `cached-pdf-icon-${pdfType}${testIdSuffix ? `-${testIdSuffix}` : ''}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      title={tooltip}
      aria-label={tooltip}
      data-testid={testId}
      className={`cached-pdf-icon inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full whitespace-nowrap transition-all text-[11px] font-bold ${className}`}
      style={{
        cursor: loading ? 'wait' : 'pointer',
        flexShrink: 0,
        lineHeight: 1.1,
      }}
    >
      {loading
        ? <Loader2 size={12} className="animate-spin" />
        : <FileText size={12} />}
      {/* Full label on sm+; compact "X ago" on mobile to keep the
          toolbar from overflowing. The freshness cue is visible at
          every breakpoint — only the prefix word is dropped. */}
      <span className="hidden sm:inline">Latest PDF{ago ? ` · ${ago}` : ''}</span>
      {ago && <span className="sm:hidden">{ago}</span>}
    </button>
  );
};

export default CachedPdfIcon;
