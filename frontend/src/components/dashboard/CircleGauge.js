import React from 'react';

/**
 * CircleGauge — slim gold-arc circular readiness gauge.
 *
 * Mirrors the visual treatment in `/public/mockups/dashboard-v2.html`:
 *   • 220-260px wide, stroke-dashoffset animated fill
 *   • Cormorant Garamond serif for the numeric score
 *   • Outfit uppercase tracked label
 *   • Gold gradient arc with a soft drop shadow glow
 *
 * Accepts the same prop shape as SpeedometerGauge so the dashboard
 * can swap between them seamlessly.
 */
export const CircleGauge = ({ score, id = 'main', labelText, labelColor }) => {
  const safe = Math.max(0, Math.min(100, Number(score) || 0));
  const gId = `circle-gauge-${id}`;
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safe / 100);

  return (
    <div className="flex flex-col items-center w-full max-w-[240px] lg:max-w-[300px] mx-auto">
      <div className="relative w-full aspect-square">
        <svg viewBox="0 0 200 200" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
          <defs>
            <linearGradient id={`${gId}-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F0C95C" />
              <stop offset="100%" stopColor="#B8901E" />
            </linearGradient>
          </defs>
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="var(--b, rgba(255,255,255,0.08))"
            strokeWidth="8"
          />
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke={`url(#${gId}-grad)`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 1200ms cubic-bezier(0.16,1,0.3,1)',
              filter: 'drop-shadow(0 0 8px rgba(212,175,55,0.3))',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="leading-none"
            style={{
              fontFamily: '"Cormorant Garamond", var(--serif), Georgia, serif',
              fontWeight: 500,
              fontSize: 'clamp(48px, 8vw, 72px)',
              color: 'var(--t)',
              letterSpacing: '-0.03em',
            }}
          >
            {safe}
            <span style={{ fontFamily: 'var(--sans)', fontSize: '0.38em', color: 'var(--t4)', marginLeft: 2 }}>
              %
            </span>
          </div>
          {labelText && (
            <div
              className="mt-2 uppercase"
              style={{
                fontFamily: 'var(--sans)',
                letterSpacing: '0.22em',
                fontSize: 11,
                fontWeight: 600,
                color: labelColor || 'var(--t4)',
              }}
            >
              {labelText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CircleGauge;
