/**
 * PdfJobChip — global, persistent progress indicator for in-flight PDF jobs.
 *
 * Mounted once at the App root. Subscribes to:
 *   carryon:pdf-job-start    → render "Generating <Title>…" chip with spinner
 *   carryon:pdf-job-complete → render "<Title> ready — tap to view" briefly,
 *                              then auto-dismiss after 6 s
 *   carryon:pdf-job-error    → render red "<Title> failed — tap to retry"
 *
 * Survives SPA navigation (the calling page can unmount mid-generation and
 * the chip will still tell the user their PDF is being made). Tapping the
 * chip re-opens the modal (after completion) or dismisses (during start /
 * after error).
 *
 * Renders into a portal at document.body bottom-center, above the iOS
 * bottom-tab safe-area inset.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Loader2, FileText, AlertTriangle, X } from 'lucide-react';

const PdfJobChip = () => {
  // Most recent job state per jobId. We only ever show ONE chip — the
  // most-recently-started or most-recently-completed job. If the user fires
  // a second generation while a first is pending, the second replaces the
  // first chip but the first job still fires its own complete event
  // (which auto-opens the modal). This keeps the chip simple and prevents
  // chip-stacking visual noise.
  const [job, setJob] = useState(null); // { jobId, title, status, entry?, error?, hasBeenViewed? }

  // The job-state tracker runs globally (so a 30s xAI call survives the
  // user wandering away from /guardian and back), but the chip itself is
  // only RENDERED on the EGA screen. The user found the "tap to view
  // again" toast distracting when it followed them onto unrelated pages.
  const location = useLocation();
  const isOnEgaScreen = location.pathname === '/guardian' || location.pathname.startsWith('/guardian/');

  useEffect(() => {
    const onStart = (e) => {
      const { jobId, title } = e.detail || {};
      setJob({ jobId, title, status: 'running' });
    };
    const onComplete = (e) => {
      const entry = e.detail || {};
      setJob({ jobId: entry.jobId, title: entry.title, status: 'ready', entry, hasBeenViewed: false });
    };
    const onError = (e) => {
      const { jobId, title, error } = e.detail || {};
      setJob({ jobId, title, status: 'error', error });
    };
    window.addEventListener('carryon:pdf-job-start', onStart);
    window.addEventListener('carryon:pdf-job-complete', onComplete);
    window.addEventListener('carryon:pdf-job-error', onError);
    return () => {
      window.removeEventListener('carryon:pdf-job-start', onStart);
      window.removeEventListener('carryon:pdf-job-complete', onComplete);
      window.removeEventListener('carryon:pdf-job-error', onError);
    };
  }, []);

  // The READY chip used to be sticky — kept around until the user
  // dismissed it. Now that each section has its own persistent
  // `<CachedPdfIcon>` next to its generate button, the chip's only
  // job is to indicate IN-FLIGHT work + a brief celebratory "ready"
  // moment. Auto-dismiss READY after 5s, ERROR after 8s.
  //
  // NOTE: we deliberately do NOT call `URL.revokeObjectURL` here even
  // though the chip is the only place that still holds the URL ref.
  // The same blob URL is shared with `<PdfPreviewModal>` (the modal
  // received the entry via the `carryon:open-pdf-preview` event), and
  // the modal may still have it open in its <iframe> for printing.
  // Revoking under the modal's feet would 404 the iframe mid-print.
  // The modal's own `handleClose` revokes the URL when the user
  // dismisses the preview — single owner of the lifecycle.
  useEffect(() => {
    if (!job) return undefined;
    if (job.status === 'running') return undefined;
    const ms = job.status === 'ready' ? 5000 : 8000;
    const t = setTimeout(() => setJob(null), ms);
    return () => clearTimeout(t);
  }, [job]);

  const handleTap = useCallback(() => {
    if (!job) return;
    if (job.status === 'ready' && job.entry) {
      window.dispatchEvent(new CustomEvent('carryon:open-pdf-preview', { detail: job.entry }));
      // Mark as viewed (changes chip label from "tap to view" to "tap to view again")
      setJob((prev) => prev ? { ...prev, hasBeenViewed: true } : prev);
    } else if (job.status === 'error') {
      setJob(null);
    }
    // Running: tap is a no-op (don't let user accidentally cancel).
  }, [job]);

  const handleDismiss = useCallback((e) => {
    e.stopPropagation();
    // Revoke the blob URL on dismiss so memory is freed.
    setJob((prev) => {
      if (prev?.entry?.url) {
        try { URL.revokeObjectURL(prev.entry.url); } catch { /* ignore */ }
      }
      return null;
    });
  }, []);

  if (typeof document === 'undefined') return null;
  if (!job) return null;
  // Hide the chip on every screen except the EGA. Job state is preserved
  // in component state, so when the user returns to /guardian the chip
  // reappears in its current state (running / ready / error).
  if (!isOnEgaScreen) return null;

  const isRunning = job.status === 'running';
  const isReady = job.status === 'ready';
  const isError = job.status === 'error';

  const colors = isError
    ? { bg: '#fff1f2', border: '#b91c1c', text: '#b91c1c' }
    : isReady
      ? { bg: '#fffaf0', border: '#B8860B', text: '#B8860B' }
      : { bg: '#0f172a', border: '#334155', text: '#e2e8f0' };

  const Icon = isError ? AlertTriangle : isReady ? FileText : Loader2;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      data-testid="pdf-job-chip"
      data-job-status={job.status}
      onClick={handleTap}
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: `calc(max(72px, env(safe-area-inset-bottom, 0px) + 64px))`,
        zIndex: 2147481999, // just below the modal but above everything else
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        borderRadius: 9999,
        padding: '8px 14px 8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        fontWeight: 700,
        cursor: isRunning ? 'default' : 'pointer',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        maxWidth: 'min(92vw, 520px)',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        animation: 'pdf-chip-pop 220ms ease-out',
      }}
    >
      <style>{`
        @keyframes pdf-chip-pop {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        [data-testid="pdf-job-chip"][data-job-status="running"] svg.pdf-chip-spinner {
          animation: pdf-chip-spin 1s linear infinite;
        }
        @keyframes pdf-chip-spin {
          from { transform: rotate(0); } to { transform: rotate(360deg); }
        }
      `}</style>
      <Icon
        size={16}
        className={isRunning ? 'pdf-chip-spinner' : ''}
        style={{ flex: '0 0 auto' }}
      />
      <span
        style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 'min(72vw, 400px)',
        }}
        data-testid="pdf-job-chip-text"
      >
        {isRunning && `Generating ${job.title}…`}
        {isReady && (job.hasBeenViewed
          ? `${job.title} — tap to view again`
          : `${job.title} ready — tap to view`)}
        {isError && `${job.title} failed — tap to dismiss`}
      </span>
      {!isRunning && (
        <button
          type="button"
          onClick={handleDismiss}
          data-testid="pdf-job-chip-dismiss"
          aria-label="Dismiss"
          style={{
            background: 'transparent',
            border: 0,
            color: 'inherit',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            opacity: 0.7,
            marginLeft: 2,
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>,
    document.body
  );
};

export default PdfJobChip;
