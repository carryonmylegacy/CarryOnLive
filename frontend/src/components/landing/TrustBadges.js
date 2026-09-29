import React, { useEffect, useState } from 'react';
import { CreditCard, XCircle, ShieldCheck, Download, Clock, Lock } from 'lucide-react';
import { useCopy, renderCopy } from '../../copy/CopyContext';

const BADGES = [
  { icon: CreditCard, text: 'No card needed to explore' },
  { icon: XCircle, text: 'Cancel anytime' },
  { icon: ShieldCheck, text: 'Payments secured by Stripe' },
  { icon: Download, text: 'Export everything, anytime' },
];

// Honest transactional trust cues. `tone` = 'dark' (marketing pages) or 'app' (CSS-variable pages like /pricing, /start)
export const TrustBadges = ({ tone = 'dark', testIdSuffix = '', className = '' }) => {
  const color = tone === 'dark' ? '#a0aec0' : 'var(--t4)';
  return (
    <ul className={`flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs sm:text-sm ${className}`} style={{ color }} data-testid={`trust-badges${testIdSuffix}`}>
      {BADGES.map(({ icon: Icon, text }) => (
        <li key={text} className="inline-flex items-center gap-1.5"><Icon className="w-4 h-4 text-[#10b981]" /> {text}</li>
      ))}
    </ul>
  );
};

// One-line payment-provider note rendered directly under every plan CTA.
export const StripeNote = ({ tone = 'app', testId, className = '' }) => {
  const { t } = useCopy();
  return (
    <p className={`inline-flex items-center justify-center gap-1.5 text-[13px] leading-snug ${className}`}
      style={{ color: tone === 'dark' ? '#8b97ab' : 'var(--t5)' }} data-testid={testId}>
      <Lock className="w-3.5 h-3.5 flex-shrink-0 text-[#10b981]" />
      <span style={{ '--strong': tone === 'dark' ? '#e2e8f0' : 'var(--t3)' }}>{renderCopy(t('pricing.stripe_note'), 'text-[color:var(--strong)]')}</span>
    </p>
  );
};

export const useChangelog = () => {
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    fetch('/changelog.json').then(r => r.json()).then(d => setEntries(d.entries || [])).catch(() => {});
  }, []);
  return entries;
};

// Build date stamped by `yarn build` into /version.json — every deploy is a product update,
// so the homepage never shows a stale date even if the public changelog lags a release.
const useBuildDate = () => {
  const [built, setBuilt] = useState(null);
  useEffect(() => {
    fetch('/version.json', { cache: 'no-store' }).then(r => r.json()).then(d => setBuilt(d.built || null)).catch(() => {});
  }, []);
  return built;
};

export const formatDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

export const LastUpdated = ({ testIdSuffix = '' }) => {
  const entries = useChangelog();
  const built = useBuildDate();
  const latest = entries.find(e => e.date)?.date;
  const shown = [latest, built].filter(Boolean).sort().pop();
  if (!shown) return null;
  return (
    <p className="inline-flex items-center gap-2 text-[#8b97ab] text-sm" data-testid={`last-updated${testIdSuffix}`}>
      <Clock className="w-4 h-4 text-[#d4af37]" /> Last product update: <span className="text-white font-medium" data-testid={`last-updated-date${testIdSuffix}`}>{formatDate(shown)}</span>
      <a href="/changelog" className="text-[#d4af37] hover:text-[#fcd34d] underline underline-offset-4" data-testid={`changelog-link${testIdSuffix}`}>See what&apos;s new</a>
    </p>
  );
};

export default TrustBadges;
