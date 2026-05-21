/**
 * Build version tag for every page. Visible only on careful
 * inspection — for the founder + agent to verify which build is
 * live during a screenshot review or pitch demo.
 *
 * Update `BUILD_VERSION` on every meaningful push. Format:
 *   BUILD V{YYYY.MM.DD}        (one push per day)
 *   BUILD V{YYYY.MM.DD}.{n}    (multiple pushes same day)
 */
import React from 'react';

export const BUILD_VERSION = 'V2026.05.21.13';

const BuildTag = () => (
  <div
    aria-hidden="true"
    style={{
      position: 'fixed',
      right: 'max(6px, env(safe-area-inset-right))',
      bottom: 'max(2px, env(safe-area-inset-bottom))',
      fontSize: '9px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      color: 'var(--t6, #475569)',
      opacity: 0.35,
      pointerEvents: 'none',
      userSelect: 'none',
      zIndex: 1,
      letterSpacing: '0.04em',
      textShadow: '0 0 1px rgba(0,0,0,0.2)',
    }}
    data-testid="global-build-tag"
  >
    BUILD {BUILD_VERSION}
  </div>
);

export default BuildTag;
