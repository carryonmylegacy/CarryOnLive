import React, { useState } from 'react';
import { Menu, X, ChevronRight } from 'lucide-react';
import { useCopy } from '../../copy/CopyContext';

// `k` is the copy key (nav.<k>) — labels are founder-editable; `label` stays the stable default used for test ids.
export const MARKETING_LINKS = [
  { k: 'features', label: 'Features', href: '#features' },
  { k: 'quiz', label: 'Readiness Quiz', href: '#quiz' },
  { k: 'security', label: 'Security', href: '#security' },
  { k: 'steps', label: 'How It Works', href: '#steps' },
  { k: 'pricing', label: 'Pricing', href: '/pricing' },
  { k: 'compare', label: 'Compare', href: '/vs' },
  { k: 'customers', label: 'Customers', href: '/customers' },
  { k: 'about', label: 'About', href: '/about' },
];

// Same menu on standalone pages (/about, /customers, /vs, …): hash links resolve to the homepage.
export const STANDALONE_LINKS = MARKETING_LINKS.map(l => ({ ...l, href: l.href.startsWith('#') ? `/${l.href}` : l.href }));

// "About" opens the founder story when Admin → Site Content has made it public; otherwise the generic About page.
export const aboutHref = (flags) => (flags.founder_story_public ? '/founder-about' : '/about');
export const resolveLinks = (links, flags) => links.map(l => (l.k === 'about' ? { ...l, href: aboutHref(flags) } : l));

export const isCurrentLink = (href, here) => !href.includes('#') && (here === href || here.startsWith(`${href}/`));

const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, '-');

export const MobileNav = ({ links = MARKETING_LINKS, navigateWithFade, current, testIdSuffix = '' }) => {
  const [open, setOpen] = useState(false);
  const { t, flags } = useCopy();
  const here = current || window.location.pathname;
  const items = resolveLinks(links, flags);
  const go = (path) => { setOpen(false); navigateWithFade(path); };
  return (
    <div className="lg:hidden">
      <button type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(o => !o)} data-testid={`mobile-menu-toggle${testIdSuffix}`}
        className="w-10 h-10 -mr-2 flex items-center justify-center rounded-lg text-[#d4af37] active:scale-95 transition-transform">
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>
      {open && (
        <div className="fixed inset-x-0 z-[99] px-6 pt-2 pb-6 animate-in fade-in slide-in-from-top-2 duration-200" data-testid={`mobile-menu${testIdSuffix}`}
          style={{ top: 'calc(4rem + env(safe-area-inset-top, 0px))', background: 'rgba(11,18,33,0.98)', borderBottom: '1px solid rgba(212,175,55,0.25)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
          <nav className="flex flex-col" aria-label="Mobile">
            {items.map(l => {
              const active = isCurrentLink(l.href, here);
              return (
                <a key={l.label} href={l.href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined} data-testid={`mobile-menu-link-${slug(l.label)}${testIdSuffix}`}
                  className={`flex items-center justify-between py-3.5 text-base font-medium border-b border-white/5 transition-colors ${active ? 'text-[#d4af37]' : 'text-[#e2e8f0] hover:text-[#d4af37]'}`}>
                  {l.k ? t(`nav.${l.k}`) : l.label} <ChevronRight className={`w-4 h-4 ${active ? 'text-[#d4af37]' : 'text-[#4a5568]'}`} />
                </a>
              );
            })}
          </nav>
          <div className="flex gap-3 mt-5">
            <button onClick={() => go('/start')} className="flex-1 py-3 rounded-lg font-bold text-sm active:scale-95 transition-transform" style={{ background: '#d4af37', color: '#0B1221' }} data-testid={`mobile-menu-start${testIdSuffix}`}>{t('nav.start')}</button>
            <button onClick={() => go('/login')} className="flex-1 py-3 rounded-lg font-semibold text-sm active:scale-95 transition-transform" style={{ background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.14)' }} data-testid={`mobile-menu-sign-in${testIdSuffix}`}>{t('nav.signin')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileNav;
