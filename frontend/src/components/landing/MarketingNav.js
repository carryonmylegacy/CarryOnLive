import React from 'react';
import { ChevronRight } from 'lucide-react';
import { MobileNav, STANDALONE_LINKS, isCurrentLink, visibleLinks } from './MobileNav';
import { useCopy } from '../../copy/CopyContext';
import { BackHome } from './BackHome';
import { LogoHome } from './LogoHome';

// Marketing nav for standalone pages (/pricing, /customers, /changelog, …). Hash links resolve to /home.
export const MarketingNav = ({ navigateWithFade, current, testIdSuffix = '' }) => {
  const { t, flags } = useCopy();
  const links = visibleLinks(STANDALONE_LINKS, flags);
  const here = current || window.location.pathname;
  const go = navigateWithFade || ((p) => { window.location.href = p; });
  return (
    <nav className="fixed top-0 w-full z-[100]" style={{ borderBottom: '1px solid rgba(14,165,233,0.06)', background: 'rgba(11,18,33,0.97)', paddingTop: 'env(safe-area-inset-top, 0px)' }} data-testid={`marketing-nav${testIdSuffix}`}>
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <BackHome testId={`marketing-nav-back${testIdSuffix}`} compact className="-ml-1 pr-1" />
          <LogoHome testId={`marketing-nav-logo${testIdSuffix}`} />
        </div>
        <div className="hidden lg:flex items-center gap-5 xl:gap-7 whitespace-nowrap">
          {links.map(item => (
            <a key={item.label} href={item.href} aria-current={isCurrentLink(item.href, here) ? 'page' : undefined} className={`text-[13px] xl:text-sm font-medium transition-colors duration-300 ${isCurrentLink(item.href, here) ? 'text-[#d4af37]' : 'text-[#8b97ab] hover:text-[#d4af37]'}`}>{t(`nav.${item.k}`)}</a>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => go('/start')} className="hidden sm:inline-flex items-center gap-1 px-5 py-2 rounded-lg text-sm font-bold transition-all active:scale-95 whitespace-nowrap" style={{ background: '#d4af37', color: '#0B1221' }} data-testid={`marketing-nav-start${testIdSuffix}`}>{t('nav.start')}</button>
          <button onClick={() => go('/login')} className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1 min-h-[44px] px-2 whitespace-nowrap" data-testid={`marketing-nav-sign-in${testIdSuffix}`}>{t('nav.signin')} <ChevronRight className="w-3.5 h-3.5" /></button>
          <MobileNav links={links} current={here} navigateWithFade={go} testIdSuffix={testIdSuffix} />
        </div>
      </div>
    </nav>
  );
};

export default MarketingNav;
