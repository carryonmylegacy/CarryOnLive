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

export const BUILD_VERSION = 'V2026.05.27.AUTHSRC';

// Visible only in development and preview. NODE_ENV is 'production' in BOTH
// Vercel prod and preview pod builds, so the preview/prod distinction comes
// from REACT_APP_BACKEND_URL (inlined at build time by CRA).
const IS_PRODUCTION_SITE =
  process.env.NODE_ENV === 'production' &&
  !(process.env.REACT_APP_BACKEND_URL || '').includes('preview.emergentagent.com');

const BuildTag = () => {
  if (IS_PRODUCTION_SITE) return null;
  return (
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
};

export default BuildTag;
