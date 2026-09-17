import React, { useState } from 'react';
import { Shield, Users, ChevronRight, ChevronDown, Lock as LockIcon, Sparkles, FileCheck, UserCheck, Trash2, ClipboardCheck, MessageSquare, Key, Layers, Smartphone, MapPin, ShieldAlert, ArrowUpDown, SlidersHorizontal, Radio, MessageCircle, HelpCircle, Heart, HandHeart, EyeOff, Download, Clock, Medal, UserCog, Landmark, Network, MessageSquareText } from 'lucide-react';
import { RevealSection } from './RevealSection';
import { ProductPreview } from './ProductPreview';
import { ReadinessQuiz } from './ReadinessQuiz';
import { StepsShowcase } from './StepsShowcase';
import { FounderCard } from './FounderCard';
import { LiveStats } from './LiveStats';
import { TestimonialsBlock } from './TestimonialsBlock';
import { TrustBadges, LastUpdated } from './TrustBadges';
import { useCopy, renderCopy } from '../../copy/CopyContext';

/* ── layout data: the twelve tools, grouped by pillar (People → Access → Money → Action).
   Order + names are platform law: config/benefactorSections.js and
   backend feature_gates.py::PLATFORM_FEATURES. All text lives in copy/siteCopy.js
   (founder-editable; official names are locked there). ── */
const PILLAR_META = [
  { key: 'people', num: '01', color: '#3B82F6', icon: Heart, tools: ['beneficiaries', 'mm', 'ffn', 'dts'] },
  { key: 'access', num: '02', color: '#d4af37', icon: LockIcon, tools: ['sdv', 'dav', 'ega'] },
  { key: 'money', num: '03', color: '#22C993', icon: Landmark, tools: ['cfp', 'ces'] },
  { key: 'action', num: '04', color: '#B794F6', icon: ClipboardCheck, tools: ['iac', 'ccp', 'ect'] },
];
const TOOL_ICONS = {
  beneficiaries: UserCheck, mm: MessageSquare, ffn: Users, dts: UserCog,
  sdv: LockIcon, dav: Key, ega: Sparkles, cfp: Landmark, ces: Network,
  iac: ClipboardCheck, ccp: Radio, ect: MessageCircle, bec: MessageSquareText,
};
const PLATFORM_ICONS = [UserCheck, ArrowUpDown, Layers, Users, ShieldAlert, SlidersHorizontal, Smartphone, MapPin];
const SECURITY_ICONS = [LockIcon, Sparkles, Shield, Users, Trash2, FileCheck];
const OUTCOME_ICONS = [Heart, HandHeart, MessageSquare];
const TRUST_ICONS = [EyeOff, Download, Clock, Medal];
const FAQ_COUNT = 6;
const FAQ_LINKS = { 2: '/wind-down-promise', 3: '/wind-down-promise' };
const FOOTER_LINKS = [
  ['pricing', '/pricing'], ['customers', '/customers'], ['compare', '/vs'], ['security', '/security'],
  ['winddown', '/wind-down-promise'], ['changelog', '/changelog'], ['about', '/about'], ['privacy', '/privacy'], ['terms', '/terms'],
];

const toolNum = (gi, i) => String(PILLAR_META.slice(0, gi).reduce((n, g) => n + g.tools.length, 0) + i + 1).padStart(2, '0');

/**
 * FaqItem — expandable FAQ question/answer
 */
const FaqItem = ({ q, a, link, isOpen, onToggle, index }) => (
  <div className="border-b border-white/5">
    <button onClick={onToggle} className="w-full flex items-center justify-between py-5 text-left group" data-testid={`faq-question-${index}`} aria-expanded={isOpen}>
      <span className="text-white text-base font-medium pr-4 group-hover:text-[#d4af37] transition-colors">{q}</span>
      <ChevronDown className={`w-5 h-5 text-[#d4af37] flex-shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
    </button>
    {isOpen && (
      <p className="text-[#7b879e] text-sm leading-relaxed pb-5 pr-8" data-testid={`faq-answer-${index}`}>
        {renderCopy(a)}
        {link && (
          <>
            {' '}
            <a href={link.href} className="text-[#d4af37] underline hover:text-[#e0bd47]" data-testid={`faq-link-${index}`}>{link.label}</a>
          </>
        )}
      </p>
    )}
  </div>
);

/**
 * ToolCard — one function card (shared by the four pillar groups and the after-transition tool)
 */
const ToolCard = ({ num, icon: Icon, title, product, bold, desc, accent = '#d4af37', testId }) => (
  <div className="rounded-2xl p-6 h-full relative overflow-hidden"
    data-testid={testId}
    style={{
      background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)',
      border: '1.5px solid rgba(212,175,55,0.45)',
      boxShadow: '0 2px 16px rgba(0,0,0,0.15)',
    }}>
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center gap-2 flex-shrink-0 pt-0.5">
        <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm"
          style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.12), rgba(212,175,55,0.06))', border: '1.5px solid rgba(212,175,55,0.25)', color: '#d4af37' }}>
          {num}
        </div>
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.06)' }}>
          <Icon className="w-4 h-4" style={{ color: accent, opacity: 0.85 }} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-white text-lg font-bold leading-tight mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h4>
        <span className="text-[#8b97ab] text-xs font-semibold tracking-wide block mb-2.5">{product}</span>
        <p className="text-sm font-medium mb-2 leading-relaxed" style={{ color: '#e8c972' }}>{bold}</p>
        <p className="text-[#8b97ab] text-sm leading-relaxed">{renderCopy(desc)}</p>
      </div>
    </div>
  </div>
);

/**
 * LandingContent — all shared marketing sections rendered below the hero.
 *
 * @param {Function} navigateWithFade  — (path) => void
 * @param {{ line1: string, line2: string, phone: string }} footerInfo
 * @param {string}  [testIdSuffix='']  — appended to data-testid values (e.g. '-home')
 * @param {React.ReactNode} [beforeAbout]  — optional slot rendered before the About section (e.g. video)
 */
const DEFAULT_FOOTER = { line1: '1550 Wilson Boulevard 7th Floor', line2: 'Arlington, VA 22209 U.S.A.', phone: '(703) 884-1527' };

const LandingContent = ({ navigateWithFade, footerInfo = DEFAULT_FOOTER, testIdSuffix = '', beforeAbout, skipToRealFamilies = false, ctaOverride }) => {
  const [openFaq, setOpenFaq] = useState(null);
  const { t } = useCopy();

  const tool = (key) => ({
    icon: TOOL_ICONS[key],
    product: t(`home.tools.${key}.product`), title: t(`home.tools.${key}.title`),
    bold: t(`home.tools.${key}.bold`), desc: t(`home.tools.${key}.desc`),
  });
  const pillarGroups = PILLAR_META.map(g => ({ ...g, label: t(`home.pillars.${g.key}.label`), tagline: t(`home.pillars.${g.key}.tagline`), tools: g.tools.map(tool) }));
  const afterTool = tool('bec');
  const platformFeatures = PLATFORM_ICONS.map((icon, i) => ({ icon, title: t(`home.platform.${i + 1}.title`), desc: t(`home.platform.${i + 1}.desc`) }));
  const fiveSteps = [1, 2, 3, 4, 5].map(n => ({ step: String(n), title: t(`home.steps.${n}.title`), desc: t(`home.steps.${n}.desc`) }));
  const securityItems = SECURITY_ICONS.map((icon, i) => ({ icon, text: t(`home.security.${i + 1}`) }));
  const outcomes = OUTCOME_ICONS.map((icon, i) => ({ icon, title: t(`home.outcomes.${i + 1}.title`), desc: t(`home.outcomes.${i + 1}.desc`) }));
  const trustItems = TRUST_ICONS.map((icon, i) => ({ icon, title: t(`home.trust.${i + 1}.title`), desc: t(`home.trust.${i + 1}.desc`) }));
  const faqItems = Array.from({ length: FAQ_COUNT }, (_, i) => ({
    q: t(`home.faq.${i + 1}.q`), a: t(`home.faq.${i + 1}.a`),
    link: FAQ_LINKS[i + 1] ? { href: FAQ_LINKS[i + 1], label: t('home.faq.winddown_link') } : undefined,
  }));

  return (
  <>
    {!skipToRealFamilies && (
    /* ═══════════════════ PRODUCT PREVIEW (D1.5) ═══════════════════ */
    <ProductPreview testIdSuffix={testIdSuffix} />
    )}

    {beforeAbout}

    {!skipToRealFamilies && (
    <>
    {/* ═══════════════════ THE PROBLEM (D1.2) ═══════════════════ */}
    <section id="about" className="relative z-10 -mt-2">
      <div className="rounded-t-[2.5rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -20px 60px rgba(0,0,0,0.5)' }}>
        <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-roots.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(212,175,55,0.03) 0%, transparent 60%), linear-gradient(180deg, rgba(14,24,41,0.35) 0%, rgba(14,24,41,0.85) 100%)' }} />
        <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid={`problem-heading${testIdSuffix}`}>
            {t('home.problem.h1')}<br />
            <span className="text-[#d4af37]">{t('home.problem.h2')}</span>
          </h2>
          <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed mb-6">
            {renderCopy(t('home.problem.p1'))}
          </p>
          <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed mb-8">
            {renderCopy(t('home.problem.p2'))}
          </p>
          <button onClick={() => navigateWithFade('/start')} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-sm transition-transform duration-150 active:scale-95"
            style={{ background: '#d4af37', color: '#0B1221', transition: 'all 0.3s' }}>
            {t('home.problem.cta')} <ChevronRight className="w-4 h-4" />
          </button>
          <RevealSection delay={0.2}>
            <p className="mt-10 text-[#d4af37] text-sm lg:text-base italic font-medium">
              {t('home.problem.italic')}
            </p>
          </RevealSection>
          <RevealSection delay={0.3}>
            <div className="grid sm:grid-cols-2 gap-4 mt-12 text-left" data-testid={`scope-block${testIdSuffix}`}>
              <div className="rounded-xl p-5" style={{ background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(212,175,55,0.25)' }}>
                <p className="text-[#d4af37] text-xs font-bold uppercase tracking-wider mb-2">{t('home.problem.for_label')}</p>
                <p className="text-[#e2e8f0] text-sm leading-relaxed">{renderCopy(t('home.problem.for_text'))}</p>
              </div>
              <div className="rounded-xl p-5" style={{ background: 'rgba(15,26,46,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="text-[#8b97ab] text-xs font-bold uppercase tracking-wider mb-2">{t('home.problem.notfor_label')}</p>
                <p className="text-[#a0aec0] text-sm leading-relaxed">{renderCopy(t('home.problem.notfor_text'))}</p>
              </div>
            </div>
          </RevealSection>
        </RevealSection>
      </div>
    </section>

    {/* ═══════════════════ READINESS QUIZ ═══════════════════ */}
    <ReadinessQuiz navigateWithFade={navigateWithFade} testIdSuffix={testIdSuffix} />

    {/* ═══════════════════ WHY FAMILIES DO THIS (D1.3) ═══════════════════ */}
    <section className="relative z-20 -mt-1">
      <div className="rounded-t-[2rem] py-20 lg:py-28 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute inset-0 opacity-[0.45]" style={{ backgroundImage: 'url(/texture-reframe.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.35) 0%, rgba(14,24,41,0.7) 100%)' }} />
        <div className="max-w-[900px] mx-auto px-6 text-center relative z-10">
          <RevealSection>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {t('home.outcomes.h1')}<br />
              <span className="text-[#d4af37]">{t('home.outcomes.h2')}</span>
            </h2>
            <p className="text-[#7b879e] text-base leading-relaxed mb-12 max-w-[760px] mx-auto">
              {renderCopy(t('home.outcomes.intro'))}
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-3 gap-5 mb-12" data-testid={`outcomes-grid${testIdSuffix}`}>
            {outcomes.map(({ icon: Icon, title, desc }, i) => (
              <RevealSection key={i} delay={i * 0.1}>
                <div className="rounded-xl p-6 h-full text-left" style={{ background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(212,175,55,0.2)' }}>
                  <Icon className="w-5 h-5 text-[#d4af37] mb-3" />
                  <h4 className="text-white text-base font-semibold mb-1.5" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h4>
                  <p className="text-[#8b97ab] text-sm leading-relaxed">{desc}</p>
                </div>
              </RevealSection>
            ))}
          </div>
          <RevealSection delay={0.15}>
            <p className="text-white text-base lg:text-lg font-semibold italic leading-relaxed">
              {t('home.outcomes.closing')}
            </p>
          </RevealSection>
        </div>
      </div>
    </section>

    {/* ═══════════════════ THE FOUR PILLARS · TWELVE TOOLS ═══════════════════ */}
    <section id="features" className="relative z-30 -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0f1d30 0%, #132240 50%, #0f1d30 100%)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute top-0 left-0 right-0 h-[280px] sm:hidden opacity-[0.55]" style={{ backgroundImage: 'url(/texture-pillars.jpg)', backgroundSize: 'cover', backgroundPosition: 'center top' }} />
        <div className="absolute top-0 left-0 right-0 h-[280px] sm:hidden" style={{ background: 'linear-gradient(180deg, transparent 40%, #0f1d30 100%)' }} />
        <div className="absolute inset-0 opacity-[0.45] hidden sm:block" style={{ backgroundImage: 'url(/texture-pillars.jpg)', backgroundSize: 'cover', backgroundPosition: 'center top', filter: 'blur(2px)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(15,29,48,0.4) 0%, rgba(15,29,48,0.7) 100%)' }} />
        <div className="max-w-[900px] mx-auto px-6 relative z-10">
          <RevealSection>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white text-center mb-4" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid={`features-heading${testIdSuffix}`}>
              {t('home.pillars.title')}
            </h2>
            <p className="text-[#a0aec0] text-base text-center max-w-[650px] mx-auto mb-16 leading-relaxed" data-testid={`features-subheading${testIdSuffix}`}>
              {renderCopy(t('home.pillars.sub'))}
            </p>
          </RevealSection>

          <div data-testid={`pillars-flow${testIdSuffix}`}>
            {pillarGroups.map((group, gi) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.key} className="mb-14" data-testid={`pillar-group-${group.key}${testIdSuffix}`}>
                  <RevealSection>
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${group.color}1f`, border: `1.5px solid ${group.color}66` }}>
                        <GroupIcon className="w-5 h-5" style={{ color: group.color }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] mb-0.5" style={{ color: group.color }}>{t('home.pillars.pillar_word')} {group.num}</p>
                        <h3 className="text-white text-xl sm:text-2xl font-bold leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid={`pillar-group-${group.key}-label${testIdSuffix}`}>
                          {group.label} <span className="text-[#8b97ab] font-medium text-base sm:text-lg">&mdash; {group.tagline}</span>
                        </h3>
                      </div>
                    </div>
                  </RevealSection>
                  <div className="grid md:grid-cols-2 gap-5">
                    {group.tools.map((item, i) => {
                      const num = toolNum(gi, i);
                      return (
                        <RevealSection key={num} delay={(i % 2) * 0.08} distance={30} duration={0.7}>
                          <ToolCard {...item} num={num} accent={group.color} testId={`pillar-card-${num}${testIdSuffix}`} />
                        </RevealSection>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Beneficiary-side capability — what your family gets, after */}
            <div className="mb-14" data-testid={`after-tool${testIdSuffix}`}>
              <RevealSection>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.18)' }}>
                    <HandHeart className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] mb-0.5 text-[#a0aec0]">{t('home.after.eyebrow')}</p>
                    <h3 className="text-white text-xl sm:text-2xl font-bold leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      {t('home.after.title')} <span className="text-[#8b97ab] font-medium text-base sm:text-lg">&mdash; {t('home.after.tagline')}</span>
                    </h3>
                  </div>
                </div>
              </RevealSection>
              <RevealSection distance={30} duration={0.7}>
                <ToolCard {...afterTool} num="+" accent="#ffffff" testId={`pillar-card-bec${testIdSuffix}`} />
              </RevealSection>
            </div>

            {/* End-state tile */}
            <div className="pt-2">
              <RevealSection delay={0.5}>
                <div className="relative z-20 mx-auto max-w-[640px] rounded-[1.75rem] p-8 lg:p-10 text-center"
                  data-testid={`complete-preparedness-tile${testIdSuffix}`}
                  style={{
                    background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)',
                    border: '2px solid rgba(212,175,55,0.30)',
                    boxShadow: '0 8px 48px rgba(0,0,0,0.35), 0 0 60px rgba(212,175,55,0.08), inset 0 1px 0 rgba(212,175,55,0.06)',
                  }}>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.08))', border: '1.5px solid rgba(212,175,55,0.25)' }}>
                    <Shield className="w-6 h-6 text-[#d4af37]" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold text-[#d4af37] mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    {t('home.handled.title')}
                  </h3>
                  <p className="text-[#a0aec0] text-sm lg:text-base leading-relaxed mb-4">
                    {renderCopy(t('home.handled.text'))}
                  </p>
                  <p className="text-white text-2xl font-semibold italic">
                    {t('home.handled.italic')}
                  </p>
                </div>
              </RevealSection>
            </div>
          </div>
        </div>
      </div>
    </section>
    </>
    )}

    {/* ═══════════════════ PLATFORM FEATURES ═══════════════════ */}
    <section className="relative z-[35] -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute top-0 left-0 right-0 h-[280px] sm:hidden opacity-[0.85]" style={{ backgroundImage: 'url(/texture-families.jpg)', backgroundSize: 'cover', backgroundPosition: 'center 45%' }} />
        <div className="absolute top-0 left-0 right-0 h-[280px] sm:hidden" style={{ background: 'linear-gradient(180deg, transparent 40%, #111F34 100%)' }} />
        <div className="absolute inset-0 opacity-[0.75] hidden sm:block" style={{ backgroundImage: 'url(/texture-families.jpg)', backgroundSize: 'cover', backgroundPosition: 'center 25%' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.1) 0%, rgba(14,24,41,0.4) 100%)' }} />
        <div className="max-w-[1100px] mx-auto px-6 relative z-10">
          <RevealSection>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white text-center mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {t('home.platform.title')}
            </h2>
            <p className="text-[#7b879e] text-base text-center max-w-[650px] mx-auto mb-14 leading-relaxed">
              {renderCopy(t('home.platform.sub'))}
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {platformFeatures.map(({ icon: Icon, title, desc }, i) => (
              <RevealSection key={i} delay={i * 0.06}>
                <div className="rounded-xl p-5 h-full transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/30"
                  style={{ background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(212,175,55,0.35)' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.12)' }}>
                    <Icon className="w-4 h-4 text-[#d4af37]" />
                  </div>
                  <h4 className="text-white text-sm font-semibold mb-1.5">{title}</h4>
                  <p className="text-[#6b7a90] text-xs leading-relaxed">{desc}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </div>
    </section>

    {!skipToRealFamilies && (
    <>
    {/* ═══════════════════ FIVE STEPS ═══════════════════ */}
    <section id="steps" className="relative z-40 -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute top-0 left-0 right-0 h-[320px] sm:hidden opacity-[0.85]" style={{ backgroundImage: 'url(/texture-pathway.jpg)', backgroundSize: '140%', backgroundPosition: 'center 40%' }} />
        <div className="absolute top-0 left-0 right-0 h-[320px] sm:hidden" style={{ background: 'linear-gradient(180deg, transparent 50%, #111F34 100%)' }} />
        <div className="absolute inset-0 opacity-[0.4] hidden sm:block" style={{ backgroundImage: 'url(/texture-pathway.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 30%, rgba(212,175,55,0.03) 0%, transparent 70%)' }} />
        <div className="max-w-[1000px] mx-auto px-6 text-center relative z-10">
          <RevealSection>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {t('home.steps.title')}
            </h2>
            <p className="text-[#7b879e] text-base max-w-[600px] mx-auto mb-14 leading-relaxed">
              {renderCopy(t('home.steps.sub'))}
            </p>
          </RevealSection>
          <StepsShowcase steps={fiveSteps} testIdSuffix={testIdSuffix} />
        </div>
      </div>
    </section>
    </>
    )}

    {/* ═══════════════════ SECURITY ═══════════════════ */}
    <section id="security" className="relative z-50 -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute inset-0 opacity-[0.55]" style={{ backgroundImage: 'url(/texture-family.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.15) 0%, rgba(14,24,41,0.45) 100%)' }} />
        <div className="max-w-[1100px] mx-auto px-6 text-center relative z-10">
          <RevealSection>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {t('home.security.title')}
            </h2>
            <p className="text-[#7b879e] text-base max-w-[700px] mx-auto mb-14 leading-relaxed">
              {renderCopy(t('home.security.sub'))}
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {securityItems.map(({ icon: Icon, text }, i) => (
              <RevealSection key={i} delay={i * 0.08}>
                <div className="rounded-xl p-6 text-center h-full backdrop-blur-sm"
                  style={{ background: 'rgba(14,24,41,0.25)', border: '1.5px solid rgba(255,255,255,0.15)', boxShadow: '0 8px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
                  <Icon className="w-6 h-6 text-[#7b879e] mx-auto mb-4 transition-colors duration-300 group-hover:text-[#d4af37]" />
                  <p className="text-[#94a3b8] text-sm leading-relaxed">{text}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </div>
    </section>

    {!skipToRealFamilies && (
    <>
    {/* ═══════════════════ HONEST TRUST (D1.4) ═══════════════════ */}
    <section className="relative z-[52] -mt-1" id="trust">
      <div className="rounded-t-[2rem] py-20 lg:py-24 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0D1B2A)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="max-w-[1000px] mx-auto px-6 relative z-10">
          <RevealSection>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white text-center mb-4" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid={`trust-heading${testIdSuffix}`}>
              {t('home.trust.title')}
            </h2>
            <p className="text-[#7b879e] text-base text-center max-w-[640px] mx-auto mb-12 leading-relaxed">
              {renderCopy(t('home.trust.sub'))}
            </p>
          </RevealSection>
          <RevealSection delay={0.05}>
            <div className="mb-5"><FounderCard testIdSuffix={testIdSuffix} /></div>
          </RevealSection>
          <RevealSection delay={0.08}>
            <div className="mb-5"><LiveStats testIdSuffix={testIdSuffix} /></div>
          </RevealSection>
          <div className="grid sm:grid-cols-2 gap-5" data-testid={`trust-grid${testIdSuffix}`}>
            {trustItems.map(({ icon: Icon, title, desc }, i) => (
              <RevealSection key={i} delay={i * 0.08}>
                <div className="rounded-xl p-6 h-full flex gap-4" style={{ background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(212,175,55,0.2)' }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.15)' }}>
                    <Icon className="w-5 h-5 text-[#d4af37]" />
                  </div>
                  <div>
                    <h4 className="text-white text-base font-semibold mb-1.5" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h4>
                    <p className="text-[#8b97ab] text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>
          <RevealSection delay={0.1}>
            <div className="mt-12"><TestimonialsBlock testIdSuffix={testIdSuffix} /></div>
          </RevealSection>
          <RevealSection delay={0.12}>
            <div className="mt-10 flex flex-col items-center gap-4">
              <TrustBadges testIdSuffix={testIdSuffix} />
              <LastUpdated testIdSuffix={testIdSuffix} />
            </div>
          </RevealSection>
        </div>
      </div>
    </section>

    {/* ═══════════════════ FAQ (D1.4) ═══════════════════ */}
    <section className="relative z-[55] -mt-1" id="faq">
      <div className="rounded-t-[2rem] py-20 lg:py-24 relative overflow-hidden" style={{ background: '#0D1B2A', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="max-w-[800px] mx-auto px-6 relative z-10">
          <RevealSection>
            <div className="flex items-center gap-3 justify-center mb-8">
              <HelpCircle className="w-6 h-6 text-[#d4af37]" />
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {t('home.faq.title')}
              </h2>
            </div>
          </RevealSection>
          <RevealSection delay={0.1}>
            <div className="rounded-2xl p-6 lg:p-8" style={{ background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {faqItems.map((item, i) => (
                <FaqItem key={i} q={item.q} a={item.a} link={item.link} isOpen={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} index={i} />
              ))}
            </div>
          </RevealSection>
        </div>
        {/* FAQPage JSON-LD for AI discovery */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": faqItems.map(item => ({
            "@type": "Question",
            "name": item.q,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": item.a
            }
          }))
        }) }} />
      </div>
    </section>
    </>
    )}

    {/* ═══════════════════ HOSPICE ═══════════════════ */}
    <section className="relative z-[60] -mt-1">
      <div className="rounded-t-[2rem] py-20 lg:py-24 relative overflow-hidden" style={{ background: '#111F34', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute top-0 left-0 right-0 h-[320px] sm:hidden opacity-[0.5]" style={{ backgroundImage: 'url(/texture-pulse.jpg)', backgroundSize: '160%', backgroundPosition: 'center 88%' }} />
        <div className="absolute top-0 left-0 right-0 h-[320px] sm:hidden" style={{ background: 'linear-gradient(180deg, transparent 55%, #111F34 100%)' }} />
        <div className="absolute inset-0 opacity-[0.3] hidden sm:block" style={{ backgroundImage: 'url(/texture-pulse.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0 hidden sm:block" style={{ background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(17,31,52,0.4) 0%, rgba(17,31,52,0.75) 60%, #111F34 100%)' }} />
        <RevealSection className="max-w-[800px] mx-auto px-6 relative z-10" delay={0.15} distance={60} duration={0.9}>
          <div className="rounded-2xl p-8 lg:p-12 text-center transition-all duration-700 hover:border-[#d4af37]/40 backdrop-blur-md" style={{ border: '1px solid rgba(212,175,55,0.25)', background: 'rgba(212,175,55,0.04)', boxShadow: '0 4px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#d4af37] mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {t('home.hospice.title')}
            </h2>
            <p className="text-[#7b879e] text-base leading-relaxed mb-6">
              {renderCopy(t('home.hospice.p1'))}
            </p>
            <p className="text-white text-base font-semibold italic leading-relaxed">
              {t('home.hospice.p2')}
            </p>
          </div>
        </RevealSection>
        <div className="max-w-[800px] mx-auto px-6 relative z-10 mt-6">
          <div className="grid sm:grid-cols-2 gap-5">
            <RevealSection delay={0.35} distance={50} duration={0.8}>
            <div className="rounded-xl p-6 text-center transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20 backdrop-blur-md" style={{ background: 'rgba(15,26,46,0.55)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <h4 className="text-white text-base font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('home.hospice.mil_title')}</h4>
              <p className="text-[#7b879e] text-sm leading-relaxed">
                {renderCopy(t('home.hospice.mil_text'))}
              </p>
            </div>
            </RevealSection>
            <RevealSection delay={0.45} distance={50} duration={0.8}>
            <div className="rounded-xl p-6 text-center transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20 backdrop-blur-md" style={{ background: 'rgba(15,26,46,0.55)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <h4 className="text-white text-base font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('home.hospice.young_title')}</h4>
              <p className="text-[#7b879e] text-sm leading-relaxed">
                {renderCopy(t('home.hospice.young_text'))}
              </p>
            </div>
            </RevealSection>
          </div>
        </div>
      </div>
    </section>

    {/* ═══════════════════ FINAL CTA ═══════════════════ */}
    <section className="relative z-[70] -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: 'url(/texture-dawn.jpg)', backgroundSize: 'cover', backgroundPosition: 'center 60%' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 50%, rgba(14,24,41,0.3) 0%, rgba(14,24,41,0.75) 100%)' }} />
        <RevealSection className="max-w-[600px] mx-auto px-6 text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {t('home.final.title')}
          </h2>
          <p className="text-[#7b879e] text-base mb-8">
            {renderCopy(t('home.final.text'))}
          </p>
          <button onClick={ctaOverride?.onClick || (() => navigateWithFade('/start'))} className="inline-flex items-center gap-2 px-10 py-4 rounded-lg font-semibold text-base transition-transform duration-150 active:scale-95"
            style={{ background: '#d4af37', color: '#0B1221', transition: 'all 0.3s' }} data-testid={`landing-final-cta${testIdSuffix}`}>
            {ctaOverride?.label || t('home.final.cta')} <ChevronRight className="w-4 h-4" />
          </button>
        </RevealSection>
      </div>
    </section>

    {/* ═══════════════════ FOOTER ═══════════════════ */}
    <footer className="relative z-[80] py-10" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <img src="/carryon-logo.png" alt="CarryOn" className="h-8 opacity-60" />
          <div className="flex items-center justify-center gap-x-6 gap-y-2 flex-wrap">
            {FOOTER_LINKS.map(([key, href]) => (
              <a key={key} href={href} className="text-[#334155] text-xs hover:text-[#7b879e] transition-colors" data-testid={`landing-footer-${key}-link${testIdSuffix}`}>{t(`footer.${key}`)}</a>
            ))}
            <span className="text-[#334155] text-xs">{t('footer.accessibility')}</span>
          </div>
          <div className="text-right text-[#334155] text-xs leading-relaxed">
            <p>{footerInfo.line1}</p>
            <p>{footerInfo.line2}</p>
            <p>{footerInfo.phone}</p>
          </div>
        </div>
        <p className="text-center text-[#2A3C55] text-xs mt-6">&copy; {new Date().getFullYear()} {t('footer.copyright')}</p>
      </div>
    </footer>
  </>
  );
};

export default LandingContent;
