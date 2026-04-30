import React from 'react';

/**
 * SpeedometerGauge — SVG half-circle gauge with animated needle.
 * Extracted from DashboardPage for reuse and render optimization.
 */
export const SpeedometerGauge = ({ score, id = 'main', labelText, labelColor }) => {
  const angle = (score / 100) * 180 - 90;
  const gId = `gauge-${id}`;

  return (
    <div className="flex flex-col items-center w-full max-w-[240px] lg:max-w-[460px] mx-auto">
      <svg viewBox="0 0 200 105" className="w-full h-auto">
        <defs>
          <linearGradient id={`${gId}-arc`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="25%" stopColor="#f97316" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="75%" stopColor="#84cc16" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <linearGradient id={`${gId}-needle`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="30%" stopColor="#f1f5f9" />
            <stop offset="50%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
          <radialGradient id={`${gId}-hub`} cx="35%" cy="25%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="20%" stopColor="#e2e8f0" />
            <stop offset="45%" stopColor="#94a3b8" />
            <stop offset="70%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#334155" />
          </radialGradient>
        </defs>

        <path d="M 20 95 A 80 80 0 0 1 180 95" fill="none" stroke={`url(#${gId}-arc)`} strokeWidth="26" strokeLinecap="round" />

        <g transform={`rotate(${angle}, 100, 95)`} style={{ transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
          <polygon points="100,20 97,78 94,110 100,114 106,110 103,78" fill={`url(#${gId}-needle)`} stroke="#64748b" strokeWidth="0.5" />
          <polygon points="100,20 98,40 100,43 102,40" fill="#dc2626" />
          <circle cx="100" cy="95" r="9" fill={`url(#${gId}-hub)`} stroke="#475569" strokeWidth="1.5" />
        </g>
      </svg>
      <div className="text-center mt-2 lg:mt-3">
        <div className="text-3xl lg:text-5xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
          {score}%
        </div>
        <div className="text-sm lg:text-lg font-semibold mt-0.5" style={{ color: labelColor, fontFamily: 'var(--sans)' }}>
          {labelText}
        </div>
      </div>
    </div>
  );
};

/**
 * StatCard — clickable stat tile used on the dashboard grid.
 *
 * `compact` (desktop side-by-side layouts): roughly halves the
 * vertical real-estate so the gauge column can expand. Smaller
 * padding, smaller value font, smaller icon — same colors/labels.
 *
 * Sizing is fully driven by the parent grid (uniform cells via
 * `gridAutoRows: 1fr`). The card uses `h-full w-full` to fill its
 * cell exactly — and `overflow-hidden` to GUARANTEE content can
 * never push a single tile taller than its neighbours, regardless
 * of label line-count. This is the contract that keeps the 6
 * chiclets visually identical.
 */
export const StatCard = ({ icon: Icon, value, label, cardClass, onClick, className = '', sectionKey, compact = false }) => (
  <div
    className={`${cardClass} rounded-2xl ${compact ? 'p-3 lg:p-3' : 'p-4 lg:p-5'} cursor-pointer transition-transform duration-150 active:scale-[0.96] lg:hover:scale-[1.03] lg:hover:shadow-xl flex flex-col items-center justify-center w-full h-full overflow-hidden ${className}`}
    onClick={onClick}
    data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
    aria-label={`${label}: ${value}`}
    role="button"
    // Establish a CSS containment context so children (the big number
    // AND the label) can size themselves with `cqi` (1% of THIS tile's
    // inline width) instead of `vw`. Viewport-based scaling left a
    // dead-zone between Tailwind's md/lg breakpoints — most painful on
    // iPad Pro 11" (1024×1366) where tiles get noticeably wider but
    // labels stayed pinned at the 18px ceiling and looked cramped near
    // the tile edge. Container queries make the text grow continuously
    // with the tile from iPhone 13 mini all the way up to a 27" 4K
    // monitor in fullscreen.
    style={{ containerType: 'inline-size' }}
  >
    <Icon className={`stat-icon ${compact ? 'w-5 h-5 lg:w-5 lg:h-5 mb-1 lg:mb-1' : 'w-6 h-6 lg:w-8 lg:h-8 mb-2 lg:mb-3'} opacity-70 flex-shrink-0`} />
    <div
      className={`${compact ? 'mb-1' : 'mb-2'} font-bold text-center leading-none flex-shrink-0`}
      style={
        compact
          ? { fontSize: 'clamp(1.25rem, 14cqi, 1.875rem)' }
          : {
              // Big stat number — 18cqi keeps it bold and readable from
              // ~140px tile (mobile) to ~360px tile (desktop) while
              // never overflowing. Floor 1.5rem (24px) so it's always
              // legible; ceiling 3rem (48px) so it doesn't dwarf the
              // tile on a 27" monitor.
              fontSize: 'clamp(1.5rem, 18cqi, 3rem)',
            }
      }
    >
      {value}
    </div>
    <div
      className="opacity-80 font-bold leading-tight text-center min-w-0"
      style={
        compact
          ? { fontSize: 'clamp(0.75rem, 5cqi, 1rem)' }
          : {
              // Label — `clamp(0.75rem, 6.5cqi, 1.5rem)` =
              //   ~140px tile  → 9.1cqi → floor 12px (12px-bold per
              //                            global readability rule)
              //   ~280px tile  → ~18px (iPad Pro sweet spot)
              //   ~360px tile  → ~23px → caps at 24px
              //   ~500px tile  → 32cqi → caps at 24px
              // Fits "Beneficiaries" (longest label) on one line
              // across the full range with comfortable padding.
              fontSize: 'clamp(0.75rem, 6.5cqi, 1.5rem)',
            }
      }
    >
      {label}
    </div>
  </div>
);
