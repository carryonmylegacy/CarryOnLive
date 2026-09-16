import React, { useState } from 'react';
import { Shield, Users, ChevronRight, ChevronDown, Lock as LockIcon, Sparkles, FileCheck, UserCheck, Trash2, ClipboardCheck, MessageSquare, Key, Layers, Smartphone, MapPin, ShieldAlert, ArrowUpDown, SlidersHorizontal, Radio, MessageCircle, HelpCircle, Heart, HandHeart, EyeOff, Download, Clock, Medal } from 'lucide-react';
import { RevealSection } from './RevealSection';
import { ProductPreview } from './ProductPreview';

/* ── data: the eight tools (plain-language title, product name as sub-label) ── */
const PILLARS = [
  { num: '01', icon: MessageSquare, title: 'Messages for the moments you\u2019ll miss', product: 'Milestone Messages',
    bold: 'Your words at their wedding. Your voice on their birthday. Delivered exactly when it matters.',
    desc: 'Record written, audio, or video messages for graduations, births, first homes \u2014 any moment you want to be part of, even if you can\u2019t be there. Add as many as you like, whenever you like.' },
  { num: '02', icon: LockIcon, title: 'Every important document, in one place', product: 'Secure Document Vault',
    bold: 'Wills, trusts, insurance policies, deeds \u2014 encrypted, organized, and shared only with the people you choose.',
    desc: 'Upload the paperwork your family would otherwise tear the house apart looking for. Each family\u2019s vault has its own AES-256 encryption key, and nobody at CarryOn can read what\u2019s inside. Your loved ones see exactly what you allow \u2014 nothing more.' },
  { num: '03', icon: Sparkles, title: 'A second set of eyes on your paperwork', product: 'Estate Guardian\u2122 AI',
    bold: 'An AI review, tuned to your state\u2019s laws, that finds what you missed \u2014 without anyone else reading your documents.',
    desc: 'It looks for contradictions, gaps, outdated provisions, and missing pieces, then pulls out the details your family will need in a hurry: claim phone numbers, executor contacts, filing deadlines. It works entirely inside your encrypted vault.' },
  { num: '04', icon: ClipboardCheck, title: 'What to do first', product: 'Immediate Action Checklist',
    bold: 'A step-by-step guide your family can follow on the hardest days of their lives.',
    desc: 'Started for you from your documents and finished by you. When something happens, your family opens one list and knows what to do, who to call, where every document is, and which deadlines matter. No guessing. No searching.' },
  { num: '05', icon: Radio, title: 'Emergency plans', product: 'Contingency Protocols',
    bold: 'Plans your family builds now for the situations they might face \u2014 ready the moment they\u2019re needed.',
    desc: 'A medical emergency. A natural disaster. A job loss. The passing of a family member. Each plan connects the right people, documents, checklists, and conversations so your family can act together instead of scrambling.' },
  { num: '06', icon: MessageCircle, title: 'Private family messaging', product: 'Estate Communications Tool',
    bold: 'A secure place for the conversations that shouldn\u2019t happen over group text.',
    desc: 'Encrypted, access-controlled messaging between you and the people you\u2019ve chosen, built for sensitive family coordination. When an emergency plan kicks in, this is how everyone stays on the same page \u2014 privately.' },
  { num: '07', icon: Key, title: 'Passwords & accounts', product: 'Digital Access Vault',
    bold: 'Logins, subscriptions, crypto keys, and account numbers \u2014 saved, encrypted, and assigned to the right person.',
    desc: 'The average family has dozens of accounts nobody else can get into. Store them here, decide who gets what, and nothing gets locked away forever or forgotten.' },
  { num: '08', icon: Users, title: 'Who to notify', product: 'Family & Friends Notification',
    bold: 'The people who matter most should never hear important news through the grapevine.',
    desc: 'Keep a list of family, friends, colleagues, and anyone else your loved ones should reach out to. Names, numbers, relationships, and notes \u2014 organized so your family can make the calls without hunting through your phone.' },
];

/* ── data: platform features ── */
const PLATFORM_FEATURES = [
  { icon: UserCheck, title: 'Your people, your rules', desc: 'Invite the people you trust. Decide exactly what each person can see, access, and manage.' },
  { icon: ArrowUpDown, title: 'A backup for your backup', desc: 'Rank who steps in if your first choice can&rsquo;t. If someone can no longer serve, the next person is promoted automatically.' },
  { icon: Layers, title: 'More than one household', desc: 'Manage a parent&rsquo;s affairs alongside your own &mdash; built for blended, extended, and modern families.' },
  { icon: Users, title: 'Family plan savings', desc: 'Bundle your household for a discount on every tier. The more family members you prepare, the more you save.' },
  { icon: ShieldAlert, title: 'Emergency access', desc: 'A verified way for the people you&rsquo;ve chosen to request access if you&rsquo;re incapacitated or unreachable.' },
  { icon: SlidersHorizontal, title: 'Share only what&rsquo;s needed', desc: 'Your spouse sees the accounts. Your attorney sees the will. Your kids see the messages. You decide, per person.' },
  { icon: Smartphone, title: 'On your phone', desc: 'iOS and Android with face or fingerprint login and push alerts. Your plan goes wherever you go.' },
  { icon: MapPin, title: 'Tuned to your state', desc: 'Estate Guardian&trade; AI reviews your documents against the laws of the state you live in &mdash; not generic advice.' },
];

/* ── data: five steps ── */
const FIVE_STEPS = [
  { step: '1', title: 'Add your people', desc: 'Invite the people who matter most \u2014 spouse, kids, a sibling, your attorney. Decide what each of them can see.' },
  { step: '2', title: 'Leave your messages', desc: 'Record messages for the moments you want to be part of \u2014 graduations, weddings, birthdays, or just a Tuesday. Add more whenever you like.' },
  { step: '3', title: 'Upload your documents', desc: 'Add wills, policies, deeds, and account details to your vault. Estate Guardian\u2122 AI reviews them and starts your family\u2019s what-to-do-first list for you.' },
  { step: '4', title: 'Build your plans', desc: 'Set up emergency plans for the situations that worry you. Connect the right people, documents, and checklists so everyone knows their part.' },
  { step: '5', title: 'Live your life', desc: 'Save your passwords and accounts, list who to notify, and update things when life changes. That\u2019s it. Your family will never be left searching.' },
];

/* ── data: security items ── */
const SECURITY_ITEMS = [
  { icon: LockIcon, text: 'AES-256 encryption with a separate key for every family \u2014 nobody at CarryOn can read your documents' },
  { icon: Sparkles, text: 'Estate Guardian\u2122 AI reviews your documents inside your encrypted vault \u2014 nothing leaves it' },
  { icon: Shield, text: 'Two-step sign-in on every login, with trusted-device options for your family' },
  { icon: Users, text: 'Real people \u2014 not algorithms \u2014 confirm a death or incapacity before anything unlocks' },
  { icon: Trash2, text: 'Sensitive records are permanently destroyed after your family\u2019s tasks are complete' },
  { icon: FileCheck, text: 'A full audit trail of who saw what and when, built on a SOC 2 compliance architecture with GDPR data rights' },
];

/* ── data: why families do this (emotional + social outcomes) ── */
const OUTCOMES = [
  { icon: Heart, title: 'Stop carrying it in your head', desc: 'Once it\u2019s written down and shared, you get to stop worrying about the what-ifs.' },
  { icon: HandHeart, title: 'Be the one who made it easy', desc: 'Your family will remember that when everything else was hard, this part wasn\u2019t.' },
  { icon: MessageSquare, title: 'No awkward conversations required', desc: 'Share what each person needs to know, when they need to know it \u2014 on your terms.' },
];

/* ── data: honest trust signals (no fabricated social proof) ── */
const TRUST_ITEMS = [
  { icon: Medal, title: 'Built by a 24-year veteran who put his name on it', desc: 'Barnet Harris founded CarryOn after watching families face a crisis with nothing written down.', link: { href: '/about', label: 'Read his story' } },
  { icon: EyeOff, title: 'Nobody here can read your documents', desc: 'Each family\u2019s vault has its own encryption key. Not support, not engineers, not the founder.' },
  { icon: Download, title: 'Your data is yours. Leave anytime.', desc: 'Export everything whenever you want and cancel from your account. No hoops, no phone calls.' },
  { icon: Clock, title: 'Try it before you pay', desc: 'Every plan starts with an exploration period. Set up your vault, invite one person, and see if it fits.' },
];

/* ── data: FAQ items (D1.4) ── */
const FAQ_ITEMS = [
  { q: 'Does CarryOn replace my estate attorney?', a: 'No. CarryOn organizes everything your attorney creates — wills, trusts, powers of attorney, insurance policies — and flags gaps or contradictions your attorney should review. Think of it as the place your estate plan lives, not a replacement for legal counsel.' },
  { q: 'CarryOn is new. How do I know it will be around?', a: 'Fair question. CarryOn was founded in 2024 and is founder-led. Your documents never depend on us: you can export everything at any time, and we maintain a continuity escrow so access continues even if the company doesn\'t. We would rather earn your trust with those guarantees than with numbers we can\'t back up.' },
  { q: 'What happens to my family\'s documents if CarryOn closes?', a: 'Your data is yours. You can export everything at any time. We also maintain a continuity escrow to ensure document access even in the unlikely event of a business closure. Your family\'s preparedness never depends on a single company.' },
  { q: 'Is hospice access really free?', a: 'Yes — full platform access, no exceptions, for all U.S. citizens and resident aliens enrolled in certified hospice care. No credit card, no timer, no reduced features. This is a core part of our mission.' },
  { q: 'How does military and veteran pricing verification work?', a: 'Select the Military or Veteran tier during signup. We verify service status through a simple document upload — a military ID, DD214, or VA Benefits Letter. Verification is typically completed within 24 hours.' },
  { q: 'Can my family access the vault if I\'m overseas or unreachable?', a: 'Yes. CarryOn\'s Emergency Access protocol lets the people you\'ve designated request vault access when you are incapacitated or unreachable. Every request is verified by our Transition Verification Team — real people, not algorithms.' },
];

/**
 * FaqItem — expandable FAQ question/answer
 */
const FaqItem = ({ q, a, isOpen, onToggle, index }) => (
  <div className="border-b border-white/5">
    <button onClick={onToggle} className="w-full flex items-center justify-between py-5 text-left group" data-testid={`faq-question-${index}`} aria-expanded={isOpen}>
      <span className="text-white text-base font-medium pr-4 group-hover:text-[#d4af37] transition-colors">{q}</span>
      <ChevronDown className={`w-5 h-5 text-[#d4af37] flex-shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
    </button>
    {isOpen && (
      <p className="text-[#7b879e] text-sm leading-relaxed pb-5 pr-8" data-testid={`faq-answer-${index}`}>{a}</p>
    )}
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
const LandingContent = ({ navigateWithFade, footerInfo, testIdSuffix = '', beforeAbout }) => {
  const [openFaq, setOpenFaq] = useState(null);
  return (
  <>
    {/* ═══════════════════ PRODUCT PREVIEW (D1.5) ═══════════════════ */}
    <ProductPreview testIdSuffix={testIdSuffix} />

    {beforeAbout}

    {/* ═══════════════════ THE PROBLEM (D1.2) ═══════════════════ */}
    <section id="about" className="relative z-10 -mt-2">
      <div className="rounded-t-[2.5rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -20px 60px rgba(0,0,0,0.5)' }}>
        <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-roots.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(212,175,55,0.03) 0%, transparent 60%), linear-gradient(180deg, rgba(14,24,41,0.35) 0%, rgba(14,24,41,0.85) 100%)' }} />
        <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid={`problem-heading${testIdSuffix}`}>
            Nobody knows where anything is.<br />
            <span className="text-[#d4af37]">Until now.</span>
          </h2>
          <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed mb-6">
            When something happens, the first days look the same for almost every family: opening drawers, looking for a will that might not exist, calling numbers you&apos;re not sure are right, guessing at passwords. Not because anyone was careless &mdash; because nobody ever wrote it all down in one place.
          </p>
          <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed mb-8">
            CarryOn&#8482; is that place. One secure spot to get your affairs in order &mdash; your documents, your passwords, the people to call, the messages you want to leave, and a clear plan your loved ones can actually follow &mdash; so they can handle what comes next instead of trying to figure it out alone.
          </p>
          <button onClick={() => navigateWithFade('/start')} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-sm transition-transform duration-150 active:scale-95"
            style={{ background: '#d4af37', color: '#0B1221', transition: 'all 0.3s' }}>
            Get Started <ChevronRight className="w-4 h-4" />
          </button>
          <RevealSection delay={0.2}>
            <p className="mt-10 text-[#d4af37] text-sm lg:text-base italic font-medium">
              Useful today &mdash; finding the deed, sharing a policy with your spouse &mdash; and essential on the day your family needs it most.
            </p>
          </RevealSection>
        </RevealSection>
      </div>
    </section>

    {/* ═══════════════════ WHY FAMILIES DO THIS (D1.3) ═══════════════════ */}
    <section className="relative z-20 -mt-1">
      <div className="rounded-t-[2rem] py-20 lg:py-28 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute inset-0 opacity-[0.45]" style={{ backgroundImage: 'url(/texture-reframe.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.35) 0%, rgba(14,24,41,0.7) 100%)' }} />
        <div className="max-w-[900px] mx-auto px-6 text-center relative z-10">
          <RevealSection>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              For your peace of mind today.<br />
              <span className="text-[#d4af37]">For their relief when it counts.</span>
            </h2>
            <p className="text-[#7b879e] text-base leading-relaxed mb-12 max-w-[760px] mx-auto">
              Getting your affairs in order isn&apos;t really about paperwork. It&apos;s about being the parent, spouse, or child who took care of it &mdash; so nobody has to guess what you would have wanted, and nobody has to carry the weight of finding out.
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-3 gap-5 mb-12" data-testid={`outcomes-grid${testIdSuffix}`}>
            {OUTCOMES.map(({ icon: Icon, title, desc }, i) => (
              <RevealSection key={title} delay={i * 0.1}>
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
              CarryOn&#8482; isn&apos;t something you set up and forget. It&apos;s a living plan your family uses today and relies on tomorrow.
            </p>
          </RevealSection>
        </div>
      </div>
    </section>

    {/* ═══════════════════ THE EIGHT TOOLS ═══════════════════ */}
    <section id="features" className="relative z-30 -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0f1d30 0%, #132240 50%, #0f1d30 100%)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute top-0 left-0 right-0 h-[280px] sm:hidden opacity-[0.55]" style={{ backgroundImage: 'url(/texture-pillars.jpg)', backgroundSize: 'cover', backgroundPosition: 'center top' }} />
        <div className="absolute top-0 left-0 right-0 h-[280px] sm:hidden" style={{ background: 'linear-gradient(180deg, transparent 40%, #0f1d30 100%)' }} />
        <div className="absolute inset-0 opacity-[0.45] hidden sm:block" style={{ backgroundImage: 'url(/texture-pillars.jpg)', backgroundSize: 'cover', backgroundPosition: 'center top', filter: 'blur(2px)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(15,29,48,0.4) 0%, rgba(15,29,48,0.7) 100%)' }} />
        <div className="max-w-[900px] mx-auto px-6 relative z-10">
          <RevealSection>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white text-center mb-4" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid={`features-heading${testIdSuffix}`}>
              Everything your family will need. In one place.
            </h2>
            <p className="text-[#a0aec0] text-base text-center max-w-[650px] mx-auto mb-16 leading-relaxed">
              Each piece builds on the last &mdash; so you can start with what matters most and add the rest over time.
            </p>
          </RevealSection>

          <div data-testid={`pillars-flow${testIdSuffix}`}>
            <div className="relative" style={{ marginBottom: '20px' }}>
              {/* Arrow shaft */}
              <div className="absolute left-1/2 -translate-x-1/2 z-0"
                style={{
                  width: '100px',
                  top: '20px',
                  bottom: '-20px',
                  background: 'linear-gradient(180deg, rgba(212,175,55,0.10) 0%, rgba(212,175,55,0.25) 10%, rgba(212,175,55,0.30) 100%)',
                  borderRadius: '50px 50px 0 0',
                }} />
              {/* Arrow head */}
              <div className="absolute left-1/2 -translate-x-1/2 z-0"
                style={{
                  width: '0',
                  height: '0',
                  bottom: '-60px',
                  borderLeft: '70px solid transparent',
                  borderRight: '70px solid transparent',
                  borderTop: '40px solid rgba(212,175,55,0.32)',
                }} />

              <div className="relative z-10 flex flex-col gap-6">
                {PILLARS.map(({ num, icon: Icon, title, product, bold, desc }, i) => (
                  <RevealSection key={num} delay={i * 0.06} distance={40} duration={0.8}>
                    <div className="rounded-2xl p-6 lg:p-8 relative overflow-hidden"
                      data-testid={`pillar-card-${num}${testIdSuffix}`}
                      style={{
                        background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)',
                        border: '1.5px solid rgba(212,175,55,0.45)',
                        boxShadow: '0 2px 16px rgba(0,0,0,0.15)',
                      }}>
                      <div className="flex items-start gap-5">
                        <div className="flex flex-col items-center gap-2.5 flex-shrink-0 pt-0.5">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm"
                            style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.12), rgba(212,175,55,0.06))', border: '1.5px solid rgba(212,175,55,0.25)', color: '#d4af37' }}>
                            {num}
                          </div>
                          <div className="w-9 h-9 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(212,175,55,0.06)' }}>
                            <Icon className="w-4 h-4 text-[#d4af37]/70" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white text-lg font-bold leading-tight mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h4>
                          <span className="text-[#8b97ab] text-xs font-semibold tracking-wide block mb-2.5">{product}</span>
                          <p className="text-sm font-medium mb-2.5 leading-relaxed" style={{ color: '#e8c972' }}>{bold}</p>
                          <p className="text-[#8b97ab] text-sm leading-relaxed">{desc}</p>
                        </div>
                      </div>
                    </div>
                  </RevealSection>
                ))}
              </div>
            </div>

            {/* End-state tile */}
            <div className="pt-10">
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
                    It&apos;s handled.
                  </h3>
                  <p className="text-[#a0aec0] text-sm lg:text-base leading-relaxed mb-4">
                    Eight tools. One family. A living plan that grows with you &mdash; so that whatever life brings, your family is never left searching, wondering, or scrambling. And you get to stop carrying it all in your head.
                  </p>
                  <p className="text-white text-2xl font-semibold italic">
                    They&apos;re ready. Because you prepared.
                  </p>
                </div>
              </RevealSection>
            </div>
          </div>
        </div>
      </div>
    </section>

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
              Built for Real Families.
            </h2>
            <p className="text-[#7b879e] text-base text-center max-w-[650px] mx-auto mb-14 leading-relaxed">
              Beyond the essentials, CarryOn&#8482; is built around how families actually live &mdash; blended, spread out, busy, and human.
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLATFORM_FEATURES.map(({ icon: Icon, title, desc }, i) => (
              <RevealSection key={title} delay={i * 0.06}>
                <div className="rounded-xl p-5 h-full transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/30"
                  style={{ background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(212,175,55,0.35)' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.12)' }}>
                    <Icon className="w-4 h-4 text-[#d4af37]" />
                  </div>
                  <h4 className="text-white text-sm font-semibold mb-1.5" dangerouslySetInnerHTML={{ __html: title }} />
                  <p className="text-[#6b7a90] text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: desc }} />
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </div>
    </section>

    {/* ═══════════════════ FIVE STEPS ═══════════════════ */}
    <section id="steps" className="relative z-40 -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute top-0 left-0 right-0 h-[320px] sm:hidden opacity-[0.85]" style={{ backgroundImage: 'url(/texture-pathway.jpg)', backgroundSize: '140%', backgroundPosition: 'center 40%' }} />
        <div className="absolute top-0 left-0 right-0 h-[320px] sm:hidden" style={{ background: 'linear-gradient(180deg, transparent 50%, #111F34 100%)' }} />
        <div className="absolute inset-0 opacity-[0.4] hidden sm:block" style={{ backgroundImage: 'url(/texture-pathway.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 30%, rgba(212,175,55,0.03) 0%, transparent 70%)' }} />
        <div className="max-w-[800px] mx-auto px-6 text-center relative z-10">
          <RevealSection>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Your affairs in order, in five steps.
            </h2>
            <p className="text-[#7b879e] text-base max-w-[600px] mx-auto mb-14 leading-relaxed">
              You don&apos;t need to do it all at once. Start with what matters most and build the rest over time.
            </p>
          </RevealSection>
          <div className="space-y-12 text-left">
            {FIVE_STEPS.map(({ step, title, desc }, i) => (
              <RevealSection key={step} delay={i * 0.15}>
                <div className="flex gap-5 group">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-base" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.25)' }}>
                    {step}
                  </div>
                  <div>
                    <p className="text-white text-base leading-relaxed">
                      <span className="font-bold">Step {step} &mdash; {title}.</span>{' '}
                      <span className="text-[#7b879e]">{desc}</span>
                    </p>
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </div>
    </section>

    {/* ═══════════════════ SECURITY ═══════════════════ */}
    <section id="security" className="relative z-50 -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute inset-0 opacity-[0.55]" style={{ backgroundImage: 'url(/texture-family.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.15) 0%, rgba(14,24,41,0.45) 100%)' }} />
        <div className="max-w-[1100px] mx-auto px-6 text-center relative z-10">
          <RevealSection>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Your Family&apos;s Privacy Is Non-Negotiable.
            </h2>
            <p className="text-[#7b879e] text-base max-w-[700px] mx-auto mb-14 leading-relaxed">
              The most important things your family will ever share live here. That&apos;s why every layer of CarryOn&#8482; is built to the same standards that protect banks and government systems &mdash; because your family deserves nothing less.
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SECURITY_ITEMS.map(({ icon: Icon, text }, i) => (
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

    {/* ═══════════════════ HONEST TRUST (D1.4) ═══════════════════ */}
    <section className="relative z-[52] -mt-1" id="trust">
      <div className="rounded-t-[2rem] py-20 lg:py-24 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0D1B2A)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="max-w-[1000px] mx-auto px-6 relative z-10">
          <RevealSection>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white text-center mb-4" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid={`trust-heading${testIdSuffix}`}>
              We&apos;re new. Here&apos;s what we can promise.
            </h2>
            <p className="text-[#7b879e] text-base text-center max-w-[640px] mx-auto mb-12 leading-relaxed">
              You won&apos;t find invented testimonials or made-up customer counts here. When our first families are ready to speak, you&apos;ll see them. Until then, these are the things we can stand behind today.
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-2 gap-5" data-testid={`trust-grid${testIdSuffix}`}>
            {TRUST_ITEMS.map(({ icon: Icon, title, desc, link }, i) => (
              <RevealSection key={title} delay={i * 0.08}>
                <div className="rounded-xl p-6 h-full flex gap-4" style={{ background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(212,175,55,0.2)' }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.15)' }}>
                    <Icon className="w-5 h-5 text-[#d4af37]" />
                  </div>
                  <div>
                    <h4 className="text-white text-base font-semibold mb-1.5" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h4>
                    <p className="text-[#8b97ab] text-sm leading-relaxed">{desc}{link && <> <a href={link.href} className="text-[#d4af37] hover:text-[#fcd34d] underline underline-offset-4" data-testid={`trust-founder-link${testIdSuffix}`}>{link.label}</a></>}</p>
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>
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
                Common Questions
              </h2>
            </div>
          </RevealSection>
          <RevealSection delay={0.1}>
            <div className="rounded-2xl p-6 lg:p-8" style={{ background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {FAQ_ITEMS.map((item, i) => (
                <FaqItem key={i} q={item.q} a={item.a} isOpen={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} index={i} />
              ))}
            </div>
          </RevealSection>
        </div>
        {/* FAQPage JSON-LD for AI discovery */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": FAQ_ITEMS.map(item => ({
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
              Free for Every American in Hospice Care.
            </h2>
            <p className="text-[#7b879e] text-base leading-relaxed mb-6">
              At any given time, over 300,000 Americans are in hospice &mdash; and the vast majority have no plan in place for their families. CarryOn&#8482; is offered at no cost to all U.S. citizens and resident aliens enrolled in certified hospice care. Full platform access. No exceptions.
            </p>
            <p className="text-white text-base font-semibold italic leading-relaxed">
              No one should be denied the ability to get their affairs in order and prepare their family &mdash; simply because of their circumstances.
            </p>
          </div>
        </RevealSection>
        <div className="max-w-[800px] mx-auto px-6 relative z-10 mt-6">
          <div className="grid sm:grid-cols-2 gap-5">
            <RevealSection delay={0.35} distance={50} duration={0.8}>
            <div className="rounded-xl p-6 text-center transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20 backdrop-blur-md" style={{ background: 'rgba(15,26,46,0.55)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <h4 className="text-white text-base font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Military &amp; Veteran Families</h4>
              <p className="text-[#7b879e] text-sm leading-relaxed">
                Reduced pricing for active-duty service members, veterans, and their families. Your service prepared you for everything &mdash; let CarryOn help prepare your family for anything else.
              </p>
            </div>
            </RevealSection>
            <RevealSection delay={0.45} distance={50} duration={0.8}>
            <div className="rounded-xl p-6 text-center transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20 backdrop-blur-md" style={{ background: 'rgba(15,26,46,0.55)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <h4 className="text-white text-base font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>New Adult Tier (18&ndash;25)</h4>
              <p className="text-[#7b879e] text-sm leading-relaxed">
                A dedicated tier for young Americans just starting out. Because getting your affairs in order shouldn&apos;t start when you think you need it &mdash; it should start the day you&apos;re responsible for yourself.
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
            Start getting your affairs in order today.
          </h2>
          <p className="text-[#7b879e] text-base mb-8">
            Upload one document and invite one person &mdash; that&apos;s a real start. Whatever comes next, your family will know where to look, who to call, and what to do.
          </p>
          <button onClick={() => navigateWithFade('/start')} className="inline-flex items-center gap-2 px-10 py-4 rounded-lg font-semibold text-base transition-transform duration-150 active:scale-95"
            style={{ background: '#d4af37', color: '#0B1221', transition: 'all 0.3s' }}>
            Start Now <ChevronRight className="w-4 h-4" />
          </button>
        </RevealSection>
      </div>
    </section>

    {/* ═══════════════════ FOOTER ═══════════════════ */}
    <footer className="relative z-[80] py-10" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <img src="/carryon-logo.png" alt="CarryOn" className="h-8 opacity-60" />
          <div className="flex items-center gap-6">
            <a href="/pricing" className="text-[#334155] text-xs hover:text-[#7b879e] transition-colors" data-testid={`landing-footer-pricing-link${testIdSuffix}`}>Pricing</a>
            <a href="/about" className="text-[#334155] text-xs hover:text-[#7b879e] transition-colors" data-testid={`landing-footer-about-link${testIdSuffix}`}>About</a>
            <a href="/privacy" className="text-[#334155] text-xs hover:text-[#7b879e] transition-colors" data-testid={`landing-footer-privacy-link${testIdSuffix}`}>Privacy Policy</a>
            <a href="/terms" className="text-[#334155] text-xs hover:text-[#7b879e] transition-colors" data-testid={`landing-footer-terms-link${testIdSuffix}`}>Terms of Service</a>
            <span className="text-[#334155] text-xs">Accessibility</span>
          </div>
          <div className="text-right text-[#334155] text-xs leading-relaxed">
            <p>{footerInfo.line1}</p>
            <p>{footerInfo.line2}</p>
            <p>{footerInfo.phone}</p>
          </div>
        </div>
        <p className="text-center text-[#2A3C55] text-xs mt-6">&copy; {new Date().getFullYear()} CarryOn Technologies LLC. All rights reserved.</p>
      </div>
    </footer>
  </>
  );
};

export default LandingContent;
