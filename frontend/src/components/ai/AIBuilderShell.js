import React, { useState, useCallback } from 'react';
import { Sparkles, Loader2, ChevronDown, ChevronUp, Wand2, RotateCcw } from 'lucide-react';
import { notify } from '../AppNotification';
import { DictationMicButton } from './DictationMicButton';
import { DICTATION_ENGINES } from '../../hooks/useDictation';
import { useAuth } from '../../contexts/AuthContext';

// One hook for every builder: the `aib` feature gate (Admin → Finance → Subs → Feature Gates).
export const useAIBuildersEnabled = () => {
  const { enabledFeatures } = useAuth();
  return Array.isArray(enabledFeatures) && enabledFeatures.includes('aib');
};

const btn = 'inline-flex items-center justify-center gap-1.5 rounded-full text-xs font-bold px-3.5 py-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * The "describe it → here's what I heard → build" card every pillar shares.
 * Pillar modules supply: copy, `draft(text)`, `renderReview(draft, setDraft)`, `validate(draft)`, `build(draft)`.
 * Nothing is written until `build` runs — and `build` must go through the pillar's ordinary CRUD endpoints.
 */
export const AIBuilderShell = ({
  id, title, intro, example, draftLabel = 'Draft it', buildLabel = 'Build it', keyterms = [],
  collapsible = false, collapsedLabel, draft: runDraft, renderReview, validate, build, canBuild, onToggle,
}) => {
  const key = `ai_builder_collapsed:${id}`;
  const [collapsed, setCollapsed] = useState(() => collapsible && localStorage.getItem(key) === '1');
  const [text, setText] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [building, setBuilding] = useState(false);
  const [draft, setDraft] = useState(null);
  const [mic, setMic] = useState({ listening: false, transcribing: false, error: null, engine: null });
  const onText = useCallback((t) => setText(t), []);
  const enabled = useAIBuildersEnabled();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(key, next ? '1' : '0'); } catch { /* private mode */ }
    onToggle?.(next);
  };

  const doDraft = async () => {
    if (text.trim().length < 8 || drafting || mic.listening || mic.transcribing) return;
    setDrafting(true);
    try {
      setDraft(await runDraft(text.trim()));
    } catch (err) {
      notify.error(err.response?.data?.detail || 'Could not draft that. Please try again.');
    } finally {
      setDrafting(false);
    }
  };

  const doBuild = async () => {
    if (!draft || building) return;
    const problem = validate?.(draft);
    if (problem) { notify.error(problem); return; }
    setBuilding(true);
    try {
      const res = await build(draft);
      if (res?.failures?.length) notify.warning(`Built ${res.made || 'nothing'} — could not save: ${res.failures.join(', ')}.`);
      else notify.success(res?.message || `Added ${res?.made || 'everything'}. Tap any tile to fine-tune it.`);
      setDraft(null);
      setText('');
    } finally {
      setBuilding(false);
    }
  };

  if (!enabled) return null;

  if (collapsed) {
    return (
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-3 rounded-xl px-4 py-3 mb-3 text-left transition-colors hover:bg-[var(--s)]"
        style={{ border: '1px solid rgba(var(--gold-rgb), 0.35)', background: 'rgba(var(--gold-rgb), 0.06)' }} data-testid={`${id}-collapsed`}>
        <span className="flex items-center gap-2 text-sm font-bold text-[var(--t)]"><Sparkles className="w-4 h-4 text-[var(--gold)]" /> {collapsedLabel || `${title} — speak or type, and I’ll draft it`}</span>
        <ChevronDown className="w-4 h-4 text-[var(--t4)] flex-shrink-0" />
      </button>
    );
  }

  const status = mic.error ? mic.error
    : mic.listening ? (mic.engine === 'device' ? 'Listening… tap the square when you’re done.' : 'Recording privately… tap the square when you’re done and I’ll transcribe it.')
    : mic.transcribing ? 'Transcribing on CarryOn’s private xAI account…'
    : 'Nothing is created until you approve the draft.';

  return (
    <div className="rounded-2xl p-4 sm:p-5 mb-4" style={{ border: '1px solid rgba(var(--gold-rgb), 0.35)', background: 'linear-gradient(160deg, rgba(var(--gold-rgb), 0.10), rgba(var(--gold-rgb), 0.03))' }} data-testid={id}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base md:text-lg font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }} data-testid={`${id}-title`}>
            <Sparkles className="w-5 h-5 text-[var(--gold)] flex-shrink-0" /> {title}
          </h3>
          <p className="text-sm text-[var(--t3)] mt-1 leading-snug">{intro}</p>
        </div>
        {collapsible && (
          <button type="button" onClick={toggle} className="p-1.5 rounded-lg text-[var(--t4)] hover:text-[var(--t)] flex-shrink-0" aria-label="Hide" data-testid={`${id}-hide`}><ChevronUp className="w-4 h-4" /></button>
        )}
      </div>

      {!draft ? (
        <>
          <div className="relative">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={example}
              className="input-field ai-builder-input text-base leading-relaxed resize-y" style={{ height: 'auto', minHeight: '7.5rem', paddingRight: '3.5rem', paddingTop: '0.6rem' }}
              aria-label={title} data-testid={`${id}-input`} />
            <DictationMicButton value={text} onText={onText} keyterms={keyterms} onState={setMic} testId={`${id}-mic`} className="absolute right-2 top-2 z-10 shadow-sm" />
          </div>
          <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
            <span className={`text-[11px] ${mic.error ? 'text-[#ef4444]' : 'text-[var(--t5)]'}`} data-testid={`${id}-status`}>
              {status}
              {!mic.listening && !mic.transcribing && !mic.error && mic.engine && (
                <> · Mic: <a href="/settings#dictation" className="underline hover:text-[var(--t3)]" data-testid={`${id}-engine-link`}>{DICTATION_ENGINES[mic.engine].short}</a></>
              )}
            </span>
            <button type="button" onClick={doDraft} disabled={drafting || mic.listening || mic.transcribing || text.trim().length < 8} className={`${btn} btn-gold-cta`} data-testid={`${id}-draft-button`}>
              {drafting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Drafting…</> : <><Wand2 className="w-3.5 h-3.5" /> {draftLabel}</>}
            </button>
          </div>
        </>
      ) : (
        <>
          {renderReview(draft, setDraft)}
          <div className="flex items-center justify-end gap-2 mt-4 flex-wrap">
            <button type="button" onClick={() => setDraft(null)} disabled={building} className={`${btn} btn-outline-cta`} data-testid={`${id}-start-over`}><RotateCcw className="w-3.5 h-3.5" /> Start over</button>
            <button type="button" onClick={doBuild} disabled={building || (canBuild ? !canBuild(draft) : false)} className={`${btn} btn-gold-cta`} data-testid={`${id}-build-button`}>
              {building ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Building…</> : <><Sparkles className="w-3.5 h-3.5" /> {buildLabel}</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AIBuilderShell;
