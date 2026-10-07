import React, { useState, useCallback } from 'react';
import { Mic, MicOff, Sparkles, Loader2, ChevronDown, ChevronUp, Wand2, RotateCcw } from 'lucide-react';
import apiClient from '../../../utils/apiClient';
import { notify } from '../../AppNotification';
import { API_URL } from '../../../config';
import { useSpeechInput } from '../../../hooks/useSpeechInput';
import { EntityAIReview } from './EntityAIReview';
import { applyEntityDraft, catalogPayload } from './entityAIApply';

const COLLAPSED_KEY = (estateId) => `ces_ai_builder_collapsed:${estateId || 'global'}`;
const EXAMPLE = 'e.g. "I own Harris Holdings LLC in Virginia — my wife Karen and I each hold 50%. The LLC owns our rental house on Oak Street. '
  + 'Our revocable living trust is the Harris Family Trust; I\u2019m trustee, Karen is successor trustee, and our kids Sarah and Mark are the beneficiaries."';

const btn = 'inline-flex items-center justify-center gap-1.5 rounded-full text-xs font-bold px-3.5 py-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';

// "Describe your structure" — speak or type, review what the AI heard, then build through the existing forms.
export const EntityAIBuilder = ({ estateId, user, beneficiaries = [], externals = [], hasChart = false, getAuthHeaders, onBuilt, onToggle }) => {
  const [collapsed, setCollapsed] = useState(() => hasChart && localStorage.getItem(COLLAPSED_KEY(estateId)) === '1');
  const [text, setText] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [building, setBuilding] = useState(false);
  const [draft, setDraft] = useState(null);
  const speech = useSpeechInput(useCallback((t) => setText(t), []));

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY(estateId), next ? '1' : '0'); } catch { /* private mode */ }
    onToggle?.(next);
  };

  const runDraft = async () => {
    if (text.trim().length < 8 || drafting) return;
    if (speech.listening) speech.stop();
    setDrafting(true);
    try {
      const r = await apiClient.post(`${API_URL}/financial/entities/${estateId}/ai-draft`, { description: text.trim(), catalog: catalogPayload() }, getAuthHeaders());
      setDraft(r.data.draft);
    } catch (err) {
      notify.error(err.response?.data?.detail || 'Could not draft your structure. Please try again.');
    } finally {
      setDrafting(false);
    }
  };

  const build = async () => {
    if (!draft || building) return;
    const bad = draft.entities.find((e) => !e.existing_id && !e.name.trim()) || draft.people.find((p) => !p.match && !p.first_name.trim());
    if (bad) { notify.error('Every entity and person needs a name before building.'); return; }
    setBuilding(true);
    try {
      const res = await applyEntityDraft({ draft, estateId, authHeaders: getAuthHeaders() });
      const made = [res.entities && `${res.entities} entit${res.entities === 1 ? 'y' : 'ies'}`, res.people && `${res.people} ${res.people === 1 ? 'person' : 'people'}`, res.connections && `${res.connections} connection${res.connections === 1 ? '' : 's'}`].filter(Boolean).join(', ');
      if (res.failures.length) notify.warning(`Built ${made || 'nothing'} — could not save: ${res.failures.join(', ')}.`);
      else notify.success(`Added ${made} to your chart. Tap any tile to fine-tune it.`);
      setDraft(null);
      setText('');
      onBuilt?.(res);
    } finally {
      setBuilding(false);
    }
  };

  if (collapsed) {
    return (
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-3 rounded-xl px-4 py-3 mb-3 text-left transition-colors hover:bg-[var(--s)]"
        style={{ border: '1px solid rgba(var(--gold-rgb), 0.35)', background: 'rgba(var(--gold-rgb), 0.06)' }} data-testid="es-ai-builder-collapsed">
        <span className="flex items-center gap-2 text-sm font-bold text-[var(--t)]"><Sparkles className="w-4 h-4 text-[var(--gold)]" /> Describe your structure — speak or type, and I&apos;ll draft the chart</span>
        <ChevronDown className="w-4 h-4 text-[var(--t4)] flex-shrink-0" />
      </button>
    );
  }

  return (
    <div className="rounded-2xl p-4 sm:p-5 mb-4" style={{ border: '1px solid rgba(var(--gold-rgb), 0.35)', background: 'linear-gradient(160deg, rgba(var(--gold-rgb), 0.10), rgba(var(--gold-rgb), 0.03))' }} data-testid="es-ai-builder">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base md:text-lg font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }} data-testid="es-ai-title">
            <Sparkles className="w-5 h-5 text-[var(--gold)] flex-shrink-0" /> Describe your structure
          </h3>
          <p className="text-sm text-[var(--t3)] mt-1 leading-snug">
            Tap the mic on your keyboard (or the one below) and talk through your entities, who owns what, and who the beneficiaries are. I&apos;ll fill in the forms — you review before anything is added, and every tile stays editable.
          </p>
        </div>
        {hasChart && (
          <button type="button" onClick={toggle} className="p-1.5 rounded-lg text-[var(--t4)] hover:text-[var(--t)] flex-shrink-0" aria-label="Hide" data-testid="es-ai-builder-hide"><ChevronUp className="w-4 h-4" /></button>
        )}
      </div>

      {!draft ? (
        <>
          <div className="relative">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={EXAMPLE}
              className="input-field text-base leading-relaxed resize-y" style={{ height: 'auto', minHeight: '7.5rem', paddingRight: speech.supported ? '3rem' : undefined, paddingTop: '0.6rem' }}
              aria-label="Describe your entities and how they connect" data-testid="es-ai-describe-input" />
            {speech.supported && (
              <button type="button" onClick={() => (speech.listening ? speech.stop() : speech.start(text))}
                className={`absolute right-2 top-2 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${speech.listening ? 'text-[#0b1120]' : 'text-[var(--t3)] hover:text-[var(--t)]'}`}
                style={speech.listening ? { background: '#ef4444', boxShadow: '0 0 0 6px rgba(239,68,68,0.25)' } : { background: 'var(--s)', border: '1px solid var(--b)' }}
                aria-pressed={speech.listening} aria-label={speech.listening ? 'Stop listening' : 'Dictate'} data-testid="es-ai-mic">
                {speech.listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
            <span className="text-[11px] text-[var(--t5)]" data-testid="es-ai-listening">{speech.listening ? 'Listening… tap the mic again when you\u2019re done.' : 'Nothing is created until you approve the draft.'}</span>
            <button type="button" onClick={runDraft} disabled={drafting || text.trim().length < 8} className={`${btn} btn-gold-cta`} data-testid="es-ai-draft-button">
              {drafting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Drafting…</> : <><Wand2 className="w-3.5 h-3.5" /> Draft my chart</>}
            </button>
          </div>
        </>
      ) : (
        <>
          <EntityAIReview draft={draft} onChange={setDraft} user={user} beneficiaries={beneficiaries} externals={externals} />
          <div className="flex items-center justify-end gap-2 mt-4 flex-wrap">
            <button type="button" onClick={() => setDraft(null)} disabled={building} className={`${btn} btn-outline-cta`} data-testid="es-ai-start-over"><RotateCcw className="w-3.5 h-3.5" /> Start over</button>
            <button type="button" onClick={build} disabled={building || (!draft.entities.length && !draft.connections.length)} className={`${btn} btn-gold-cta`} data-testid="es-ai-build-button">
              {building ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Building…</> : <><Sparkles className="w-3.5 h-3.5" /> Build my chart</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default EntityAIBuilder;
