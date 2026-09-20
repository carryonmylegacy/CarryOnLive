import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useCopy } from '../../copy/CopyContext';

const ANCHORS = ['features', 'steps', 'security', 'faq'];
const hashTarget = () => (typeof window !== 'undefined' ? window.location.hash.slice(1) : '');

/* The homepage "encyclopedia" (tools, five steps, security detail, FAQ, hospice) collapsed behind one
 * expander so the first read is What → Why → Show me → Trust → Start free (audit, Sep 2026). Opens by itself
 * when a nav or footer link targets an anchor inside it. Content stays in the DOM for search engines. */
export const MoreDetails = ({ enabled = true, testIdSuffix = '', children }) => {
  const { t } = useCopy();
  const [open, setOpen] = useState(() => !enabled || ANCHORS.includes(hashTarget()));

  useEffect(() => {
    if (!enabled) return undefined;
    const onHash = () => {
      const id = hashTarget();
      if (!ANCHORS.includes(id)) return;
      setOpen(true);
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [enabled]);

  if (!enabled) return children;
  return (
    <>
      <section className="relative z-[53] -mt-1" data-testid={`more-details${testIdSuffix}`}>
        <div className="rounded-t-[2rem] py-16 lg:py-20 relative" style={{ background: '#0E1829', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)', borderBottom: open ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
          <div className="max-w-[720px] mx-auto px-6 text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid={`more-details-title${testIdSuffix}`}>{t('home.more.title')}</h2>
            <p className="text-[#7b879e] text-base leading-relaxed mb-7">{t('home.more.sub')}</p>
            <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls={`more-details-body${testIdSuffix}`}
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-bold transition-colors duration-200"
              style={{ color: '#d4af37', border: '1px solid rgba(212,175,55,0.5)', background: 'rgba(212,175,55,0.08)' }} data-testid={`more-details-toggle${testIdSuffix}`}>
              {open ? t('home.more.close') : t('home.more.open')} <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      </section>
      <div id={`more-details-body${testIdSuffix}`} className={`relative z-[54] ${open ? '' : 'hidden'}`} data-open={open ? 'true' : 'false'} data-testid={`more-details-body${testIdSuffix}`}>
        {children}
      </div>
    </>
  );
};

export default MoreDetails;
