/**
 * EstateBinderButton — bottom-LEFT companion to the EGA pill.
 *
 * One-tap assembly of every cached PDF the user has across the
 * platform into a single multi-page binder with a Title Page (drawn
 * from Settings) + adaptive Table of Contents. If the user is
 * missing some sections, we surface a guidance modal telling them
 * exactly which screen to visit to generate each missing PDF —
 * tapping a row navigates them straight there.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenCheck, FileText, ChevronRight, Loader2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import { toast } from '../utils/toast';

// Pretty-print a delta in compact form: "now" / "2m" / "1h" / "2d".
const formatAgo = (iso) => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!t || isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
};

const EstateBinderButton = () => {
  const navigate = useNavigate();
  const { getAuthHeaders } = useAuth();
  const [loading, setLoading] = useState(false);
  const [emptyState, setEmptyState] = useState(null); // { available, missing, message }
  // Last time the user generated a binder — pulled from the
  // `/api/pdfs/latest` cache slot on mount and updated optimistically
  // after every successful regeneration. Surfaced as a tiny "Last
  // regenerated X ago" sub-line under the button so demo prospects
  // see at-a-glance freshness without tapping.
  const [lastGeneratedAt, setLastGeneratedAt] = useState(null);

  // Hydrate the "last generated" stamp once on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const headers = (getAuthHeaders() || {}).headers || {};
        const res = await fetch(`${API_URL}/pdfs/latest`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        const hit = (data.pdfs || []).find((p) => p.pdf_type === 'estate_binder');
        if (alive && hit?.updated_at) setLastGeneratedAt(hit.updated_at);
      } catch {
        /* offline / unauthenticated — ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [getAuthHeaders]);

  const handleClick = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const headers = (getAuthHeaders() || {}).headers || {};
      const res = await fetch(`${API_URL}/estate-binder/generate`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
      const contentType = res.headers.get('content-type') || '';

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `HTTP ${res.status}`);
      }

      // Empty / nothing-cached case → backend returns JSON describing
      // which sections still need a one-tap cache from their page.
      if (contentType.includes('application/json')) {
        const data = await res.json();
        setEmptyState({
          available: data.available || [],
          missing: data.missing || [],
          message: data.message || 'Generate a PDF from any section first.',
        });
        return;
      }

      // Success → PDF stream. Hand it to the global preview modal.
      const missingHeader = res.headers.get('x-carryon-binder-missing') || '';
      const includedHeader = res.headers.get('x-carryon-binder-included') || '';
      const pageCount = res.headers.get('x-carryon-binder-page-count') || '';
      const blob = await res.blob();
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);
      window.dispatchEvent(
        new CustomEvent('carryon:open-pdf-preview', {
          detail: {
            blob: pdfBlob,
            url,
            filename: 'estate_binder.pdf',
            title: 'Estate Binder',
            subtitle: `${includedHeader.split(',').filter(Boolean).length} section${
              includedHeader.split(',').filter(Boolean).length === 1 ? '' : 's'
            } · ${pageCount || '?'} pages`,
          },
        }),
      );
      // Light banner toast if the user is missing some sections.
      if (missingHeader) {
        const missingCount = missingHeader.split(',').filter(Boolean).length;
        toast.info(
          `Binder ready — ${missingCount} section${missingCount === 1 ? '' : 's'} not yet generated. Tap the print button on each page to add them next time.`,
        );
      } else {
        toast.success('Estate Binder ready.');
      }
      // Optimistic freshness stamp — the backend self-caches the
      // binder in `latest_pdfs` so this matches what /pdfs/latest
      // would return on the next mount.
      setLastGeneratedAt(new Date().toISOString());
    } catch (err) {
      console.warn('[EstateBinder] generate failed', err);
      toast.error("Couldn't build the binder — please try again.");
    } finally {
      setLoading(false);
    }
  }, [loading, getAuthHeaders]);

  const closeEmpty = () => setEmptyState(null);

  const handleNavigateToSection = (route) => {
    setEmptyState(null);
    navigate(route);
  };

  return (
    <>
      <div
        className="absolute bottom-3 left-3 lg:bottom-4 lg:left-4 flex flex-col items-center"
        style={{ pointerEvents: 'none' }}
      >
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className="flex flex-col items-center justify-center gap-0.5 w-12 h-12 lg:w-14 lg:h-14 rounded-xl transition-transform duration-150 active:scale-[0.94]"
          style={{
            color: '#60a5fa',
            background: 'rgba(96,165,250,0.08)',
            border: '1px solid rgba(96,165,250,0.55)',
            boxShadow:
              '0 0 12px rgba(96,165,250,0.45), 0 0 24px rgba(96,165,250,0.18), inset 0 0 8px rgba(96,165,250,0.12)',
            cursor: loading ? 'wait' : 'pointer',
            pointerEvents: 'auto',
          }}
          title={
            lastGeneratedAt
              ? `Assemble Estate Binder · last built ${formatAgo(lastGeneratedAt)} ago`
              : 'Assemble Estate Binder'
          }
          aria-label="Assemble Estate Binder"
          data-testid="readiness-estate-binder-btn"
        >
        {loading ? (
          <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 animate-spin" />
        ) : (
          <BookOpenCheck className="w-4 h-4 lg:w-5 lg:h-5" />
        )}
        <span className="text-[11px] font-bold tracking-wider leading-none">BNDR</span>
      </button>
        {lastGeneratedAt && (
          <span
            className="mt-1 text-[11px] font-medium leading-none whitespace-nowrap"
            style={{
              color: 'rgba(96,165,250,0.85)',
              textShadow: '0 0 6px rgba(96,165,250,0.35)',
            }}
            data-testid="readiness-estate-binder-stamp"
          >
            {`Built ${formatAgo(lastGeneratedAt)}`}
          </span>
        )}
      </div>

      {emptyState && (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center px-4"
          data-testid="estate-binder-empty-modal"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0"
            style={{
              backdropFilter: 'blur(20px) saturate(130%)',
              WebkitBackdropFilter: 'blur(20px) saturate(130%)',
              background: 'rgba(8,14,26,0.75)',
            }}
            onClick={closeEmpty}
          />
          <div
            className="relative w-full max-w-lg glass-card p-6 lg:p-8"
            style={{
              border: '1px solid rgba(96,165,250,0.35)',
              boxShadow: '0 0 32px rgba(96,165,250,0.25)',
            }}
          >
            <button
              type="button"
              onClick={closeEmpty}
              className="absolute top-3 right-3 p-2 rounded-lg text-[var(--t5)] hover:text-[var(--t)] transition"
              aria-label="Close"
              data-testid="estate-binder-empty-close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div
                className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                style={{
                  color: '#60a5fa',
                  background: 'rgba(96,165,250,0.10)',
                  border: '1px solid rgba(96,165,250,0.40)',
                }}
              >
                <BookOpenCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg lg:text-xl font-bold text-[var(--t)]">Estate Binder</h3>
                <p className="text-xs text-[var(--t4)]">Combine every section into one printed document</p>
              </div>
            </div>

            <p className="text-sm text-[var(--t3)] mb-5 leading-relaxed">
              {emptyState.message} The binder will rebuild itself the next time you tap this button.
            </p>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {(emptyState.missing || []).map((m) => (
                <button
                  key={m.pdf_type}
                  type="button"
                  onClick={() => handleNavigateToSection(m.route)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-xl transition-transform duration-150 active:scale-[0.99]"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.10)',
                  }}
                  data-testid={`estate-binder-missing-${m.pdf_type}`}
                >
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{
                      color: '#60a5fa',
                      background: 'rgba(96,165,250,0.08)',
                      border: '1px solid rgba(96,165,250,0.25)',
                    }}
                  >
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--t)] truncate">{m.display_title}</p>
                    <p className="text-xs text-[var(--t4)] truncate">
                      Tap to open the {m.route_label} page — use its print button to add it.
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 flex-shrink-0 text-[var(--t5)]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EstateBinderButton;
