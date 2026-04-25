import React, { useState, useEffect } from 'react';
import { toast } from '../../utils/toast';
import { MessageCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { API_URL } from '../../config';

/**
 * ChatAutoscrollCard — lets the user set how long they can be away from a
 * specific chat conversation before we auto-scroll to the latest message
 * when they re-open it.
 *
 * Under the threshold, we restore their previous scroll position
 * (iMessage-like). Per-channel last-visit timestamps + last scroll offsets
 * are stored in localStorage by EstateChatPage; this card only controls
 * the threshold itself.
 */
export const ChatAutoscrollCard = () => {
  const token = localStorage.getItem('carryon_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [loading, setLoading] = useState(true);
  // Hydrate from localStorage cache so the value shown matches what
  // EstateChatPage will actually use on the current session — and so
  // a save here is reflected before the API round-trip completes.
  const cachedInitial = (() => {
    try {
      const raw = parseInt(localStorage.getItem('carryon_chat_autoscroll_min') || '', 10);
      return Number.isFinite(raw) && raw >= 1 && raw <= 1440 ? raw : 240;
    } catch { return 240; }
  })();
  const [minutes, setMinutes] = useState(cachedInitial);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(cachedInitial);

  // Presets: every minute for 1-15, then 30 / 45 / 60, then whole-hour steps up to 24 hr.
  const PRESETS = [
    ...Array.from({ length: 15 }, (_, i) => ({ value: i + 1, label: `${i + 1} minute${i === 0 ? '' : 's'}` })),
    { value: 30, label: '30 minutes' },
    { value: 45, label: '45 minutes' },
    { value: 60, label: '1 hour' },
    { value: 120, label: '2 hours' },
    { value: 180, label: '3 hours' },
    { value: 240, label: '4 hours' },
    { value: 360, label: '6 hours' },
    { value: 480, label: '8 hours' },
    { value: 720, label: '12 hours' },
    { value: 1080, label: '18 hours' },
    { value: 1440, label: '24 hours' },
  ];

  // Snap a stored value (could be anything 1-1440) to the nearest preset.
  const snapToPreset = (m) => {
    const n = Math.max(1, Math.min(1440, Number(m) || 240));
    return PRESETS.reduce((best, p) => Math.abs(p.value - n) < Math.abs(best - n) ? p.value : best, PRESETS[0].value);
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_URL}/user-preferences/chat-autoscroll`, { headers });
        if (r.ok) {
          const d = await r.json();
          const snapped = snapToPreset(d.threshold_minutes);
          setMinutes(snapped);
          setDraft(snapped);
          // Mirror to localStorage so EstateChatPage can read it
          // synchronously on next mount and avoid the race where the
          // user-set threshold isn't applied because the API fetch
          // hadn't completed by the time the channel-open effect ran.
          try { localStorage.setItem('carryon_chat_autoscroll_min', String(snapped)); } catch { /* quota */ }
        }
      } catch {
        /* network — keep defaults */
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const clean = snapToPreset(draft);
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/user-preferences/chat-autoscroll`, {
        method: 'PUT', headers, body: JSON.stringify({ threshold_minutes: clean }),
      });
      if (r.ok) {
        const d = await r.json();
        const snapped = snapToPreset(d.threshold_minutes);
        setMinutes(snapped);
        setDraft(snapped);
        try { localStorage.setItem('carryon_chat_autoscroll_min', String(snapped)); } catch { /* quota */ }
        toast.success('Chat scroll preference saved');
      } else {
        toast.error('Could not save preference. Try again.');
      }
    } catch {
      toast.error('Network error — try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const prettyDuration = (m) => {
    const match = PRESETS.find(p => p.value === m);
    return match ? match.label : `${m} min`;
  };

  return (
    <Card className="glass-card" data-testid="chat-autoscroll-card">
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-[var(--accent-50,rgba(218,165,32,0.12))] shrink-0">
            <MessageCircle className="w-5 h-5 text-[var(--accent,#daa520)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-[var(--t)]">Jump-to-latest in chat</h3>
            <p className="text-sm text-[var(--t2)] mt-1">
              When you re-open a chat conversation, we'll scroll you to the most recent message
              if it's been longer than this since you last viewed it. Otherwise we'll restore
              your previous scroll position.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label htmlFor="chat-autoscroll-input" className="text-sm text-[var(--t)]">
                Time away before jumping to latest:
              </label>
              <select
                id="chat-autoscroll-input"
                data-testid="chat-autoscroll-input"
                value={draft}
                onChange={(e) => setDraft(Number(e.target.value))}
                disabled={loading || saving}
                className="select-themed px-3 py-2 rounded-md bg-[var(--bg2)] border border-[var(--border)] text-[var(--t)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent,#daa520)]/40"
              >
                {PRESETS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={save}
                disabled={loading || saving || Number(draft) === minutes}
                data-testid="chat-autoscroll-save-btn"
                className="px-4 py-2 rounded-md text-sm font-semibold btn-gold-cta inline-flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
            </div>
            <p className="text-xs text-[var(--t2)] mt-2" data-testid="chat-autoscroll-summary">
              Current: <span className="text-[var(--t)] font-medium">{prettyDuration(minutes)}</span> away
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ChatAutoscrollCard;
