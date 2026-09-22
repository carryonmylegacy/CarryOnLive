import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isNative } from '../services/native';
import { isPWA } from '../utils/pwaDetect';

export const CONSENT_KEY = 'carryon_consent_analytics';

const read = () => { try { return localStorage.getItem(CONSENT_KEY); } catch { return 'declined'; } };

/* One-line analytics notice for public visitors. The Meta Pixel (our only third-party tracker)
   loads only after "Allow" — see the consent-gated loader in public/index.html. Never shown inside
   the installed app (the pixel never loads there) or to signed-in users. */
export const AnalyticsConsent = () => {
  const { isAuthenticated } = useAuth();
  const [choice, setChoice] = useState(read);
  const pixelConfigured = Boolean(process.env.REACT_APP_META_PIXEL_ID);
  if (choice || isAuthenticated || isNative || isPWA() || !pixelConfigured) return null;

  const decide = (value) => {
    try { localStorage.setItem(CONSENT_KEY, value); } catch { /* storage blocked → session-only */ }
    setChoice(value);
    if (value === 'granted' && typeof window.__carryonLoadPixel === 'function') window.__carryonLoadPixel();
  };

  return (
    <div role="dialog" aria-live="polite" aria-label="Analytics notice"
      className="fixed inset-x-0 bottom-0 z-[120] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3"
      style={{ background: 'rgba(11,18,33,0.97)', borderTop: '1px solid rgba(212,175,55,0.25)', backdropFilter: 'blur(12px)' }}
      data-testid="analytics-consent">
      <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-[#c9d2e0] text-sm leading-snug flex-1">
          We use one analytics cookie (Meta Pixel) to learn which ads bring families here. Nothing you store in CarryOn™ is ever shared, and declining changes nothing.{' '}
          <a href="/privacy" className="text-[#d4af37] underline underline-offset-4">Privacy Policy</a>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => decide('declined')} className="min-h-[44px] px-4 rounded-lg text-sm font-semibold text-[#c9d2e0] border border-white/15 hover:border-white/30 transition-colors" data-testid="analytics-consent-decline">Decline</button>
          <button type="button" onClick={() => decide('granted')} className="min-h-[44px] px-5 rounded-lg text-sm font-bold active:scale-95 transition-transform" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="analytics-consent-allow">Allow</button>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsConsent;
