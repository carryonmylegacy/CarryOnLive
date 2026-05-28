import React, { useEffect, useState } from 'react';

/**
 * SpeedometerGauge — SVG half-circle gauge with animated needle.
 * Extracted from DashboardPage for reuse and render optimization.
 */
export const SpeedometerGauge = ({ score, id = 'main', labelText, labelColor }) => {
  const angle = (score / 100) * 180 - 90;
  const gId = `gauge-${id}`;

  // First-paint = instant; user-driven refresh = animate (May 22,
  // 2026 user mandate). Same rationale as CircleGauge — see comment
  // there. We hold the needle's transition off for 1.5 s after mount
  // so the score commits to its final angle instantly during cold
  // reveal, and subsequent score changes animate as before.
  const [animEnabled, setAnimEnabled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimEnabled(true), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="flex flex-col items-center w-full mx-auto"
      // Fluid sizing: gauge grows with viewport between a mobile floor
      // and a generous desktop ceiling instead of clamping at a fixed
      // 460px (May 22, 2026 user mandate). BNDR + EGA pills sit outside
      // this wrapper and stay anchored to the parent card corners, so
      // their sizes are unaffected.
      style={{ maxWidth: 'clamp(240px, 38vw, 680px)' }}
    >
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

        <g
          transform={`rotate(${angle}, 100, 95)`}
          style={{
            transition: animEnabled
              ? 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)'
              : 'none',
          }}
        >
          <polygon points="100,20 97,78 94,110 100,114 106,110 103,78" fill={`url(#${gId}-needle)`} stroke="#64748b" strokeWidth="0.5" />
          <polygon points="100,20 98,40 100,43 102,40" fill="#dc2626" />
          <circle cx="100" cy="95" r="9" fill={`url(#${gId}-hub)`} stroke="#475569" strokeWidth="1.5" />
        </g>
      </svg>
      <div className="text-center mt-2 lg:mt-3">
        <div
          className="font-bold text-[var(--t)]"
          style={{ fontFamily: 'var(--sans)', fontSize: 'clamp(28px, 4.2vw, 64px)' }}
        >
          {score}%
        </div>
        <div
          className="font-semibold mt-0.5"
          style={{ color: labelColor, fontFamily: 'var(--sans)', fontSize: 'clamp(15px, 2.6vw, 24px)' }}
        >
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
export const StatCard = ({ icon: Icon, value, label, cardClass, onClick, className = '', sectionKey: _sectionKey, compact = false }) => (
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
              // Label — `clamp(0.8125rem, 6.5cqi, 1.5rem)`. Floor was
              // 12px, bumped to 13px on founder feedback that titles
              // looked a tick small on iPhone/iPad relative to the
              // tile's visual weight. Now:
              //   ~140px tile  → floor 13px (mobile feature tile)
              //   ~259px tile  → ~17px (iPad Pro 11" sweet spot)
              //   ~360px tile  → ~23px → caps at 24px (desktop)
              //   ~500px tile  → 32cqi → caps at 24px
              fontSize: 'clamp(0.8125rem, 6.5cqi, 1.5rem)',
            }
      }
    >
      {label}
    </div>
  </div>
);

/**
 * SectionStatCard — section-rollup tile (May 22 2026).
 *
 * Same outer chrome as `StatCard` (rounded-2xl, container-query
 * sizing, hover/tap affordances) so the dashboard's visual cadence
 * is unchanged. Inner content swaps the giant number + label for:
 *
 *   [icon]
 *   SectionTitle              ← large, bold, container-query sized
 *   Title - value             ← small bold no-wrap row, one per stat
 *   Title - value
 *   ...
 *
 * The tile background is derived directly from the `accent` prop
 * (the section color) so the four tiles match the four menu pills
 * exactly — Estate blue, Vault gold, Financial green, Preparedness
 * purple. (Previously we fell back to legacy per-feature CSS classes
 * via `cardClass` which produced the WRONG colors.)
 */
export const SectionStatCard = ({ icon: Icon, title, stats = [], onClick, className = '', sectionKey, accent = '#3B82F6' }) => {
  // Extract r,g,b from accent so we can build the same `linear-
  // gradient + box-shadow + border` recipe each section uses,
  // tinted to its own color.
  const hex = accent.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const rgb = `${r}, ${g}, ${b}`;
  return (
    <div
      className={`rounded-2xl p-4 lg:p-5 cursor-pointer transition-transform duration-150 active:scale-[0.96] lg:hover:scale-[1.03] lg:hover:shadow-xl flex flex-col items-center justify-start w-full h-full overflow-hidden ${className}`}
      onClick={onClick}
      data-testid={`stat-card-${(sectionKey || title).toLowerCase().replace(/\s+/g, '-')}`}
      aria-label={`${title} section`}
      role="button"
      style={{
        containerType: 'inline-size',
        background: `linear-gradient(135deg, rgba(${rgb}, 0.22), rgba(${rgb}, 0.10))`,
        border: `1px solid rgba(${rgb}, 0.35)`,
        boxShadow: `0 6px 18px rgba(${rgb}, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.04)`,
      }}
    >
      <Icon
        className="w-7 h-7 lg:w-10 lg:h-10 mb-2 lg:mb-3 opacity-95 flex-shrink-0"
        style={{ color: accent }}
      />
      <div
        className="font-bold text-center leading-tight flex-shrink-0 mb-3"
        style={{
          // Pillar title — slightly reduced max from 2.25rem to 1.875rem
          // (Feb 26 2026) so on tablet/PWA tile widths it doesn't dwarf
          // the Total Estate Readiness header above. Mobile floor stays
          // at 1.25rem.
          fontSize: 'clamp(1.25rem, 9.5cqi, 1.875rem)',
          color: 'var(--t)',
          fontFamily: 'var(--sans)',
        }}
      >
        {title}
      </div>
      <div className="flex flex-col items-center gap-1.5 min-w-0 w-full overflow-hidden">
        {stats.map((s) => (
          <div
            key={s.title}
            className="font-bold whitespace-nowrap text-center max-w-full overflow-hidden text-ellipsis"
            style={{
              // Stat rows — "Title - number". Capped slightly lower
              // (Feb 26 2026) from 28 → 24 px max so the pillar tiles
              // don't crowd the gauge title on tablet/PWA.
              fontSize: 'clamp(14px, 7.5cqi, 24px)',
              color: 'var(--t)',
              lineHeight: 1.3,
            }}
            data-testid={`section-stat-${(sectionKey || title).toLowerCase()}-${s.title.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {s.title} - {s.value}
          </div>
        ))}
      </div>
    </div>
  );
};

