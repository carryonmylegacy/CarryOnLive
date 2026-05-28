import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { Quote, Crown, Sparkles, ChevronRight } from 'lucide-react';
import { API_URL } from '../config';

/**
 * HomeVoicesStrip — rotating social-proof strip that pulls featured quotes
 * from /api/share-cards/voices/public.
 *
 * Behaviour by count of featured quotes:
 *   0  → renders nothing (honest: no fake testimonials).
 *   1  → single static quote, no rotation / dots.
 *   2+ → auto-rotates every 8s, with dots + next arrow + pause-on-hover.
 *
 * Safe to drop anywhere on public pages. Zero auth, zero side effects.
 */
export default function HomeVoicesStrip() {
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);

  // Fetch once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(`${API_URL}/share-cards/voices/public?limit=24`);
        if (!cancelled) setItems(res.data?.items || []);
      } catch {
        /* graceful — component simply renders nothing */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-rotate (only when 2+)
  useEffect(() => {
    if (items.length < 2 || paused) return;
    timerRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % items.length);
    }, 8000);
    return () => clearInterval(timerRef.current);
  }, [items.length, paused]);

  // Honest empty-state: render nothing until we have ≥1 featured quote
  if (!loaded || items.length === 0) return null;

  const current = items[idx];
  const isFC = current?.variant === 'fc';
  const accent = isFC ? '#d4af37' : '#34d399';
  const ChipIcon = isFC ? Crown : Sparkles;

  return (
    <section
      className="relative py-14 sm:py-20 px-6"
      style={{
        background:
          'linear-gradient(180deg, rgba(11,18,33,0) 0%, rgba(var(--gold-rgb), 0.05) 50%, rgba(11,18,33,0) 100%)',
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      data-testid="home-voices-strip"
      aria-label="Member voices"
    >
      <div className="max-w-3xl mx-auto text-center">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6"
          style={{
            background: 'rgba(var(--gold-rgb), 0.12)',
            border: '1px solid rgba(var(--gold-rgb), 0.28)',
          }}
        >
          <Quote className="w-3.5 h-3.5" style={{ color: '#d4af37' }} />
          <span
            className="text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: '#d4af37' }}
          >
            In our members&apos; words
          </span>
        </div>

        <div
          className="min-h-[180px] sm:min-h-[200px] flex flex-col items-center justify-center"
          key={current.id} /* key change = CSS animation restart */
          style={{ animation: 'voiceStripFade 600ms ease-out' }}
        >
          <blockquote
            className="text-2xl sm:text-3xl lg:text-4xl italic leading-snug max-w-2xl"
            style={{ fontFamily: 'var(--serif)', color: 'rgba(255,255,255,0.95)' }}
          >
            &ldquo;{current.quote}&rdquo;
          </blockquote>
          <div className="mt-5 flex items-center gap-2">
            <div
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full"
              style={{
                background: `${accent}22`,
                border: `1px solid ${accent}55`,
              }}
            >
              <ChipIcon className="w-3 h-3" style={{ color: accent }} />
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: accent }}
              >
                {isFC ? 'Founding Member' : 'CarryOn Member'}
              </span>
            </div>
            <span
              className="text-sm font-semibold"
              style={{ color: accent }}
            >
              — {current.first_name}
            </span>
          </div>
        </div>

        {/* Dots + next arrow — only when 2+ */}
        {items.length >= 2 ? (
          <div className="mt-6 flex items-center justify-center gap-4">
            <div className="flex items-center gap-1.5">
              {items.map((it, i) => (
                <button
                  key={it.id}
                  onClick={() => setIdx(i)}
                  aria-label={`Show voice ${i + 1} of ${items.length}`}
                  className="transition-all"
                  style={{
                    width: i === idx ? 20 : 6,
                    height: 6,
                    borderRadius: 999,
                    background: i === idx ? '#d4af37' : 'rgba(255,255,255,0.22)',
                  }}
                  data-testid={`home-voices-dot-${i}`}
                />
              ))}
            </div>
            <button
              onClick={() => setIdx((i) => (i + 1) % items.length)}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{
                background: 'var(--s)',
                color: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
              aria-label="Next voice"
              data-testid="home-voices-next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : null}

        <div className="mt-7">
          <Link
            to="/voices"
            className="text-xs uppercase tracking-[0.18em] font-semibold inline-flex items-center gap-1.5"
            style={{ color: 'rgba(var(--gold-rgb), 0.85)' }}
            data-testid="home-voices-link"
          >
            Read more voices
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <style>{`
        @keyframes voiceStripFade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
