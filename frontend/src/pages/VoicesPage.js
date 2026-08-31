import React, { useEffect, useState } from 'react';
import SEO from '../components/SEO';
import PublicFooter from '../components/PublicFooter';
import apiClient from '../utils/apiClient';
import { Link } from 'react-router-dom';
import { Crown, Sparkles, Quote, ArrowRight } from 'lucide-react';
import { API_URL } from '../config';
import { getOfflineMode } from '../offline/featureFlag';
import { getLocalVoices, upsertLocalVoices } from '../offline/repos/voicesRepo';

/**
 * Public "Voices" page — feeds from GET /api/share-cards/voices/public,
 * which returns every quote the founder has approved (consent_public=true,
 * approval_status="approved"). Featured quotes float to the top.
 *
 * Layout, header, and footer match LandingPage.js so /voices reads as a
 * native section of www.carryon.us — same nav links, same gold CTA, same
 * fonts. Minimum body font-size on this page is 22px (per 40+ audience
 * accessibility request).
 */
export default function VoicesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll to top on mount so navigating from the footer doesn't land mid-page.
  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mode = getOfflineMode();
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
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
        const res = await apiClient.get(`${API_URL}/share-cards/voices/public`);
        const list = res.data?.items || [];
        if (!cancelled) setItems(list);
        upsertLocalVoices(list).catch(() => {});
      } catch {
        /* graceful — show empty state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ background: 'var(--bg)', color: 'var(--t)' }}
      data-testid="public-voices-page"
    >
      <SEO title="Voices — CarryOn" description="Real families on what readiness feels like — stories from the people CarryOn was built for." path="/voices" />
      {/* Top nav — mirrors LandingPage.js */}
      <header
        className="fixed top-0 inset-x-0 z-40 transition-all duration-200"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: scrolled ? 'rgba(11,18,32,0.85)' : 'transparent',
          backdropFilter: scrolled ? 'blur(16px) saturate(140%)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        }}
        data-testid="voices-header"
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" data-testid="voices-logo">
            <img src="/carryon-logo.png" alt="CarryOn" className="w-7 h-7 rounded-md" />
            <span className="text-white font-semibold tracking-tight" style={{ fontFamily: 'var(--sans)' }}>CarryOn</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-[22px]" style={{ color: 'var(--t3)' }}>
            <a href="/#features" className="hover:text-white transition-colors">Features</a>
            <a href="/#pricing" className="hover:text-white transition-colors">Pricing</a>
            <Link to="/voices" className="hover:text-white transition-colors" style={{ color: 'var(--gold)' }}>Voices</Link>
            <a href="/#faq" className="hover:text-white transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden sm:inline-flex items-center px-4 py-2 text-[22px] rounded-lg transition-colors hover:bg-[var(--s)]"
              style={{ color: 'var(--t3)' }}
              data-testid="voices-signin-link"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-[22px] font-semibold rounded-lg btn-gold-cta"
              data-testid="voices-cta-header"
            >
              Start your family&apos;s plan <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-12 sm:pt-40 sm:pb-16 px-5 sm:px-8" data-testid="voices-hero">
        <div className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(ellipse 1100px 700px at 50% 0%, rgba(var(--gold-rgb), 0.10), transparent 60%)' }} />
        <div className="max-w-4xl mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-7 text-[22px] font-semibold uppercase tracking-[0.18em]"
            style={{ background: 'rgba(var(--gold-rgb), 0.10)', border: '1px solid rgba(var(--gold-rgb), 0.32)', color: 'var(--gold)' }}
          >
            <Quote className="w-4 h-4" /> Voices
          </div>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight mb-6 text-white"
            style={{ fontFamily: 'var(--serif)' }}
          >
            The words our members{' '}
            <span className="italic" style={{ color: 'var(--gold)' }}>chose for themselves</span>.
          </h1>
          <p className="text-[22px] sm:text-2xl leading-relaxed max-w-2xl mx-auto" style={{ color: 'var(--t4)' }}>
            Real quotes from CarryOn members who opted to share publicly why they prepared.
            Not marketing copy. Not a testimonial request. Just their answer to a single question:{' '}
            <em style={{ color: 'var(--t2)' }}>what does CarryOn mean to you?</em>
          </p>
        </div>
      </section>

      {/* Quote grid */}
      <section className="px-5 sm:px-8 pb-20" data-testid="voices-grid">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div
              className="text-center py-16 text-[22px]"
              style={{ color: 'var(--t5)' }}
              data-testid="voices-loading"
            >
              Loading voices…
            </div>
          ) : items.length === 0 ? (
            <div
              className="max-w-xl mx-auto text-center rounded-2xl p-10"
              style={{ background: 'var(--card)', border: '1px dashed rgba(var(--gold-rgb), 0.3)' }}
              data-testid="voices-empty"
            >
              <Quote className="w-12 h-12 mx-auto mb-4" style={{ color: 'rgba(var(--gold-rgb), 0.6)' }} />
              <p className="text-2xl italic mb-2" style={{ fontFamily: 'var(--serif)', color: 'var(--t)' }}>
                The first voice will land here soon.
              </p>
              <p className="text-[22px]" style={{ color: 'var(--t5)' }}>
                Members get the option to share publicly as they personalize their CarryOn share card.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {items.map((it, idx) => {
                const isFC = it.variant === 'fc';
                return (
                  <figure
                    key={it.id}
                    className="rounded-2xl p-7 flex flex-col"
                    style={{
                      background: 'var(--card)',
                      border: `1px solid ${isFC ? 'rgba(var(--gold-rgb), 0.35)' : 'rgba(52,211,153,0.28)'}`,
                      boxShadow: '0 10px 40px rgba(0,0,0,0.28)',
                      animation: 'voiceFadeUp 520ms ease-out both',
                      animationDelay: `${Math.min(idx * 60, 480)}ms`,
                    }}
                    data-testid={`public-voice-${it.id}`}
                  >
                    <div className="flex items-center justify-between mb-4 gap-3">
                      <div
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[22px] font-semibold uppercase tracking-wider"
                        style={{
                          background: isFC ? 'rgba(var(--gold-rgb), 0.14)' : 'rgba(52,211,153,0.14)',
                          border: `1px solid ${isFC ? 'rgba(var(--gold-rgb), 0.28)' : 'rgba(52,211,153,0.28)'}`,
                          color: isFC ? 'var(--gold)' : '#34d399',
                        }}
                      >
                        {isFC ? <Crown className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                        {isFC ? 'Founding Member' : 'Member'}
                      </div>
                      <span className="text-[22px] flex-shrink-0" style={{ color: 'var(--t5)' }}>
                        {formatDate(it.created_at)}
                      </span>
                    </div>
                    <blockquote
                      className="text-2xl sm:text-[26px] leading-snug italic mb-5 flex-1"
                      style={{ fontFamily: 'var(--serif)', color: 'var(--t)' }}
                    >
                      &ldquo;{it.quote}&rdquo;
                    </blockquote>
                    <figcaption
                      className="text-[22px] font-semibold"
                      style={{ color: isFC ? 'var(--gold)' : '#34d399' }}
                    >
                      &mdash; {it.first_name}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="py-20 px-5 sm:px-8" data-testid="voices-final-cta">
        <div className="max-w-3xl mx-auto text-center">
          <p
            className="text-3xl sm:text-4xl italic mb-6"
            style={{ fontFamily: 'var(--serif)', color: 'var(--gold)' }}
          >
            Your family deserves a plan, not a panic.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 text-[22px] font-semibold rounded-xl btn-gold-cta"
            data-testid="voices-footer-cta"
          >
            Start your family&apos;s plan <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer — shared public footer */}
      <PublicFooter />

      <style>{`
        @keyframes voiceFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
