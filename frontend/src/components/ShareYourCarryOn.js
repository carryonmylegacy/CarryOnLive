/**
 * ShareYourCarryOn — opens the SocialShareSheet floating tile.
 * Renders as a button, tile, or inline link depending on `variant` prop.
 *
 * The sheet appears as a centered floating card with rounded corners,
 * multi-layer elevation shadow, and a draggable scroll indicator.
 */
import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { Share2 } from 'lucide-react';
import { API_URL, BASE_URL } from '../config';
import { useAuth } from '../contexts/AuthContext';
import SocialShareSheet from './SocialShareSheet';

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
          setQuote(res.data.quote || '');
        }
      } catch (err) {
        console.error('[ShareYourCarryOn] card fetch failed:', err?.response?.status, err?.message);
        setFetchError(true);
      } finally {
        setRegenerating(false);
      }
    },
    [token, endpoint, firstName, tierName, isFounders], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Pre-fetch once the sheet opens
  useEffect(() => {
    if (open && !card) fetchCard('');
  }, [open, card, fetchCard]);

  const handleClose = () => {
    setOpen(false);
    setCard(null);
    setQuote('');
    setFetchError(false);
  };

  const displayLabel = label || 'Tell your people';

  // ── Pill variant — wide gold button for dashboard bottom ─────────────────
  if (variant === 'pill') {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className={`w-full flex items-center justify-center gap-3 py-4 rounded-full font-bold text-base transition-transform active:scale-[0.98] ${className}`}
          style={{
            background: 'linear-gradient(135deg, #d4af37 0%, #f0c94c 50%, #d4af37 100%)',
            color: '#080e1a',
            boxShadow: '0 4px 20px rgba(212,175,55,0.35), 0 2px 8px rgba(0,0,0,0.2)',
            letterSpacing: '0.01em',
          }}
          data-testid="share-pill-btn"
        >
          <Share2 className="w-5 h-5" />
          Tell your people
        </button>
        <SocialShareSheet
          open={open}
          onClose={handleClose}
          imageUrl={card?.image_url ? `${BASE_URL}${card.image_url}` : ''}
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

  // ── Tile variant ─────────────────────────────────────────────────────────
  if (variant === 'tile') {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className={`w-full rounded-2xl p-4 text-left transition-transform active:scale-[0.98] ${className}`}
          style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
          data-testid="share-tile-btn"
        >
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(212,175,55,0.12)' }}>
              <Share2 className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            </div>
            <span className="text-sm font-bold" style={{ color: 'var(--t)' }}>{displayLabel}</span>
          </div>
          <p className="text-xs pl-12" style={{ color: 'var(--t4)' }}>
            Share your CarryOn story with friends, family, and your network.
          </p>
        </button>
        <SocialShareSheet
          open={open}
          onClose={handleClose}
          imageUrl={card?.image_url ? `${BASE_URL}${card.image_url}` : ''}
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

  // ── Inline variant ────────────────────────────────────────────────────────
  if (variant === 'inline') {
    return (
      <>
        <button onClick={() => setOpen(true)} className={`underline text-sm ${className}`}
          style={{ color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer' }}
          data-testid="share-inline-btn">
          {displayLabel}
        </button>
        <SocialShareSheet
          open={open} onClose={handleClose}
          imageUrl={card?.image_url ? `${BASE_URL}${card.image_url}` : ''}
          shareText={card?.share_text || ''} shareUrl="https://carryon.us"
          title={sheetTitle} accent={accent} editableQuote quote={quote}
          quoteSource={card?.quote_source || 'random'}
          onQuoteChange={(q, c) => fetchCard(q, c)}
          onRandomize={() => fetchCard('', false, String(Date.now()))}
          regenerating={regenerating} fetchError={fetchError}
        />
      </>
    );
  }

  // ── Default button variant ────────────────────────────────────────────────
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-transform active:scale-[0.98] ${className}`}
        style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)' }}
        data-testid="share-btn"
      >
        <Share2 className="w-4 h-4" style={{ color: 'var(--gold)' }} />
        {displayLabel}
      </button>
      <SocialShareSheet
        open={open} onClose={handleClose}
        imageUrl={card?.image_url ? `${BASE_URL}${card.image_url}` : ''}
        shareText={card?.share_text || ''} shareUrl="https://carryon.us"
        title={sheetTitle} accent={accent} editableQuote quote={quote}
        quoteSource={card?.quote_source || 'random'}
        onQuoteChange={(q, c) => fetchCard(q, c)}
        onRandomize={() => fetchCard('', false, String(Date.now()))}
        regenerating={regenerating} fetchError={fetchError}
      />
    </>
  );
}
