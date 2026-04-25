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
  >
    <Icon className={`stat-icon ${compact ? 'w-5 h-5 lg:w-5 lg:h-5 mb-1 lg:mb-1' : 'w-6 h-6 lg:w-8 lg:h-8 mb-2 lg:mb-3'} opacity-70 flex-shrink-0`} />
    <div className={`${compact ? 'text-2xl lg:text-3xl mb-1' : 'text-3xl lg:text-5xl mb-2'} font-bold text-center leading-none flex-shrink-0`}>
      {value}
    </div>
    <div
      className={`opacity-80 ${compact ? 'text-xs lg:text-sm' : ''} font-bold leading-tight text-center min-w-0`}
      style={
        compact
          ? undefined
          : {
              // Auto-scale label so single long words like "Beneficiaries"
              // fit on one line across all phone widths (iPhone 13 mini
              // 375px → ~10.5px ; iPhone 17 Pro Max 430px → ~12.0px) and
              // top out at the desktop `text-lg` (18px) on >= ~640px.
              fontSize: 'clamp(0.66rem, 2.8vw, 1.125rem)',
            }
      }
    >
      {label}
    </div>
  </div>
);
