import React from 'react';

/**
 * CircleGauge — slim gold-arc circular readiness gauge.
 *
 * Text (number + label) is HTML overlaid on the SVG and uses container
 * query units (`cqi` = 1% of the inline size of the nearest container)
 * for font-sizing. This guarantees the percentage and label always fit
 * proportionally inside the ring whether the gauge is rendered at full
 * dashboard size or shrunk inside a Settings preview tile.
 */
export const CircleGauge = ({ score, id = 'main', labelText, labelColor }) => {
  const safe = Math.max(0, Math.min(100, Number(score) || 0));
  const gId = `circle-gauge-${id}`;
  // Triple the gold-ring thickness while preserving the same outer
  // circumference (do NOT let the ring grow outward — only inward).
  const STROKE = 24;
  const radius = 94 - STROKE / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safe / 100);

  return (
    <div className="flex flex-col items-center w-full max-w-[240px] lg:max-w-[380px] mx-auto">
      <div
        className="relative w-full aspect-square"
        style={{ containerType: 'inline-size' }}
      >
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
            strokeWidth={STROKE}
          />
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke={`url(#${gId}-grad)`}
            strokeWidth={STROKE}
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
              // 28cqi = 28% of container inline size — scales perfectly
              // with the wrapper, so a 112px container yields ~31px and
              // a 300px container yields ~84px without ever overflowing.
              fontSize: '28cqi',
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
                fontSize: '5.5cqi',
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
