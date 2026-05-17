/**
 * SharePage — full-screen "Tell your people" experience.
 * Uses CSS variables throughout so light & dark mode both work automatically.
 * Scales from iPhone 13 Mini (375px) to iPhone 17 Pro Max (440px+).
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import apiClient from '../utils/apiClient';
import {
  ArrowLeft, Share2, Copy, Download, Check, Loader2, Shuffle,
  Twitter, Linkedin, Facebook, Mail, MessageSquare, Send,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL, BASE_URL } from '../config';

// ── Brand icon components (no external dep) ──────────────────────────────────
const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);
const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);
const RedditIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
  </svg>
);

export default function SharePage() {
  const navigate = useNavigate();
  const { user, subscriptionStatus } = useAuth();
  const token = localStorage.getItem('carryon_token');

  const [card, setCard] = useState(null);
  const [quote, setQuote] = useState('');
  const [draftQuote, setDraftQuote] = useState('');
  const [consentPublic, setConsentPublic] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);

  const isFounders = (
    subscriptionStatus?.is_founders_circle ||
    subscriptionStatus?.founders_circle ||
    subscriptionStatus?.plan_name?.toLowerCase?.().includes('founders')
  ) || false;

  const endpoint = isFounders ? 'founders-circle' : 'subscriber';
  const accentColor = isFounders ? 'var(--gold)' : '#34d399';
  const firstName = user?.first_name || (user?.name ? user.name.split(' ')[0] : '') || '';
  const tierName = subscriptionStatus?.tier_name || subscriptionStatus?.plan_name || '';

  // Keep draft in sync with quote prop
  useEffect(() => { setDraftQuote(quote || ''); }, [quote]);

  const fetchCard = useCallback(async (quoteValue = '', consentVal = false, nonce = '') => {
    if (!token) return;
    setRegenerating(true);
    setFetchError(false);
    try {
      const res = await apiClient.post(
        `${API_URL}/share-cards/${endpoint}`,
        {
          first_name: firstName || (isFounders ? 'Founding Member' : 'A CarryOn Member'),
          tier_name: tierName,
          quote: quoteValue || '',
          consent_public: !!consentVal,
          nonce,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.data) {
        setCard(res.data);
        setQuote(res.data.quote || '');
      }
    } catch (err) {
      console.error('[SharePage] card fetch failed:', err?.response?.status, err?.message);
      setFetchError(true);
    } finally {
      setRegenerating(false);
    }
  }, [token, endpoint, firstName, tierName, isFounders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial fetch
  useEffect(() => { fetchCard(); }, [fetchCard]);

  const shareText = card?.share_text || `"${quote}"\n\nhttps://carryon.us`;
  const imageUrl = card?.image_url ? `${BASE_URL}${card.image_url}` : '';

  const buildHref = (platform) => {
    const enc = encodeURIComponent;
    const url = 'https://carryon.us';
    switch (platform) {
      case 'twitter':   return `https://twitter.com/intent/tweet?text=${enc(shareText)}`;
      case 'facebook':  return `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(quote)}`;
      case 'linkedin':  return `https://www.linkedin.com/shareArticle?mini=true&url=${enc(url)}&title=${enc('CarryOn')}&summary=${enc(quote)}`;
      case 'whatsapp':  return `https://api.whatsapp.com/send?text=${enc(shareText)}`;
      case 'telegram':  return `https://t.me/share/url?url=${enc(url)}&text=${enc(shareText)}`;
      case 'reddit':    return `https://reddit.com/submit?url=${enc(url)}&title=${enc(quote)}`;
      case 'imessage':  return `sms:&body=${enc(shareText)}`;
      case 'email':     return `mailto:?subject=${enc('Check out CarryOn')}&body=${enc(shareText)}`;
      default: return '#';
    }
  };

  const copyText = async () => {
    try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {}
  };

  const nativeShare = async () => {
    try { await navigator.share({ title: 'CarryOn', text: shareText, url: 'https://carryon.us' }); } catch {}
  };

  const platforms = [
    { key: 'twitter',  label: 'X / Twitter', Icon: Twitter,      color: '#000' },
    { key: 'facebook', label: 'Facebook',     Icon: Facebook,     color: '#1877F2' },
    { key: 'linkedin', label: 'LinkedIn',     Icon: Linkedin,     color: '#0A66C2' },
    { key: 'whatsapp', label: 'WhatsApp',     Icon: WhatsAppIcon, color: '#25D366' },
    { key: 'telegram', label: 'Telegram',     Icon: TelegramIcon, color: '#26A5E4' },
    { key: 'reddit',   label: 'Reddit',       Icon: RedditIcon,   color: '#FF4500' },
    { key: 'imessage', label: 'iMessage / SMS', Icon: MessageSquare, color: '#34C759' },
    { key: 'email',    label: 'Email',        Icon: Mail,         color: 'var(--t4)' },
  ];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--bg)', color: 'var(--t)' }}
      data-testid="share-page"
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0 sticky top-0 z-10"
        style={{
          background: 'var(--bg)',
          borderBottom: '1px solid var(--b)',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)' }}
          aria-label="Back"
          data-testid="share-page-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--t)', fontFamily: 'var(--serif)' }}>
          Tell your people
        </h1>
      </div>

      {/* ── Scrollable content ─────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)' }}
      >
        <div className="px-4 pt-5 pb-2 max-w-xl mx-auto w-full">

          {/* Quote section */}
          <div className="mb-5">
            <label
              htmlFor="share-quote"
              className="block text-[11px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--t4)' }}
            >
              Your quote{' '}
              <span className="normal-case font-normal tracking-normal" style={{ color: accentColor }}>
                (optional)
              </span>
            </label>

            {/* Full-width multi-line quote textarea */}
            <textarea
              id="share-quote"
              value={draftQuote}
              maxLength={110}
              rows={3}
              placeholder="What does CarryOn mean to you?"
              onChange={(e) => setDraftQuote(e.target.value)}
              onBlur={() => {
                if (draftQuote.trim() !== quote.trim()) fetchCard(draftQuote, consentPublic);
              }}
              className="w-full rounded-2xl px-4 py-3 text-base resize-none"
              style={{
                background: 'var(--s)',
                border: `1.5px solid ${draftQuote.trim() ? accentColor + '80' : 'var(--b)'}`,
                color: 'var(--t)',
                outline: 'none',
                fontSize: '16px',
                lineHeight: '1.55',
                minHeight: '96px',
                transition: 'border-color 200ms ease',
              }}
              data-testid="share-page-quote-input"
            />

            {/* Full-width Surprise Me */}
            <button
              onClick={() => { setDraftQuote(''); fetchCard('', false, String(Date.now())); }}
              disabled={regenerating}
              className="w-full mt-2.5 py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity"
              style={{
                background: 'var(--s)',
                border: `1.5px solid ${accentColor}40`,
                color: 'var(--t)',
                opacity: regenerating ? 0.6 : 1,
              }}
              data-testid="share-page-surprise-btn"
            >
              {regenerating
                ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: accentColor }} />
                : <Shuffle className="w-4 h-4" style={{ color: accentColor }} />}
              <span>{regenerating ? 'Finding a quote…' : 'Surprise me — pick a quote for me'}</span>
            </button>

            {/* Char count / hint */}
            <p className="text-[11px] mt-2 px-1" style={{ color: 'var(--t4)' }}>
              {draftQuote.trim()
                ? `${draftQuote.length}/110 · your words on the card.`
                : 'Leave blank and we\'ll pick an inspiring quote for you.'}
            </p>

            {/* Consent */}
            <label
              className="flex items-start gap-2.5 mt-3 cursor-pointer select-none"
              style={{ opacity: draftQuote.trim() ? 1 : 0.45 }}
            >
              <input
                type="checkbox"
                checked={consentPublic}
                disabled={!draftQuote.trim()}
                onChange={(e) => {
                  const next = e.target.checked;
                  setConsentPublic(next);
                  if (draftQuote.trim() === quote.trim()) fetchCard(draftQuote, next);
                }}
                className="mt-0.5"
                style={{ accentColor: accentColor, flexShrink: 0 }}
                data-testid="share-page-consent"
              />
              <span className="text-xs leading-snug" style={{ color: 'var(--t3)' }}>
                Let CarryOn use this quote publicly — we&apos;ll credit your first name only.
              </span>
            </label>
          </div>

          {/* Divider */}
          <div className="mb-5" style={{ height: 1, background: 'var(--b)' }} />

          {/* Error state */}
          {fetchError && (
            <div className="rounded-2xl px-4 py-3 mb-4 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              Couldn&apos;t generate the share card — tap &quot;Surprise me&quot; to retry.
            </div>
          )}

          {/* Primary action buttons */}
          <div className="space-y-2.5 mb-5">
            {typeof navigator !== 'undefined' && navigator.share && (
              <button
                onClick={nativeShare}
                className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`, color: isFounders ? '#080e1a' : '#ffffff' }}
                data-testid="share-page-native"
              >
                <Share2 className="w-4 h-4" /> Share via…
              </button>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={async () => {
                  if (!imageUrl) return;
                  try {
                    const blob = await fetch(imageUrl).then(r => r.blob());
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    setImageCopied(true); setTimeout(() => setImageCopied(false), 2500);
                  } catch {}
                }}
                className="py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)' }}
                data-testid="share-page-copy-image"
              >
                {imageCopied ? <Check className="w-4 h-4" style={{ color: '#10b981' }} /> : <Copy className="w-4 h-4" />}
                {imageCopied ? 'Copied' : 'Copy image'}
              </button>
              <a
                href={imageUrl || '#'}
                download="carryon-share.png"
                className="py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', textDecoration: 'none' }}
                data-testid="share-page-download"
              >
                <Download className="w-4 h-4" /> Download
              </a>
            </div>
          </div>

          {/* Platform grid */}
          <p className="text-[11px] uppercase tracking-wider font-semibold mb-3 px-1" style={{ color: 'var(--t4)' }}>
            Or post directly to
          </p>
          <div className="grid grid-cols-4 gap-2.5 mb-4">
            {platforms.map(({ key, label, Icon, color }) => (
              <a
                key={key}
                href={buildHref(key)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-2xl transition-transform active:scale-95"
                style={{ background: 'var(--s)', border: '1px solid var(--b)', textDecoration: 'none' }}
                data-testid={`share-page-${key}`}
              >
                <Icon style={{ color }} />
                <span className="text-[11px] font-medium text-center leading-tight" style={{ color: 'var(--t3)' }}>
                  {label}
                </span>
              </a>
            ))}
          </div>

          {/* Copy caption */}
          <button
            onClick={copyText}
            className="w-full py-3 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 mb-4"
            style={{ background: 'var(--s)', border: '1px dashed var(--b)', color: 'var(--t4)' }}
            data-testid="share-page-copy-text"
          >
            {copied
              ? <><Check className="w-3.5 h-3.5" style={{ color: '#10b981' }} /> Caption copied</>
              : <><Copy className="w-3.5 h-3.5" /> Copy caption text</>}
          </button>

          <p className="text-[11px] text-center px-2" style={{ color: 'var(--t5)' }}>
            For Instagram &amp; iMessage, download the image first and attach it manually.
          </p>
        </div>
      </div>
    </div>
  );
}
