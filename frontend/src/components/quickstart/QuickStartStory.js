import React, { useState } from 'react';
import { Loader2, ShieldCheck, Sparkles, ArrowLeft } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { DictationTextarea } from '../ai/DictationTextarea';
import { notify } from '../AppNotification';

const EXAMPLE = 'e.g. "We live in Richmond, Virginia — we own the house. I\u2019m married to Karen. Two kids: Emma is 16 and Jack is 12, and my mother lives with us. We have a rental in Norfolk and a cabin in West Virginia. Two life insurance policies, one through work. I own an LLC for my consulting business. We did a will about ten years ago but no trust, and I have a power of attorney."';
const KEYTERMS = ['LLC', 'S-Corp', 'trust', 'will', 'power of attorney', 'life insurance', 'rental', 'married'];

// The QuickStart "tell me your story" screen: one plain-language disclosure, one box, one button.
export const QuickStartStory = ({ firstName, brand, getAuthHeaders, onApply, onBack }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [mic, setMic] = useState({ listening: false, transcribing: false, error: null, engine: null });

  const go = async () => {
    if (text.trim().length < 8 || busy || mic.listening || mic.transcribing) return;
    setBusy(true);
    try {
      const res = await apiClient.post(`${API_URL}/quickstart/ai-draft`, { description: text.trim() }, getAuthHeaders());
      await onApply(res.data.draft);
    } catch (err) {
      notify.error(err.response?.data?.detail || 'I could not sort that out — try again, or go screen by screen.');
    } finally {
      setBusy(false);
    }
  };

  const status = mic.error ? mic.error
    : mic.listening ? (mic.engine === 'device' ? 'Listening… tap the square when you’re done.' : 'Recording privately… tap the square when you’re done.')
    : mic.transcribing ? 'Turning your words into text…'
    : 'Nothing is saved until you’ve checked each screen.';

  return (
    <div className="space-y-4" data-testid="qs-story">
      <h3 className="text-xl lg:text-2xl font-bold" style={{ color: '#F8FAFC', fontFamily: 'var(--serif)' }}>Tell me your story, {firstName}.</h3>
      <p className="text-sm lg:text-base leading-relaxed" style={{ color: '#E5E7EB' }}>
        Talk the way you’d talk to a friend: where you live, who’s in your family, what you own, any business, insurance, and the papers you already have. {brand} puts your answers on the right screens — you look each one over before anything is kept.
      </p>
      <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.35)' }} data-testid="qs-story-privacy">
        <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#FCD34D' }} />
        <p className="text-xs lg:text-sm leading-relaxed" style={{ color: '#E5E7EB' }}>
          <strong>Before you start:</strong> your words go only to {brand}, so we can sort them onto these screens. We don’t keep the recording or the words once that’s done, and nothing is saved until you’ve checked each screen and tapped Next. Anything you’d rather not say out loud, you can type on the screen itself.
        </p>
      </div>
      <DictationTextarea value={text} onChange={setText} placeholder={EXAMPLE} minHeight="9rem" keyterms={KEYTERMS} onState={setMic} ariaLabel="Your story" testId="qs-story-input" micTestId="qs-story-mic" className="on-dark" />
      <p className={`text-[11px] ${mic.error ? 'text-[#fca5a5]' : ''}`} style={mic.error ? undefined : { color: '#CBD5E1' }} data-testid="qs-story-status">{status}</p>
      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <button type="button" onClick={onBack} disabled={busy} data-testid="qs-story-back"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs lg:text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-40"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#F8FAFC' }}>
          <ArrowLeft className="w-3.5 h-3.5" /> I’d rather go screen by screen
        </button>
        <button type="button" onClick={go} disabled={busy || mic.listening || mic.transcribing || text.trim().length < 8} data-testid="qs-story-go"
          className="inline-flex items-center gap-2 px-4 lg:px-5 py-2 rounded-xl text-xs lg:text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#181818', boxShadow: '0 8px 24px rgba(var(--gold-rgb), 0.25)' }}>
          {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sorting it out…</> : <><Sparkles className="w-3.5 h-3.5" /> Fill in my answers</>}
        </button>
      </div>
    </div>
  );
};

export default QuickStartStory;
