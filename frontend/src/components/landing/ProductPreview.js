import React, { useState } from 'react';
import { LayoutDashboard, FolderLock, PhoneCall, ListChecks, Lock, Camera, MessageSquareHeart } from 'lucide-react';
import { RevealSection } from './RevealSection';

const card = { background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(212,175,55,0.22)' };

// The Immediate Action Checklist leads (D1.5) — it is the sharpest differentiator, so it is the default tab.
// Milestone Messages sits second: it is the most human, most shareable feature (founder, Sep 19 2026).
const TABS = [
  { id: 'checklist', label: 'What to do first', icon: ListChecks, url: 'carryon.us/checklist',
    alt: 'CarryOn Immediate Action Checklist with critical first steps such as notifying family and obtaining death certificates',
    caption: 'Step-by-step instructions your family follows in the first days \u2014 written in your words, with the phone numbers already in them.' },
  { id: 'messages', label: 'Messages for later', icon: MessageSquareHeart, url: 'carryon.us/messages',
    alt: 'CarryOn Milestone Messages page listing recorded messages scheduled for future family moments',
    caption: 'Your words for a wedding, a graduation, a birthday \u2014 recorded now, delivered on the day you choose.' },
  { id: 'dashboard', label: 'Your dashboard', icon: LayoutDashboard, url: 'carryon.us/dashboard',
    alt: 'CarryOn dashboard showing the four pillar tiles — People, Access, Money, Action — and a Total Family Continuity score of 72%',
    caption: 'A readiness score that moves as you add documents, messages, and checklist items \u2014 so you always know where you stand.' },
  { id: 'vault', label: 'Document vault', icon: FolderLock, url: 'carryon.us/vault',
    alt: 'CarryOn Secure Document Vault listing a will, life insurance policy, power of attorney, trust, and living will',
    caption: 'Wills, policies, deeds, and directives \u2014 encrypted, sorted by type, with exactly who can see each one.' },
  { id: 'contacts', label: 'Who to call first', icon: PhoneCall, url: 'carryon.us/beneficiaries',
    alt: 'CarryOn beneficiaries page showing a family estate tree and a ranked succession list with primary, secondary, and tertiary contacts',
    caption: 'Your people in order \u2014 primary, secondary, tertiary \u2014 so there\u2019s never a question about who steps in.' },
];

const Shots = ({ active, prefix, suffix }) => TABS.map(t => (
  <img key={t.id} src={`/screenshots/${prefix}${t.id}.webp`} alt={t.alt}
    width={prefix ? 780 : 2160} height={prefix ? 1328 : 1350}
    loading={t.id === 'checklist' ? 'eager' : 'lazy'}
    data-testid={t.id === active ? `preview-panel-${t.id}${suffix}` : undefined}
    className="absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-300"
    style={{ opacity: t.id === active ? 1 : 0, pointerEvents: t.id === active ? 'auto' : 'none' }} />
));

const DesktopFrame = ({ active, url, testIdSuffix }) => (
  <div className="hidden md:block rounded-2xl overflow-hidden" style={{ ...card, boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(212,175,55,0.06)' }} data-testid={`preview-desktop-frame${testIdSuffix}`}>
    <div className="flex items-center gap-3 px-4 py-2.5" style={{ background: 'rgba(8,14,26,0.9)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex gap-1.5">{['#ff5f57', '#febc2e', '#28c840'].map(c => <span key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}</div>
      <div className="flex-1 flex items-center gap-2 rounded-md px-3 py-1 text-xs text-[#8b97ab]" style={{ background: 'rgba(255,255,255,0.04)' }} data-testid={`preview-url${testIdSuffix}`}>
        <Lock className="w-3 h-3 text-[#10b981]" /> {url}
      </div>
    </div>
    <div className="relative w-full" style={{ aspectRatio: '16 / 10', background: '#0b1322' }}>
      <Shots active={active} prefix="" suffix="" />
    </div>
  </div>
);

const PhoneFrame = ({ active, testIdSuffix }) => (
  <div className="md:hidden mx-auto" style={{ maxWidth: '300px' }} data-testid={`preview-phone-frame${testIdSuffix}`}>
    <div className="relative rounded-[2.6rem] p-2.5" style={{ background: 'linear-gradient(160deg, #1c2a44, #0b1322)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 50px rgba(212,175,55,0.08), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
      <div className="relative rounded-[2.1rem] overflow-hidden" style={{ aspectRatio: '390 / 664', background: '#0b1322' }}>
        <Shots active={active} prefix="m-" suffix="-mobile" />
      </div>
    </div>
  </div>
);

export const ProductPreview = ({ testIdSuffix = '' }) => {
  const [active, setActive] = useState('checklist');
  const tab = TABS.find(t => t.id === active);
  return (
    <section id="preview" className="relative z-[5]" data-testid={`product-preview${testIdSuffix}`}>
      <div className="py-20 lg:py-28 relative overflow-hidden" style={{ background: '#0E1829' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.06) 0%, transparent 60%)' }} />
        <div className="max-w-[1100px] mx-auto px-6 relative z-10">
          <RevealSection>
            <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] text-center mb-3">See inside CarryOn</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white text-center mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              This is what your family opens.
            </h2>
            <p className="text-[#a0aec0] text-base text-center max-w-[620px] mx-auto mb-10 leading-relaxed">
              Not a binder. Not a shoebox. One place with the documents, the people to call, and a list of what to do first.
            </p>
          </RevealSection>
          <RevealSection delay={0.15} distance={40}>
            <div className="flex flex-wrap justify-center gap-2 mb-6" role="tablist">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button key={id} role="tab" aria-selected={active === id} onClick={() => setActive(id)} data-testid={`preview-tab-${id}${testIdSuffix}`}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors duration-200"
                  style={active === id ? { background: '#d4af37', color: '#0B1221', border: '1px solid #d4af37' } : { color: '#a0aec0', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' }}>
                  <Icon className="w-4 h-4 flex-shrink-0" /> {label}
                </button>
              ))}
            </div>
            <DesktopFrame active={active} url={tab.url} testIdSuffix={testIdSuffix} />
            <PhoneFrame active={active} testIdSuffix={testIdSuffix} />
            <p className="text-center text-[#a0aec0] text-sm lg:text-base mt-6 max-w-[680px] mx-auto leading-relaxed" data-testid={`preview-caption${testIdSuffix}`}>{tab.caption}</p>
          </RevealSection>
          <RevealSection delay={0.3}>
            <p className="flex items-center justify-center gap-2 mt-6 text-xs text-[#6b7a90] text-center px-4">
              <Camera className="w-3.5 h-3.5 text-[#d4af37] flex-shrink-0" /> Actual screenshots of CarryOn, taken from a live demonstration account. Nothing mocked up.
            </p>
          </RevealSection>
        </div>
      </div>
    </section>
  );
};

export default ProductPreview;
