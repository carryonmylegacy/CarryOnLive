import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Crown, Sparkles, Quote, ArrowRight } from 'lucide-react';
import { API_URL } from '../config';
import { getOfflineMode } from '../offline/featureFlag';
import { getLocalVoices, upsertLocalVoices } from '../offline/repos/voicesRepo';

/**
 * Public "Voices" page — displays quotes the founder has explicitly
 * featured. Unauthenticated; feeds from GET /api/share-cards/voices/public.
 *
 * Serves two purposes:
 *  1. Social proof for prospective members (a wall of real, first-person
 *     testimonials with varsity-serif typography).
 *  2. A public thank-you to the members who opted in.
 */
export default function VoicesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mode = getOfflineMode();
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      // Offline-first paint: seed from local cache so the wall appears
      // instantly on repeat visits. Public data → safe to cache.
      // Rescue fires whenever offline mode is enabled OR the device is
      // reported offline, so airplane mode never blanks the list.
      if (mode !== 'off' || isOffline) {
        try {
          const local = await getLocalVoices();
          if (!cancelled && local.length > 0) {
            setItems(local);
            setLoading(false);
          }
        } catch { /* non-fatal */ }
        if (isOffline) {
          if (!cancelled) setLoading(false);
          return;
        }
      }
      try {
        const res = await axios.get(`${API_URL}/share-cards/voices/public`);
        const list = res.data?.items || [];
        if (!cancelled) setItems(list);
        upsertLocalVoices(list).catch(() => {});
      } catch {
        /* graceful — show empty state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
      });
    } catch {
      return '';
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(212,175,55,0.10) 0%, #0b1221 55%, #0b1221 100%)',
        color: '#fff',
      }}
      data-testid="public-voices-page"
    >
      {/* Simple nav */}
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-4 flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2"
          style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 600, color: '#d4af37' }}
        >
          CarryOn
        </Link>
        <Link
          to="/signup"
          className="text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5"
          style={{
            background: 'linear-gradient(135deg, #d4af37, #b8962e)',
            color: '#080e1a',
          }}
          data-testid="voices-cta-signup"
        >
          Join CarryOn
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-10 sm:pt-16 pb-10 text-center">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6"
          style={{
            background: 'rgba(212,175,55,0.12)',
            border: '1px solid rgba(212,175,55,0.32)',
          }}
        >
          <Quote className="w-3.5 h-3.5" style={{ color: '#d4af37' }} />
          <span
            className="text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: '#d4af37' }}
          >
            Voices
          </span>
        </div>
        <h1
          className="text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.1] tracking-tight mb-5"
          style={{ fontFamily: 'var(--serif)' }}
        >
          The words our members
          <span className="block italic mt-1" style={{ color: '#d4af37' }}>
            chose for themselves.
          </span>
        </h1>
        <p
          className="text-base sm:text-lg leading-relaxed max-w-2xl mx-auto"
          style={{ color: 'rgba(255,255,255,0.72)' }}
        >
          These are real quotes from CarryOn members who opted to share publicly
          why they prepared. Not marketing copy. Not a testimonial request. Just
          their answer to a single question: <em>what does CarryOn mean to you?</em>
        </p>
      </div>

      {/* Grid */}
      <div className="max-w-6xl mx-auto px-6 pb-20">
        {loading ? (
          <div
            className="text-center py-16"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            Loading voices…
          </div>
        ) : items.length === 0 ? (
          <div
            className="max-w-xl mx-auto text-center rounded-2xl p-10"
            style={{
              background: 'var(--s)',
              border: '1px dashed rgba(212,175,55,0.3)',
            }}
          >
            <Quote
              className="w-10 h-10 mx-auto mb-3"
              style={{ color: 'rgba(212,175,55,0.6)' }}
            />
            <p
              className="text-lg italic mb-1"
              style={{ fontFamily: 'var(--serif)', color: '#fff' }}
            >
              The first voice will land here soon.
            </p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Members get the option to share publicly as they personalize their
              CarryOn share card.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {items.map((it, idx) => {
              const isFC = it.variant === 'fc';
              return (
                <figure
                  key={it.id}
                  className="rounded-2xl p-6 flex flex-col"
                  style={{
                    background:
                      'linear-gradient(160deg, rgba(26,45,77,0.55), rgba(14,30,50,0.7))',
                    border: `1px solid ${isFC ? 'rgba(212,175,55,0.35)' : 'rgba(52,211,153,0.28)'}`,
                    boxShadow: '0 10px 40px rgba(0,0,0,0.28)',
                    animation: `voiceFadeUp 520ms ease-out both`,
                    animationDelay: `${Math.min(idx * 60, 480)}ms`,
                  }}
                  data-testid={`public-voice-${it.id}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full"
                      style={{
                        background: isFC
                          ? 'rgba(212,175,55,0.14)'
                          : 'rgba(52,211,153,0.14)',
                        border: `1px solid ${isFC ? 'rgba(212,175,55,0.28)' : 'rgba(52,211,153,0.28)'}`,
                      }}
                    >
                      {isFC ? (
                        <Crown className="w-3 h-3" style={{ color: '#d4af37' }} />
                      ) : (
                        <Sparkles className="w-3 h-3" style={{ color: '#34d399' }} />
                      )}
                      <span
                        className="text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: isFC ? '#d4af37' : '#34d399' }}
                      >
                        {isFC ? 'Founding Member' : 'Member'}
                      </span>
                    </div>
                    <span
                      className="text-[11px]"
                      style={{ color: 'rgba(255,255,255,0.42)' }}
                    >
                      {formatDate(it.created_at)}
                    </span>
                  </div>
                  <blockquote
                    className="text-lg leading-snug italic mb-4 flex-1"
                    style={{ fontFamily: 'var(--serif)', color: '#fff' }}
                  >
                    &ldquo;{it.quote}&rdquo;
                  </blockquote>
                  <figcaption
                    className="text-sm font-semibold"
                    style={{ color: isFC ? '#d4af37' : '#34d399' }}
                  >
                    — {it.first_name}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </div>

      {/* Closing CTA */}
      <div
        className="max-w-3xl mx-auto px-6 pb-20 text-center"
      >
        <p
          className="text-xl sm:text-2xl italic mb-5"
          style={{ fontFamily: 'var(--serif)', color: 'rgba(255,255,255,0.8)' }}
        >
          Your family deserves a plan, not a panic.
        </p>
        <Link
          to="/signup"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold"
          style={{
            background: 'linear-gradient(135deg, #d4af37, #b8962e)',
            color: '#080e1a',
            boxShadow: '0 10px 30px rgba(212,175,55,0.28)',
          }}
          data-testid="voices-footer-cta"
        >
          Start your CarryOn
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <style>{`
        @keyframes voiceFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
