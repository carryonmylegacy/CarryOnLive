/**
 * EntitiesShareToggle — small icon-button + popover that lets the
 * estate owner control whether beneficiaries can see the Entities &
 * Structures (E&S) chart BEFORE they have transitioned. Defaults to
 * posthumous-only (off). When "Show now" is on, the owner picks which
 * specific beneficiaries can see it now (default = NONE selected, so
 * flipping the switch alone changes nothing until at least one
 * beneficiary chip is tapped).
 *
 * Data flows through:
 *   GET   /api/financial/entities-share/{estate_id}
 *   PATCH /api/financial/entities-share/{estate_id}
 *
 * Lives in the E&S toolbar inside EntitiesSection so the affordance
 * sits next to the lock/clean-up/reset/+ buttons the user already
 * uses to manage the chart.
 */
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Eye, X, Check } from 'lucide-react';
import { API_URL } from '../../../config';
import { toast } from '../../../utils/toast';

export default function EntitiesShareToggle({ estateId, beneficiaries = [], getAuthHeaders }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showNow, setShowNow] = useState(false);
  const [chosenIds, setChosenIds] = useState([]);
  const popRef = useRef(null);
  const btnRef = useRef(null);

  // Load current setting when popover opens
  useEffect(() => {
    if (!open || !estateId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await axios.get(
          `${API_URL}/financial/entities-share/${estateId}`,
          getAuthHeaders ? getAuthHeaders() : {}
        );
        if (cancelled) return;
        setShowNow(!!res.data?.show_now);
        setChosenIds(Array.isArray(res.data?.now_beneficiary_ids) ? res.data.now_beneficiary_ids : []);
      } catch {
        // swallow — popover will just show defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, estateId, getAuthHeaders]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('touchstart', onClick);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('touchstart', onClick);
    };
  }, [open]);

  const toggleBenChip = (id) =>
    setChosenIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await axios.patch(
        `${API_URL}/financial/entities-share/${estateId}`,
        { show_now: !!showNow, now_beneficiary_ids: showNow ? chosenIds : [] },
        getAuthHeaders ? getAuthHeaders() : {}
      );
      toast.success(showNow && chosenIds.length
        ? `Sharing E&S with ${chosenIds.length} beneficiary${chosenIds.length === 1 ? '' : 's'} now.`
        : 'E&S set to posthumous-only.');
      setOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save sharing settings.');
    } finally {
      setSaving(false);
    }
  };

  const activeCount = showNow ? chosenIds.length : 0;
  const isOn = !!showNow && activeCount > 0;

  return (
    <div className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-bold flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full transition-all whitespace-nowrap"
        style={isOn ? {
          color: '#1A1A1A',
          background: 'var(--gold)',
          border: '1px solid var(--gold)',
          boxShadow: '0 0 12px rgba(212,165,55,0.55), 0 0 24px rgba(212,165,55,0.25)',
        } : {
          color: 'var(--t4)',
          background: 'transparent',
          border: '1px solid var(--b)',
        }}
        data-testid="entities-share-toggle"
        title={isOn ? `Sharing E&S with ${activeCount} beneficiary${activeCount === 1 ? '' : 's'} now` : 'Beneficiaries see E&S posthumously only (default). Tap to share now.'}
        aria-label="Share Entities & Structures"
        aria-pressed={isOn}
      >
        <Eye className="w-3 h-3" />
        <span className="hidden sm:inline">{isOn ? `Sharing (${activeCount})` : 'Share'}</span>
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute right-0 top-full mt-1 z-40 w-[280px] sm:w-[320px] rounded-xl shadow-2xl"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
          data-testid="entities-share-popover"
        >
          <div className="px-3 py-2 border-b border-[var(--b)] flex items-center justify-between">
            <div className="text-[12px] font-bold text-[var(--t)]">Share Entities & Structures</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 text-[var(--t5)] hover:text-[var(--t)]"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3 space-y-3">
            <p className="text-[11px] text-[var(--t5)] leading-snug">
              Beneficiaries on a CFP-eligible tier always see your E&S
              <span className="text-[var(--t)] font-bold"> posthumously</span>.
              Toggle <span className="text-[var(--t)] font-bold">Show now</span> to also let
              specific beneficiaries see it while you're alive.
            </p>

            {/* Show-now switch */}
            <button
              type="button"
              onClick={() => setShowNow((v) => !v)}
              disabled={loading}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg"
              style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
              data-testid="entities-share-show-now"
              aria-pressed={showNow}
            >
              <span className="text-[12px] font-bold text-[var(--t)]">Show now</span>
              <span
                className="relative inline-block w-9 h-5 rounded-full transition-colors"
                style={{ background: showNow ? 'var(--gold)' : 'var(--b)' }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                  style={{
                    left: showNow ? 'calc(100% - 1.125rem)' : '0.125rem',
                    background: showNow ? '#0b1120' : '#fff',
                  }}
                />
              </span>
            </button>

            {/* Beneficiary chips — only relevant when show_now is on */}
            {showNow && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-1.5">
                  Who sees it now
                </div>
                {beneficiaries.length === 0 ? (
                  <p className="text-[11px] text-[var(--t5)] italic">
                    No beneficiaries on file yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-auto">
                    {beneficiaries.map((b) => {
                      const id = b.id || b.beneficiary_id || b._id;
                      const name = b.name || `${b.first_name || ''} ${b.last_name || ''}`.trim() || 'Unnamed';
                      const checked = chosenIds.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleBenChip(id)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full transition-all"
                          style={checked ? {
                            color: '#0b1120',
                            background: 'var(--gold)',
                            border: '1px solid var(--gold)',
                          } : {
                            color: 'var(--t3)',
                            background: 'transparent',
                            border: '1px solid var(--b)',
                          }}
                          data-testid={`entities-share-ben-${id}`}
                          aria-pressed={checked}
                        >
                          {checked && <Check className="w-3 h-3" />}
                          {name}
                        </button>
                      );
                    })}
                  </div>
                )}
                {chosenIds.length === 0 && (
                  <p className="mt-1.5 text-[10.5px] text-[var(--t5)] italic">
                    No one selected yet — flipping <em>Show now</em> alone doesn't share anything.
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={save}
              disabled={saving || loading}
              className="w-full px-3 py-2 rounded-lg text-[12px] font-bold transition-all"
              style={{
                background: 'var(--gold)',
                color: '#0b1120',
                opacity: saving || loading ? 0.6 : 1,
              }}
              data-testid="entities-share-save"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
