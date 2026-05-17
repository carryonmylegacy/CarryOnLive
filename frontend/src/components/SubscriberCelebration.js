import React, { useEffect, useState } from 'react';
import axios from 'axios';
import apiClient from '../utils/apiClient';
import { CheckCircle2, Share2, X, FileLock2, MessageSquare, ClipboardCheck } from 'lucide-react';
import { API_URL, BASE_URL } from '../config';
import { useAuth } from '../contexts/AuthContext';
import SocialShareSheet from './SocialShareSheet';

/**
 * Subscriber Celebration — a calmer, less opulent celebration shown to
 * regular (non-Founders-Circle) subscribers right after Stripe success.
 *
 * Visual grammar is deliberately subdued vs. FoundersCircleCelebration:
 *  - Emerald accent (readiness) instead of gold (legacy/royalty)
 *  - Sans-serif headline (Inter) instead of serif
 *  - One short serif italic accent line to keep the brand voice
 *  - Same share sheet under the hood
 *
 * Props:
 *   firstName : string
 *   tierName  : string ("Premium", "Standard", "Base", ...)
 *   onDismiss : () => void
 */
export default function SubscriberCelebration({ firstName, tierName, onDismiss }) {
  const { token } = useAuth();
  const [showShare, setShowShare] = useState(false);
  const [card, setCard] = useState(null);
  const [quote, setQuote] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const displayName = (firstName || '').trim() || 'A CarryOn Member';

  const fetchCard = React.useCallback(
    async (quoteValue, consentPublic = false, nonce = '') => {
      if (!token) return;
      setRegenerating(true);
      try {
        const res = await apiClient.post(
          `${API_URL}/share-cards/subscriber`,
          { first_name: displayName, tier_name: tierName || '', quote: quoteValue || '', consent_public: !!consentPublic, nonce },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.data) {
          setCard(res.data);
          setQuote(res.data.quote || '');
        }
      } catch {
        /* graceful: share sheet just won't show an image */
      } finally {
        setRegenerating(false);
      }
    },
    [token, displayName, tierName],
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onDismiss?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  useEffect(() => {
    fetchCard('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, displayName, tierName]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(20,184,166,0.14) 0%, rgba(11,18,33,0.96) 55%, rgba(11,18,33,0.99) 100%)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        animation: 'fadeIn 360ms ease-out',
      }}
      data-testid="sub-celebration"
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={onDismiss}
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center"
        style={{
          background: 'var(--s)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.7)',
        }}
        data-testid="sub-celebration-close"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      <div
        className="relative w-full max-w-xl mx-4 rounded-3xl px-6 py-10 sm:px-10 sm:py-12 text-center"
        style={{
          background: 'linear-gradient(160deg, rgba(20,41,60,0.95) 0%, rgba(14,30,50,0.95) 100%)',
          border: '1.5px solid rgba(52,211,153,0.4)',
          boxShadow:
            '0 24px 80px rgba(0,0,0,0.5), 0 0 60px rgba(20,184,166,0.10), inset 0 1px 0 rgba(52,211,153,0.14)',
          animation: 'subBubbleIn 640ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        }}
      >
        {/* Check seal — calmer than the FC pulsing crown */}
        <div
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{
            background:
              'radial-gradient(circle, rgba(52,211,153,0.22) 0%, rgba(52,211,153,0.06) 70%)',
            border: '2px solid rgba(52,211,153,0.45)',
          }}
        >
          <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10" style={{ color: '#34d399' }} />
        </div>

        {/* Sans headline */}
        <p
          className="text-[11px] font-bold uppercase tracking-[0.18em] mb-3"
          style={{ color: '#34d399' }}
        >
          You&apos;re ready
        </p>
        <h1
          className="text-2xl sm:text-3xl font-semibold leading-tight mb-2"
          style={{ color: '#ffffff' }}
          data-testid="sub-celebration-title"
        >
          Your family is now prepared with CarryOn
          {displayName && displayName !== 'A CarryOn Member' ? `, ${displayName}` : ''}.
        </h1>

        {/* Serif italic accent — carries the brand voice */}
        <p
          className="text-lg italic mb-5"
          style={{ fontFamily: 'var(--serif)', color: '#d4af37' }}
        >
          Thank you for choosing to carry them forward.
        </p>

        <p
          className="text-sm sm:text-base leading-relaxed max-w-md mx-auto mb-6"
          style={{ color: 'rgba(255,255,255,0.72)' }}
        >
          {tierName ? (
            <>
              Your <strong style={{ color: '#ffffff' }}>{tierName}</strong> subscription is active.
              Documents, messages, checklists, and contingency plans are ready when your family needs them.
            </>
          ) : (
            <>
              Your subscription is active. Documents, messages, checklists, and
              contingency plans are ready when your family needs them.
            </>
          )}
        </p>

        {/* Perk bullets */}
        <div className="flex flex-col gap-2 max-w-sm mx-auto mb-7 text-left">
          {[
            { icon: FileLock2, text: 'Secure Document Vault — AES-256 encrypted.' },
            { icon: MessageSquare, text: 'Milestone Messages waiting for the right moment.' },
            { icon: ClipboardCheck, text: 'Immediate Action Checklist for the hardest days.' },
          ].map((p, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-4 py-2.5 rounded-xl"
              style={{
                background: 'var(--s)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <p.icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#34d399' }} />
              <span className="text-sm" style={{ color: 'rgba(255,255,255,0.88)' }}>
                {p.text}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
          <button
            onClick={() => setShowShare(true)}
            className="flex-1 py-3 px-5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-transform active:scale-[0.97]"
            style={{
              background: 'var(--s)',
              border: '1px solid rgba(52,211,153,0.35)',
              color: '#ffffff',
            }}
            data-testid="sub-celebration-share"
          >
            <Share2 className="w-4 h-4" />
            <span>Tell your people</span>
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 py-3 px-5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
              color: '#051518',
              boxShadow: '0 8px 28px rgba(20,184,166,0.35)',
            }}
            data-testid="sub-celebration-continue"
          >
            Start using CarryOn
          </button>
        </div>

        <p
          className="mt-6 text-[11px]"
          style={{ color: 'rgba(255,255,255,0.42)' }}
        >
          One post can reach a family who needs this too.
        </p>
      </div>

      <style>{`
        @keyframes subBubbleIn {
          0% { opacity: 0; transform: scale(0.94) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      <SocialShareSheet
        open={showShare}
        onClose={() => { setShowShare(false); setCard(null); setQuote(''); }}
        imageUrl={card?.image_url ? `${BASE_URL}${card.image_url}` : ''}
        shareText={card?.share_text || `I just signed up for CarryOn — the family preparedness platform that organizes everything my loved ones would ever need. https://carryon.us`}
        shareUrl="https://carryon.us"
        title="Tell your people"
        accent="teal"
        editableQuote
        quote={quote}
        quoteSource={card?.quote_source || 'random'}
        onQuoteChange={(q, consent) => fetchCard(q, consent)}
        onRandomize={() => fetchCard('', false, String(Date.now()))}
        regenerating={regenerating}
      />
    </div>
  );
}
