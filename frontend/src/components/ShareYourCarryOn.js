import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { Share2 } from 'lucide-react';
import { API_URL } from '../config';
import { useAuth } from '../contexts/AuthContext';
import SocialShareSheet from './SocialShareSheet';

/**
 * ShareYourCarryOn — a self-contained, reusable "Share your CarryOn" button.
 *
 * Drop it anywhere in the authenticated app to give users a permanent entry
 * point to the share sheet (no longer limited to the one-shot purchase
 * celebration).
 *
 * Automatically selects the Founders Circle card if the user is a FC
 * member, otherwise the regular subscriber card.
 *
 * Props:
 *   variant        : "button" | "tile" | "inline"      visual style
 *   className      : string                            extra classes for positioning
 *   label          : string                            override the button label
 *   forceSubscriber: boolean                           force the subscriber variant
 *   forceFounders  : boolean                           force the FC variant
 *                    (defaults: auto-detect via subscriptionStatus)
 */
export default function ShareYourCarryOn({
  variant = 'button',
  className = '',
  label,
  forceSubscriber = false,
  forceFounders = false,
}) {
  const { token, user, subscriptionStatus } = useAuth();
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState(null);
  const [quote, setQuote] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const isFounders = forceFounders || (
    !forceSubscriber && (
      subscriptionStatus?.is_founders_circle ||
      subscriptionStatus?.founders_circle ||
      subscriptionStatus?.plan_name?.toLowerCase?.().includes('founders')
    )
  );
  const endpoint = isFounders ? 'founders-circle' : 'subscriber';
  const accent = isFounders ? 'gold' : 'teal';
  const sheetTitle = isFounders ? 'Share your Founding Member moment' : 'Tell your people';
  const firstName = (user?.first_name || (user?.name ? user.name.split(' ')[0] : '')) || '';
  const tierName = subscriptionStatus?.tier_name || subscriptionStatus?.plan_name || '';

  const fetchCard = useCallback(
    async (quoteValue, consentPublic = false, nonce = '') => {
      // Use token from context OR fall back to localStorage (handles async context load)
      const authToken = token || localStorage.getItem('carryon_token');
      if (!authToken) return;
      setRegenerating(true);
      setFetchError(false);
      try {
        const res = await axios.post(
          `${API_URL}/share-cards/${endpoint}`,
          {
            first_name: firstName || (isFounders ? 'Founding Member' : 'A CarryOn Member'),
            tier_name: tierName,
            quote: quoteValue || '',
            consent_public: !!consentPublic,
            nonce,
          },
          { headers: { Authorization: `Bearer ${authToken}` } },
        );
        if (res.data) {
          setCard(res.data);
          // Always surface the chosen quote in the text field so users can see
          // what was selected and optionally edit it
          setQuote(res.data.quote || '');
        }
      } catch (err) {
        console.error('[ShareYourCarryOn] card fetch failed:', err?.response?.status, err?.message);
        setFetchError(true);
      } finally {
        setRegenerating(false);
      }
    },
    [token, endpoint, firstName, tierName, isFounders],
  );

  // Pre-fetch once the sheet opens so the preview is instant
  useEffect(() => {
    if (open && !card) fetchCard('');
  }, [open, card, fetchCard]);

  // Auto-open when the user arrives via the "Your voice is now public" email
  // (links land on /dashboard?share=voice). One-tap share from the inbox.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('share') === 'voice') {
        setOpen(true);
        params.delete('share');
        const q = params.toString();
        const cleanUrl = window.location.pathname + (q ? `?${q}` : '') + window.location.hash;
        window.history.replaceState({}, '', cleanUrl);
      }
    } catch {
      /* no-op */
    }
  }, []);

  const displayLabel = label || (isFounders ? 'Share the news' : 'Share your CarryOn');

  if (variant === 'tile') {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className={`w-full text-left rounded-2xl p-4 transition-transform active:scale-[0.99] ${className}`}
          style={{
            background: isFounders
              ? 'linear-gradient(135deg, rgba(212,175,55,0.14), rgba(212,175,55,0.04))'
              : 'linear-gradient(135deg, rgba(52,211,153,0.12), rgba(52,211,153,0.04))',
            border: `1px solid ${isFounders ? 'rgba(212,175,55,0.32)' : 'rgba(52,211,153,0.32)'}`,
          }}
          data-testid="share-your-carryon-tile"
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'rgba(255,255,255,0.06)',
                color: isFounders ? '#d4af37' : '#34d399',
              }}
            >
              <Share2 className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm" style={{ color: 'var(--t)' }}>
                {isFounders ? 'Share your Founding Member moment' : 'Share your CarryOn'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
                Post a personalized card to your people. Your words, or one of ours.
              </p>
            </div>
          </div>
        </button>
        <SocialShareSheet
          open={open}
          onClose={() => { setOpen(false); setFetchError(false); }}
          imageUrl={card?.image_url ? `${API_URL}${card.image_url}` : ''}
          shareText={card?.share_text || ''}
          shareUrl="https://carryon.us"
          title={sheetTitle}
          accent={accent}
          editableQuote
          quote={quote}
          quoteSource={card?.quote_source || 'random'}
          onQuoteChange={(q, c) => fetchCard(q, c)}
          onRandomize={() => fetchCard('', false, String(Date.now()))}
          regenerating={regenerating}
          fetchError={fetchError}
        />
      </>
    );
  }

  // Default: plain button
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-transform active:scale-[0.97] ${className}`}
        style={{
          background: isFounders
            ? 'linear-gradient(135deg, #d4af37, #b8962e)'
            : 'linear-gradient(135deg, #14b8a6, #0d9488)',
          color: isFounders ? '#080e1a' : '#051518',
          boxShadow: isFounders
            ? '0 6px 20px rgba(212,175,55,0.28)'
            : '0 6px 20px rgba(20,184,166,0.28)',
        }}
        data-testid="share-your-carryon-btn"
      >
        <Share2 className="w-4 h-4" />
        {displayLabel}
      </button>
      <SocialShareSheet
        open={open}
        onClose={() => { setOpen(false); setFetchError(false); }}
        imageUrl={card?.image_url ? `${API_URL}${card.image_url}` : ''}
        shareText={card?.share_text || ''}
        shareUrl="https://carryon.us"
        title={sheetTitle}
        accent={accent}
        editableQuote
        quote={quote}
        quoteSource={card?.quote_source || 'random'}
        onQuoteChange={(q, c) => fetchCard(q, c)}
        onRandomize={() => fetchCard('', false, String(Date.now()))}
        regenerating={regenerating}
        fetchError={fetchError}
      />
    </>
  );
}
