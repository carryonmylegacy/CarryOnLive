import React from 'react';

// Single source of truth for the Free Mode messaging so the Subscription
// page and the standalone paywall never drift apart. Copy intentionally
// frames Free Mode as the CURRENT state ("right now", "in these early days",
// "while Free Mode is active") — it does NOT promise the platform will be
// free forever, leaving the future pricing model open.
export const FREE_MODE_HEADLINE = 'CarryOn is in Free Mode';
export const FREE_MODE_BODY =
  "Right now, every feature and every tier is unlocked for everyone — at no cost. In these early days, our founder wants as many families as possible to experience everything CarryOn offers and protect what matters most, without cost getting in the way. While Free Mode is active, all plans below are paused and you won't be charged anything. Please use CarryOn to its fullest and get the maximum value from it — consider it our gift to you and your family.";

export const FreeModeBanner = ({ className = '', tone = 'auto', testId = 'free-mode-banner' }) => {
  // `tone="onDark"` renders readable light text for placement over a dark
  // hero (e.g. the login page flag background), regardless of the user's
  // light/dark theme. Default keeps the theme-aware colors used in-app.
  const onDark = tone === 'onDark';
  const headingColor = onDark ? '#FFFFFF' : 'var(--t)';
  const bodyColor = onDark ? 'rgba(255,255,255,0.9)' : 'var(--t3)';
  return (
  <div
    className={`relative overflow-hidden rounded-2xl p-5 sm:p-6 ${className}`}
    style={{
      background: onDark
        ? 'linear-gradient(135deg, rgba(18,26,42,0.9), rgba(11,18,33,0.94))'
        : 'linear-gradient(135deg, rgba(var(--gold-rgb), 0.16), rgba(var(--gold-rgb), 0.04))',
      border: '1.5px solid rgba(var(--gold-rgb), 0.5)',
      boxShadow: onDark
        ? '0 18px 50px -14px rgba(0,0,0,0.65)'
        : '0 12px 40px -12px rgba(var(--gold-rgb), 0.35)',
      backdropFilter: onDark ? 'blur(10px)' : undefined,
      WebkitBackdropFilter: onDark ? 'blur(10px)' : undefined,
    }}
    data-testid={testId}
  >
    {/* Gold shimmer top line — mirrors the Premium tile accent. */}
    <div
      className="absolute top-0 left-0 right-0 h-[2px]"
      style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--gold-rgb), 0.7), transparent)' }}
    />
    <div className="relative">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <h3 className="text-base sm:text-lg font-bold" style={{ fontFamily: 'var(--sans)', color: headingColor }}>
          {FREE_MODE_HEADLINE}
        </h3>
        <span
          className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ color: 'var(--bg2)', background: 'var(--gold)' }}
        >
          Active
        </span>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: bodyColor }} data-testid={`${testId}-body`}>
        {FREE_MODE_BODY}
      </p>
    </div>
  </div>
  );
};

export default FreeModeBanner;
