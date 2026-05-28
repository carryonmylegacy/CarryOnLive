import React, { useState } from 'react';
import { X, Download, Copy, Check, Share2, MessageCircle, Mail, Shuffle, Loader2 } from 'lucide-react';

/**
 * SocialShareSheet — dumb-simple, one-tap share links to every major
 * platform. Works on iPhone, Android, and desktop.
 *
 * Each platform button opens a prefilled URL (intent / share endpoint).
 * For platforms that don't support image attachment via URL
 * (Instagram, iMessage), the sheet exposes a clear "Download image"
 * action so the user can post it manually.
 *
 * Props:
 *   open       : boolean
 *   onClose    : () => void
 *   imageUrl   : string    (absolute https URL to the PNG)
 *   shareText  : string
 *   shareUrl   : string    (the page URL to promote — defaults to carryon.us)
 *   title      : string    ("Share your news", "Post the news", etc.)
 *   accent     : "gold" | "teal"   (theme accent)
 */

// Brand-colored SVG icons inlined — no external fetches, safe for PWA offline.
const Icon = {
  X: (p) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path fill="currentColor" d="M18.244 2H21l-6.52 7.454L22 22h-6.828l-4.792-6.27L4.8 22H2.043l6.983-7.98L2 2h6.914l4.33 5.725L18.244 2Zm-2.395 18.172h1.889L7.24 3.72H5.214l10.635 16.452Z"/>
    </svg>
  ),
  Facebook: (p) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path fill="currentColor" d="M22 12a10 10 0 1 0-11.562 9.876v-6.987H7.9V12h2.538V9.797c0-2.504 1.492-3.889 3.777-3.889 1.094 0 2.238.196 2.238.196v2.46h-1.26c-1.243 0-1.63.771-1.63 1.563V12h2.773l-.443 2.889h-2.33v6.987A10 10 0 0 0 22 12Z"/>
    </svg>
  ),
  LinkedIn: (p) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path fill="currentColor" d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2ZM8.339 18.338H5.667v-8.59h2.672v8.59ZM7.004 8.574a1.548 1.548 0 1 1 0-3.096 1.548 1.548 0 0 1 0 3.096Zm11.335 9.764H15.67v-4.177c0-.996-.02-2.278-1.39-2.278-1.389 0-1.601 1.084-1.601 2.205v4.25h-2.667v-8.59h2.56v1.174h.037c.355-.675 1.227-1.387 2.526-1.387 2.703 0 3.203 1.778 3.203 4.092v4.711Z"/>
    </svg>
  ),
  WhatsApp: (p) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.172-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.885 3.488"/>
    </svg>
  ),
  Reddit: (p) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path fill="currentColor" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0Zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701ZM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249Zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249Zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095Z"/>
    </svg>
  ),
  Telegram: (p) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path fill="currentColor" d="m9.417 15.181-.397 5.584c.568 0 .814-.244 1.109-.537l2.663-2.545 5.518 4.041c1.012.564 1.725.267 1.998-.931L23.98 3.38c.321-1.497-.541-2.082-1.527-1.714L2.393 9.273c-1.464.568-1.441 1.383-.248 1.751l5.13 1.597 11.91-7.499c.56-.369 1.07-.164.652.204z"/>
    </svg>
  ),
};

const encode = encodeURIComponent;

function buildPlatforms({ shareText, shareUrl, imageUrl }) {
  const text = shareText;
  const url = shareUrl;
  const emailBody = `${text}\n\n${imageUrl ? `See the card: ${imageUrl}\n\n` : ''}Learn more: ${url}`;
  return [
    {
      key: 'x',
      label: 'X / Twitter',
      color: '#000000',
      icon: Icon.X,
      href: `https://twitter.com/intent/tweet?text=${encode(text)}`,
      note: 'Opens X compose window. Attach the downloaded image if you want.',
    },
    {
      key: 'facebook',
      label: 'Facebook',
      color: '#1877F2',
      icon: Icon.Facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encode(url)}&quote=${encode(text)}`,
      note: 'Opens Facebook sharer. Your post will link to CarryOn.',
    },
    {
      key: 'linkedin',
      label: 'LinkedIn',
      color: '#0A66C2',
      icon: Icon.LinkedIn,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encode(url)}`,
      note: 'Opens LinkedIn. Paste your message, attach the image.',
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      color: '#25D366',
      icon: Icon.WhatsApp,
      href: `https://api.whatsapp.com/send?text=${encode(text)}`,
      note: 'Opens WhatsApp with the message prefilled.',
    },
    {
      key: 'telegram',
      label: 'Telegram',
      color: '#26A5E4',
      icon: Icon.Telegram,
      href: `https://t.me/share/url?url=${encode(url)}&text=${encode(text)}`,
      note: 'Opens Telegram share.',
    },
    {
      key: 'reddit',
      label: 'Reddit',
      color: '#FF4500',
      icon: Icon.Reddit,
      href: `https://www.reddit.com/submit?url=${encode(url)}&title=${encode(text)}`,
      note: 'Opens Reddit submit page.',
    },
    {
      key: 'sms',
      label: 'iMessage / SMS',
      color: '#4FC3F7',
      icon: MessageCircle,
      href: `sms:&body=${encode(text)}`,
      note: 'Opens Messages on iPhone/Android with the text prefilled.',
    },
    {
      key: 'email',
      label: 'Email',
      color: 'var(--t3)',
      icon: Mail,
      href: `mailto:?subject=${encode('I joined CarryOn')}&body=${encode(emailBody)}`,
      note: 'Opens your email app with the message prefilled.',
    },
  ];
}

export default function SocialShareSheet({
  open,
  onClose,
  imageUrl,
  shareText,
  shareUrl = 'https://carryon.us',
  title = 'Share the news',
  accent = 'gold',
  // Quote composer (optional — if onQuoteChange is supplied, the editor is shown)
  editableQuote = false,
  quote = '',
  _quoteSource = 'random',  // "user" | "random"
  onQuoteChange,           // (newQuote: string, consentPublic: boolean) => void
  onRandomize,             // () => void — called when user taps "Surprise me"
  regenerating = false,    // parent sets true while re-fetching the card
  _fetchError = false,      // parent sets true when the card fetch failed
}) {
  const [copied, setCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [draftQuote, setDraftQuote] = useState(quote || '');
  const [consentPublic, setConsentPublic] = useState(false);

  // Keep the draft in sync when the parent swaps in a new random quote
  React.useEffect(() => {
    setDraftQuote(quote || '');
  }, [quote]);

  if (!open) return null;

  const accentColor = accent === 'teal' ? '#34d399' : '#d4af37';
  const platforms = buildPlatforms({ shareText, shareUrl, imageUrl });

  const openPlatform = (href) => {
    try {
      window.open(href, '_blank', 'noopener,noreferrer');
    } catch {
      window.location.href = href;
    }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText + '\n' + shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no-op */
    }
  };

  const downloadImage = () => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = 'carryon-share.png';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const copyImage = async () => {
    if (!imageUrl) return;
    try {
      const res = await fetch(imageUrl, { credentials: 'omit' });
      const blob = await res.blob();
      // ClipboardItem available on Chrome/Edge/Safari 16+
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        setImageCopied(true);
        setTimeout(() => setImageCopied(false), 2200);
      } else {
        downloadImage();
      }
    } catch {
      downloadImage();
    }
  };

  const nativeShare = async () => {
    try {
      if (navigator.share) {
        // Try to attach the image if supported
        if (imageUrl && navigator.canShare) {
          try {
            const res = await fetch(imageUrl, { credentials: 'omit' });
            const blob = await res.blob();
            const file = new File([blob], 'carryon-share.png', { type: blob.type || 'image/png' });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                text: shareText,
                url: shareUrl,
                title: 'CarryOn',
              });
              return;
            }
          } catch {
            /* fall through to text-only */
          }
        }
        await navigator.share({ text: shareText, url: shareUrl, title: 'CarryOn' });
      }
    } catch {
      /* cancelled / unsupported */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center px-4"
      style={{
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 70px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)',
      }}
      onClick={onClose}
      data-testid="social-share-sheet"
    >
      <div
        className="w-full max-w-lg rounded-3xl flex flex-col overflow-hidden"
        style={{
          background: 'var(--bg2)',
          /* Multi-layer shadow: ambient + directional + deep — creates true elevation */
          boxShadow: [
            '0 1px 2px rgba(0,0,0,0.25)',
            '0 4px 12px rgba(0,0,0,0.35)',
            '0 16px 40px rgba(0,0,0,0.5)',
            '0 40px 80px rgba(0,0,0,0.35)',
          ].join(', '),
          border: '1px solid rgba(255,255,255,0.12)',
          animation: 'ssUp 300ms cubic-bezier(0.34, 1.3, 0.64, 1) both',
          maxHeight: 'calc(100dvh - 64px - 90px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Fixed header — never scrolls ── */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2.5 flex-shrink-0">
          <h3 className="text-base font-semibold" style={{ color: 'var(--t)' }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'var(--s)', color: 'var(--t4)' }}
            data-testid="share-sheet-close"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div
          className="overflow-y-auto flex-1"
          style={{
            minHeight: 0,                      /* iOS Safari: flex child must have this or overflow-y has no effect */
            WebkitOverflowScrolling: 'touch',
          }}
        >

        {/* Image preview — REMOVED. Quote text is the primary content. */}

        {/* Quote composer — full width textarea + full width Surprise me */}
        {editableQuote ? (
          <div className="px-4 pb-2">
            <label
              htmlFor="share-sheet-quote"
              className="block text-[11px] uppercase tracking-wider mb-2"
              style={{ color: 'var(--t4)' }}
            >
              Your quote on the card
              <span className="normal-case tracking-normal ml-1" style={{ color: accentColor }}>
                (optional)
              </span>
            </label>

            {/* Full-width multi-line quote display */}
            <textarea
              id="share-sheet-quote"
              value={draftQuote}
              maxLength={110}
              rows={3}
              placeholder="What does CarryOn mean to you?"
              onChange={(e) => setDraftQuote(e.target.value)}
              onBlur={() => {
                if ((draftQuote || '').trim() !== (quote || '').trim()) {
                  onQuoteChange?.(draftQuote, consentPublic);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if ((draftQuote || '').trim() !== (quote || '').trim()) {
                    onQuoteChange?.(draftQuote, consentPublic);
                  }
                  e.currentTarget.blur();
                }
              }}
              className="w-full rounded-xl px-4 py-3 text-base resize-none"
              style={{
                background: 'var(--s)',
                border: `1px solid ${accentColor}55`,
                color: draftQuote ? 'var(--t)' : 'var(--t5)',
                outline: 'none',
                fontSize: '16px',
                lineHeight: '1.5',
                minHeight: '88px',
              }}
              data-testid="share-sheet-quote-input"
            />

            {/* Surprise me — full width */}
            <button
              onClick={() => {
                setDraftQuote('');
                onRandomize?.();
              }}
              disabled={regenerating}
              className="w-full mt-2 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              style={{
                background: 'var(--s)',
                border: `1px solid ${accentColor}33`,
                color: 'var(--t)',
                opacity: regenerating ? 0.55 : 1,
              }}
              data-testid="share-sheet-quote-random"
            >
              {regenerating
                ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: accentColor }} />
                : <Shuffle className="w-4 h-4" style={{ color: accentColor }} />}
              {regenerating ? 'Finding a quote…' : 'Surprise me — pick a quote for me'}
            </button>

            <p className="text-[11px] mt-2" style={{ color: 'var(--t5)' }}>
              {(draftQuote || '').trim()
                ? `${draftQuote.length}/110 · your words on the card.`
                : 'Leave blank and we\'ll use an inspiring quote — yours can still replace it anytime.'}
            </p>

            {/* Consent */}
            <label
              className="flex items-start gap-2 mt-2.5 cursor-pointer select-none"
              style={{ opacity: (draftQuote || '').trim() ? 1 : 0.5 }}
              data-testid="share-sheet-consent-label"
            >
              <input
                type="checkbox"
                checked={consentPublic}
                disabled={!(draftQuote || '').trim()}
                onChange={(e) => {
                  const next = e.target.checked;
                  setConsentPublic(next);
                  if ((draftQuote || '').trim() && (draftQuote || '').trim() === (quote || '').trim()) {
                    onQuoteChange?.(draftQuote, next);
                  }
                }}
                className="mt-0.5"
                style={{ accentColor: accentColor }}
                data-testid="share-sheet-consent-checkbox"
              />
              <span className="text-[11px] leading-snug" style={{ color: 'var(--t4)' }}>
                Let CarryOn use this quote publicly (website, marketing, social).
                <span className="block" style={{ color: 'var(--t5)' }}>
                  We&apos;ll credit just your first name. Uncheck to keep it private to your card.
                </span>
              </span>
            </label>
          </div>
        ) : null}

        {/* Native share + image actions */}
        <div className="px-4 flex gap-2 flex-wrap mb-3">
          {typeof navigator !== 'undefined' && navigator.share ? (
            <button
              onClick={nativeShare}
              className="flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`, color: 'var(--bg)' }}
              data-testid="share-sheet-native"
            >
              <Share2 className="w-4 h-4" /> Share via…
            </button>
          ) : null}
          <button
            onClick={copyImage}
            className="flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)' }}
            data-testid="share-sheet-copy-image"
          >
            {imageCopied
              ? <><Check className="w-4 h-4" style={{ color: '#10b981' }} /> Copied</>
              : <><Copy className="w-4 h-4" /> Copy image</>}
          </button>
          <button
            onClick={downloadImage}
            className="flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)' }}
            data-testid="share-sheet-download"
          >
            <Download className="w-4 h-4" /> Download
          </button>
        </div>

        {/* Platform grid */}
        <div className="px-4 pb-2">
          <p className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--t4)' }}>
            Or post directly to
          </p>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {platforms.map((p) => {
              const Ic = p.icon;
              return (
                <button
                  key={p.key}
                  onClick={() => openPlatform(p.href)}
                  className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl transition-transform active:scale-[0.97]"
                  style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                  data-testid={`share-sheet-${p.key}`}
                  title={p.note}
                >
                  <Ic className="w-5 h-5" style={{ color: p.color }} />
                  <span className="text-[11px] font-medium text-center leading-tight px-0.5" style={{ color: 'var(--t3)' }}>
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Copy text */}
          <button
            onClick={copyText}
            className="w-full py-2 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
            style={{ background: 'var(--s)', border: '1px dashed var(--b)', color: 'var(--t4)' }}
            data-testid="share-sheet-copy-text"
          >
            {copied
              ? <><Check className="w-3.5 h-3.5" style={{ color: '#10b981' }} /> Caption copied</>
              : <><Copy className="w-3.5 h-3.5" /> Copy caption text</>}
          </button>
        </div>

        <p className="px-4 pb-4 pt-1.5 text-[11px] text-center" style={{ color: 'var(--t5)' }}>
          For Instagram &amp; iMessage, download the image first and attach it manually.
        </p>

        </div>{/* end scrollable content */}
      </div>

      <style>{`
        @keyframes ssUp {
          from { opacity: 0; transform: scale(0.97) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
