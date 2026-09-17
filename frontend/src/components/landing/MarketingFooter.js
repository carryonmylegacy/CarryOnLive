import React from 'react';
import { useCopy } from '../../copy/CopyContext';

const LINKS = [['home', '/'], ['pricing', '/pricing'], ['customers', '/customers'], ['compare', '/vs'], ['about', '/about'], ['changelog', '/changelog']];

// Compact footer shared by /customers, /vs and /changelog. `hide` drops the link to the page you are on.
export const MarketingFooter = ({ hide = '', testIdSuffix = '' }) => {
  const { t } = useCopy();
  return (
    <footer className="py-8 text-center text-[#334155] text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} data-testid={`marketing-footer${testIdSuffix}`}>
      {LINKS.filter(([k]) => k !== hide).map(([k, href], i, arr) => (
        <a key={k} href={href} className={`hover:text-[#7b879e] ${i < arr.length - 1 ? 'mr-5' : ''}`} data-testid={`marketing-footer-${k}${testIdSuffix}`}>{t(`footer.${k}`)}</a>
      ))}
      <p className="mt-3">&copy; {new Date().getFullYear()} {t('footer.short_copyright')}</p>
    </footer>
  );
};

export default MarketingFooter;
