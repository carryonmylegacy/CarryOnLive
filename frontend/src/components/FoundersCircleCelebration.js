import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Crown, Heart, Infinity as InfinityIcon, Share2, X, Sparkles } from 'lucide-react';
import { API_URL, BASE_URL } from '../config';
import { useAuth } from '../contexts/AuthContext';
import SocialShareSheet from './SocialShareSheet';

/**
 * Founders Circle Celebration — fullscreen confirmation after successful
 * FC purchase. Shown instead of a bare toast. The serif "Varsity" voice
 * carries the weight of a lifetime-membership moment.
 *
 * Props:
 *   firstName : string       — user's first name (falls back to "Founding Member")
 *   tierName  : string       — e.g. "Premium", "Standard"
 *   estateName: string       — e.g. "The Matthews Family"
 *   onDismiss : () => void   — called when user closes the celebration
 */
export default function FoundersCircleCelebration({ firstName, tierName, estateName, onDismiss }) {
  const { token } = useAuth();
  const [showShare, setShowShare] = useState(false);
  const [card, setCard] = useState(null); // { image_url, share_text, quote, quote_source }
  const [quote, setQuote] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const displayName = (firstName || '').trim() || 'Founding Member';

  const fetchCard = React.useCallback(
    async (quoteValue, consentPublic = false, nonce = '') => {
      if (!token) return;
      setRegenerating(true);
      try {
        const res = await axios.post(
          `${API_URL}/share-cards/founders-circle`,
          {
            first_name: displayName,
            tier_name: tierName || '',
            quote: quoteValue || '',
            consent_public: !!consentPublic,
            nonce,
          },
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

  // Lock body scroll while the celebration is up
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Dismiss on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onDismiss?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  // Pre-generate the share card so the share sheet opens instantly
  useEffect(() => {
    fetchCard('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, displayName, tierName]);

  const openShare = () => setShowShare(true);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(212,175,55,0.18) 0%, rgba(11,18,33,0.96) 55%, rgba(11,18,33,0.99) 100%)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        animation: 'fadeIn 400ms ease-out',
      }}
      data-testid="fc-celebration"
      role="dialog"
      aria-modal="true"
      aria-label="Founders Circle activation"
    >
      {/* Close button */}
      <button
        onClick={onDismiss}
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
        style={{
          background: 'var(--s)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.7)',
        }}
        data-testid="fc-celebration-close"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Sparkle decorations (CSS-only) */}
      <Sparkles
        className="absolute w-4 h-4"
        style={{ top: '18%', left: '16%', color: 'rgba(212,175,55,0.5)', animation: 'fcTwinkle 2.4s ease-in-out infinite' }}
      />
      <Sparkles
        className="absolute w-5 h-5"
        style={{ top: '24%', right: '18%', color: 'rgba(212,175,55,0.4)', animation: 'fcTwinkle 3.1s ease-in-out infinite 0.4s' }}
      />
      <Sparkles
        className="absolute w-3 h-3"
        style={{ bottom: '22%', left: '22%', color: 'rgba(212,175,55,0.35)', animation: 'fcTwinkle 2.8s ease-in-out infinite 0.8s' }}
      />
      <Sparkles
        className="absolute w-4 h-4"
        style={{ bottom: '28%', right: '14%', color: 'rgba(212,175,55,0.45)', animation: 'fcTwinkle 2.2s ease-in-out infinite 1.1s' }}
      />

      {/* Content card */}
      <div
        className="relative w-full max-w-xl mx-4 rounded-3xl px-6 py-10 sm:px-10 sm:py-14 text-center"
        style={{
          background: 'linear-gradient(160deg, rgba(26,45,77,0.95) 0%, rgba(20,34,64,0.95) 100%)',
          border: '1.5px solid rgba(212,175,55,0.4)',
          boxShadow:
            '0 24px 80px rgba(0,0,0,0.5), 0 0 80px rgba(212,175,55,0.12), inset 0 1px 0 rgba(212,175,55,0.14)',
          animation: 'fcBubbleIn 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        }}
      >
        {/* Crown seal */}
        <div
          className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{
            background:
              'radial-gradient(circle, rgba(212,175,55,0.25) 0%, rgba(212,175,55,0.08) 70%)',
            border: '2px solid rgba(212,175,55,0.45)',
            animation: 'fcPulseRing 2.8s ease-in-out infinite',
          }}
        >
          <Crown className="w-9 h-9 sm:w-11 sm:h-11" style={{ color: '#d4af37' }} />
        </div>

        {/* Tag */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-5"
          style={{
            background: 'rgba(212,175,55,0.14)',
            border: '1px solid rgba(212,175,55,0.32)',
          }}
        >
          <span
            className="text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: '#d4af37' }}
          >
            Founding Member
          </span>
        </div>

        {/* Serif hero */}
        <h1
          className="text-3xl sm:text-4xl font-semibold leading-tight tracking-tight mb-3"
          style={{ fontFamily: 'var(--serif)', color: '#ffffff' }}
          data-testid="fc-celebration-title"
        >
          Welcome to the Founders Circle,
          <span className="block italic mt-1" style={{ color: '#d4af37' }}>
            {displayName}.
          </span>
        </h1>

        {/* Subline */}
        <p
          className="text-sm sm:text-base leading-relaxed max-w-md mx-auto mb-6"
          style={{ color: 'rgba(255,255,255,0.72)' }}
        >
          {tierName ? (
            <>
              Your <strong style={{ color: '#d4af37' }}>{tierName}</strong> lifetime
              membership is active{estateName ? <> on <strong style={{ color: '#ffffff' }}>{estateName}</strong></> : null}.
              Every feature, forever. No renewals. No surprises.
            </>
          ) : (
            <>
              Your lifetime membership is active. Every feature, forever.
              No renewals. No surprises.
            </>
          )}
        </p>

        {/* Perk bullets */}
        <div className="flex flex-col gap-2.5 max-w-sm mx-auto mb-8 text-left">
          {[
            { icon: InfinityIcon, text: 'Lifetime access to every CarryOn feature.' },
            { icon: Heart, text: 'Your beneficiaries get free access — forever.' },
            { icon: Crown, text: 'Founding Member badge on your profile.' },
          ].map((p, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-4 py-2.5 rounded-xl"
              style={{
                background: 'var(--s)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <p.icon
                className="w-4 h-4 mt-0.5 flex-shrink-0"
                style={{ color: '#d4af37' }}
              />
              <span className="text-sm" style={{ color: 'rgba(255,255,255,0.88)' }}>
                {p.text}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
          <button
            onClick={openShare}
            className="flex-1 py-3 px-5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-transform active:scale-[0.97]"
            style={{
              background: 'var(--s)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: '#ffffff',
            }}
            data-testid="fc-celebration-share"
          >
            <Share2 className="w-4 h-4" />
            <span>Share the news</span>
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 py-3 px-5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, #d4af37, #b8962e)',
              color: 'var(--bg)',
              boxShadow: '0 8px 28px rgba(212,175,55,0.35)',
            }}
            data-testid="fc-celebration-continue"
          >
            Continue
          </button>
        </div>

        {/* Quiet sign-off in serif */}
        <p
          className="mt-7 italic text-sm"
          style={{ fontFamily: 'var(--serif)', color: 'rgba(255,255,255,0.55)' }}
        >
          Thank you for carrying us forward.
        </p>
      </div>

      {/* Inline keyframes — scoped to this overlay */}
      <style>{`
        @keyframes fcBubbleIn {
          0% { opacity: 0; transform: scale(0.92) translateY(12px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fcPulseRing {
          0%, 100% { box-shadow: 0 0 0 0 rgba(212,175,55,0.35); }
          50% { box-shadow: 0 0 0 14px rgba(212,175,55,0); }
        }
        @keyframes fcTwinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>

      <SocialShareSheet
        open={showShare}
        onClose={() => { setShowShare(false); setCard(null); setQuote(''); }}
        imageUrl={card?.image_url ? `${BASE_URL}${card.image_url}` : ''}
        shareText={card?.share_text || `I just joined the CarryOn Founders Circle — lifetime access to the family preparedness platform that protects the people I love. https://carryon.us`}
        shareUrl="https://carryon.us"
        title="Share your Founding Member moment"
        accent="gold"
        editableQuote
        quote={quote}
        quoteSource={card?.quote_source || 'random'}
        onQuoteChange={(q, consent) => fetchCard(q, consent)}
        onRandomize={() => fetchCard('')}
        regenerating={regenerating}
      />
    </div>
  );
}
