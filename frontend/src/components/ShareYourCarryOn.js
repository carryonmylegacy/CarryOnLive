/**
 * ShareYourCarryOn — navigates to the full-screen /share page.
 * Renders as a button, tile, or inline link depending on `variant` prop.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Share2 } from 'lucide-react';

export default function ShareYourCarryOn({
  variant = 'button',
  className = '',
  label,
  forceSubscriber = false,
  forceFounders = false,
}) {
  const navigate = useNavigate();
  const go = () => navigate('/share');

  const displayLabel = label || 'Tell your people';

  if (variant === 'tile') {
    return (
      <button
        onClick={go}
        className={`w-full rounded-2xl p-4 text-left transition-transform active:scale-[0.98] ${className}`}
        style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
        data-testid="share-tile-btn"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(212,175,55,0.12)' }}>
            <Share2 className="w-4 h-4" style={{ color: 'var(--gold)' }} />
          </div>
          <span className="text-sm font-bold" style={{ color: 'var(--t)' }}>{displayLabel}</span>
        </div>
        <p className="text-xs pl-12" style={{ color: 'var(--t4)' }}>
          Share your CarryOn story with your network.
        </p>
      </button>
    );
  }

  if (variant === 'inline') {
    return (
      <button onClick={go} className={`underline text-sm ${className}`}
        style={{ color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer' }}
        data-testid="share-inline-btn">
        {displayLabel}
      </button>
    );
  }

  // Default: button
  return (
    <button
      onClick={go}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-transform active:scale-[0.98] ${className}`}
      style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)' }}
      data-testid="share-btn"
    >
      <Share2 className="w-4 h-4" style={{ color: 'var(--gold)' }} />
      {displayLabel}
    </button>
  );
}
