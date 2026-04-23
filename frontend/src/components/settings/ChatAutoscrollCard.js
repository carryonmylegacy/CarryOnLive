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
  const [minutes, setMinutes] = useState(240);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState('240');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_URL}/user-preferences/chat-autoscroll`, { headers });
        if (r.ok) {
          const d = await r.json();
          const val = Math.max(1, Math.min(1440, Number(d.threshold_minutes) || 240));
          setMinutes(val);
          setDraft(String(val));
        }
      } catch {
        /* network — keep defaults */
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const clean = Math.max(1, Math.min(1440, Math.round(Number(draft) || 240)));
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/user-preferences/chat-autoscroll`, {
        method: 'PUT', headers, body: JSON.stringify({ threshold_minutes: clean }),
      });
      if (r.ok) {
        const d = await r.json();
        setMinutes(d.threshold_minutes);
        setDraft(String(d.threshold_minutes));
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
    if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
    if (m < 1440) {
      const h = m / 60;
      return `${Number.isInteger(h) ? h : h.toFixed(1)} hour${h === 1 ? '' : 's'}`;
    }
    return '24 hours';
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
                Minutes away before jumping to latest:
              </label>
              <input
                id="chat-autoscroll-input"
                data-testid="chat-autoscroll-input"
                type="number"
                min={1}
                max={1440}
                step={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={loading || saving}
                className="w-24 px-3 py-2 rounded-md bg-[var(--bg2)] border border-[var(--border)] text-[var(--t)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent,#daa520)]/40"
              />
              <button
                type="button"
                onClick={save}
                disabled={loading || saving || Number(draft) === minutes}
                data-testid="chat-autoscroll-save-btn"
                className="px-4 py-2 rounded-md bg-[var(--accent,#daa520)] text-[#0B1221] text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--accent-600,#c19318)] transition-colors inline-flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
            </div>
            <p className="text-xs text-[var(--t2)] mt-2" data-testid="chat-autoscroll-summary">
              Current: <span className="text-[var(--t)] font-medium">{prettyDuration(minutes)}</span> away · Range 1–1440 min
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ChatAutoscrollCard;
