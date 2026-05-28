import React, { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../config';

/**
 * "What changed since last login" widget.
 *
 * - Reads the persisted `last_seen_at` cursor from localStorage
 *   (initialized on first paint to "now - 30d" so brand-new users see
 *   their full setup history rolled up into one digest).
 * - Hits GET /api/changelog/since on mount.
 * - Updates the cursor to "now" only after the user actually views
 *   the digest (i.e. the widget mounts) so subsequent reloads roll
 *   forward cleanly.
 */
const KIND_TO_ROUTE = {
  Bill: '/financial-portal',
  Debt: '/financial-portal',
  Account: '/financial-portal',
  Asset: '/financial-portal',
  Document: '/documents',
  Checklist: '/checklist',
  Message: '/messages',
  'Care Protocol': '/ccp',
  Task: '/dts',
};

const ChangedSinceWidget = () => {
  const { getAuthHeaders, user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let alive = true;
    const cursorKey = `cy:lastSeen:${userId}`;
    let since = localStorage.getItem(cursorKey);
    if (!since) {
      // First-time users see the previous 30 days as their digest.
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      since = thirtyDaysAgo.toISOString();
    }
    (async () => {
      try {
        const res = await apiClient.get(`${API_URL}/changelog/since`, {
          ...getAuthHeaders(),
          params: { since, limit: 8 },
        });
        if (alive) {
          setEvents(Array.isArray(res.data?.events) ? res.data.events : []);
          // Roll the cursor forward to NOW so this same set isn't shown next reload.
          localStorage.setItem(cursorKey, new Date().toISOString());
        }
      } catch {
        if (alive) setEvents([]);
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Card className="glass-card" data-testid="changed-since-loading">
        <CardContent className="p-4 flex items-center gap-2 text-sm text-[var(--t5)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking what changed…
        </CardContent>
      </Card>
    );
  }
  if (!events || events.length === 0) return null;

  return (
    <Card className="glass-card" data-testid="changed-since-widget">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-[var(--gold)]" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--t3)]">
            What changed since you were last here
          </h3>
        </div>
        <ul className="space-y-1.5">
          {events.map((e, idx) => {
            const route = KIND_TO_ROUTE[e.kind] || null;
            return (
              <li
                key={`${e.collection}-${e.id}-${idx}`}
                className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm hover:bg-[var(--s)] transition-colors cursor-pointer"
                onClick={() => route && navigate(route)}
                data-testid={`changed-since-row-${idx}`}
              >
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--gold)] mr-2">
                    {e.kind}
                  </span>
                  <span className="text-[var(--t)] font-medium truncate">{e.label}</span>
                  <span className="text-[var(--t5)] ml-1">{e.action}</span>
                </div>
                {route && <ArrowRight className="w-3.5 h-3.5 text-[var(--t5)]" />}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};

export default ChangedSinceWidget;
