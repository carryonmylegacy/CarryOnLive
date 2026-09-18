import React from 'react';
import { useCopy } from '../../copy/CopyContext';

const LINKS = [['home', '/'], ['pricing', '/pricing'], ['customers', '/customers'], ['compare', '/vs'], ['guides', '/guides'], ['readiness', '/readiness-score'], ['about', '/about'], ['changelog', '/changelog']];

// Compact footer shared by /customers, /vs, /changelog, /readiness-score and /guides. `hide` drops the link to the page you are on.
export const MarketingFooter = ({ hide = '', testIdSuffix = '' }) => {
  const { t, flags } = useCopy();
  return (
    <footer className="py-8 text-center text-[#334155] text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} data-testid={`marketing-footer${testIdSuffix}`}>
      {LINKS.filter(([k]) => k !== hide && (k !== 'guides' || flags.guides_launched)).map(([k, href], i, arr) => (
        <a key={k} href={href} className={`hover:text-[#7b879e] ${i < arr.length - 1 ? 'mr-5' : ''}`} data-testid={`marketing-footer-${k}${testIdSuffix}`}>{t(`footer.${k}`)}</a>
      ))}
      <p className="mt-3">&copy; {new Date().getFullYear()} {t('footer.short_copyright')}</p>
    </footer>
  );
};

export default MarketingFooter;
