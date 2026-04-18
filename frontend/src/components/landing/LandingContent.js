import React from 'react';
import { Shield, Users, ChevronRight, Lock as LockIcon, Sparkles, FileCheck, UserCheck, Trash2, ClipboardCheck, MessageSquare, Key, Layers, Smartphone, MapPin, ShieldAlert, ArrowUpDown, SlidersHorizontal, Radio, MessageCircle, DollarSign } from 'lucide-react';
import { RevealSection } from './RevealSection';
import HomeVoicesStrip from '../HomeVoicesStrip';

/* ── data: 8 pillars ── */
const PILLARS = [
  { num: '01', icon: MessageSquare, title: 'Milestone Messages', abbr: 'MM',
    bold: 'Your words at their wedding. Your voice on their birthday. Your love \u2014 delivered exactly when it matters.',
    desc: 'Record written, audio, or video messages for the milestones you want to be part of \u2014 even if you can\'t be there. Graduations, births, first homes, or any moment you choose. Create them infinitely over time, and they\'re delivered exactly as you envision.' },
  { num: '02', icon: LockIcon, title: 'Secure Document Vault', abbr: 'SDV',
    bold: 'Every will, trust, policy, and deed \u2014 encrypted, organized, and accessible to the right people at the right time.',
    desc: 'Upload your most critical family documents into a per-estate encrypted vault with AES-256 encryption and Triple Lock protection. Your beneficiaries access exactly what you authorize \u2014 and your documents become the foundation that powers everything else.' },
  { num: '03', icon: Sparkles, title: 'Estate Guardian\u2122 AI', abbr: 'EGA',
    bold: 'An AI analyst trained on U.S. law across all 50 states \u2014 working inside your encrypted vault to find what you missed.',
    desc: 'EGA analyzes your uploaded documents for contradictions, gaps, outdated provisions, and missing pieces. It identifies critical details \u2014 claim phone numbers, executor contacts, filing deadlines \u2014 and auto-populates the beginnings of your personalized action plan. No team reads your documents. The AI works entirely within your encryption.' },
  { num: '04', icon: ClipboardCheck, title: 'Immediate Action Checklist', abbr: 'IAC',
    bold: 'A step-by-step guide your family can follow on the hardest days of their lives.',
    desc: 'Partially auto-created by EGA from your documents and fully customizable by you. When a crisis hits, your family opens the IAC and knows exactly what to do, who to call, where to find every document, and what deadlines matter. No guessing. No searching. No overwhelm.' },
  { num: '05', icon: Radio, title: 'CarryOn Contingency Protocols', abbr: 'CCP',
    bold: 'Response plans your family can build now for the scenarios they might face \u2014 ready to activate at a moment\u2019s notice.',
    desc: 'Build contingency protocols for any situation: medical emergencies, natural disasters, financial disruptions, or the passing of a family member. The Tap-to-Create Wizard walks you through building a protocol in minutes \u2014 connecting your people, your documents, your checklists, and your communication channels into one coordinated plan your family can execute together.' },
  { num: '06', icon: MessageCircle, title: 'Estate Communications Tool', abbr: 'ECT',
    bold: 'Secure, private family messaging that doesn\u2019t depend on a phone number \u2014 so your family stays connected no matter what.',
    desc: 'Unlike every mainstream chat app, ECT doesn\u2019t rely on your phone number or a specific device. Log in from a friend\u2019s phone, a library computer, or a FEMA trailer after a disaster \u2014 and pick up exactly where you left off, in perfect sync with your family. End-to-end encrypted group and direct messaging with voice messages, image sharing, emoji reactions, location sharing, and message pinning. When a contingency protocol activates, ECT is how your family coordinates \u2014 privately, securely, and from anywhere.' },
  { num: '07', icon: Key, title: 'Digital Access Vault', abbr: 'DAV',
    bold: 'Passwords, accounts, crypto keys, and digital credentials \u2014 saved, encrypted, and assigned to the right people.',
    desc: 'The modern family has dozens of digital accounts, subscriptions, financial platforms, and access credentials that need to be passed down and organized. DAV stores them all in your encrypted vault, assigned to specific beneficiaries, so nothing is lost and nothing is forgotten.' },
  { num: '08', icon: Users, title: 'Family & Friends Notification', abbr: 'FFN',
    bold: 'The people who matter most should never hear important news through the grapevine.',
    desc: 'Build a personalized notification list of family, friends, colleagues, and anyone your beneficiaries should contact during a transition or emergency. Names, phone numbers, relationships, and special notes \u2014 all organized and ready so your family can coordinate outreach without scrambling.' },
  { num: '09', icon: DollarSign, title: 'CarryOn Financial Picture', abbr: 'CFP',
    bold: 'Your family\u2019s complete financial picture \u2014 linked, monitored, and ready for the people who\u2019ll need it most.',
    desc: 'Link your bank accounts, investment portfolios, insurance policies, and financial assets into one secure, encrypted view. Track balances, flag anomalies, and ensure your beneficiaries know exactly where every dollar is and who to contact \u2014 without having to search through file cabinets, email threads, or scattered logins. When the time comes, your family sees the full financial picture instantly.' },
];

/* ── data: platform features ── */
const PLATFORM_FEATURES = [
  { icon: UserCheck, title: 'Benefactor & Beneficiary System', desc: 'Enroll the people who matter most. Control what each person can see, access, and manage within your family\'s readiness plan.' },
  { icon: ArrowUpDown, title: 'Succession Hierarchy', desc: 'Ranked beneficiary succession with automatic promotion when a primary can no longer serve. Your chain of responsibility never breaks.' },
  { icon: Layers, title: 'Multi-Estate Support', desc: 'Manage multiple estates under one account — built for blended, extended, and modern families with complex structures.' },
  { icon: Users, title: 'Family Plan Savings', desc: 'Bundle your household for percentage-based discounts on every tier. The more family members you prepare, the more you save.' },
  { icon: ShieldAlert, title: 'Emergency Access', desc: 'Verified protocol for beneficiaries to request vault access when a benefactor is incapacitated. Built for real emergencies.' },
  { icon: SlidersHorizontal, title: 'Section Permissions', desc: 'Control exactly what each beneficiary can see — vault, messages, checklists, protocols, and more. Granular, per-person access.' },
  { icon: Smartphone, title: 'Native Mobile App', desc: 'iOS and Android with biometric login, push notifications, and full platform access. Your family\'s readiness goes wherever you go.' },
  { icon: MapPin, title: '50-State Legal Intelligence', desc: 'Estate Guardian calibrates every analysis to your declared state of residence and its specific laws. Personalized, not generic.' },
];

/* ── data: five steps ── */
const FIVE_STEPS = [
  { step: '1', title: 'Enroll Your Family', desc: 'Invite your beneficiaries \u2014 the people who matter most. Set their roles, permissions, and access levels. Your family\'s readiness starts with the people in it.' },
  { step: '2', title: 'Leave Your Messages', desc: 'Record Milestone Messages for the moments you want to be part of \u2014 graduations, weddings, birthdays, or just a Tuesday. Create them over time, as many as you want, delivered exactly as you envision.' },
  { step: '3', title: 'Upload & Analyze', desc: 'Upload your documents into the Secure Document Vault. Estate Guardian\u2122 AI analyzes everything and auto-creates the beginnings of your personalized Immediate Action Checklist \u2014 so your family has a clear plan from day one.' },
  { step: '4', title: 'Build Your Protocols', desc: 'Create CarryOn Contingency Protocols for the scenarios that matter to your family. Connect your documents, checklists, and communication channels into coordinated response plans. Use the Estate Communications Tool to keep everyone in sync.' },
  { step: '5', title: 'Live Your Life', desc: 'Your family\'s readiness infrastructure is built. Save credentials in the Digital Access Vault, organize contacts in Family & Friends Notification, and update your plan whenever life changes. When any challenge comes \u2014 your family will never be left searching.' },
];

/* ── data: security items ── */
const SECURITY_ITEMS = [
  { icon: LockIcon, text: 'AES-256 per-estate encryption \u2014 your family\'s data is never accessed by our team' },
  { icon: Sparkles, text: 'Estate Guardian\u2122 AI operates entirely within your encrypted vault \u2014 no data ever leaves' },
  { icon: Shield, text: 'Two-factor authentication on every login with device trust options for your family' },
  { icon: Users, text: 'Transition verification by a human team \u2014 not algorithms, not AI. Real people confirming real events.' },
  { icon: Trash2, text: 'Post-execution record destruction \u2014 sensitive records are permanently eliminated after tasks complete' },
  { icon: FileCheck, text: 'SOC 2 compliance architecture with full audit trail and GDPR data rights built in' },
];

/**
 * LandingContent — all shared marketing sections rendered below the hero.
 *
 * @param {Function} navigateWithFade  — (path) => void
 * @param {{ line1: string, line2: string, phone: string }} footerInfo
 * @param {string}  [testIdSuffix='']  — appended to data-testid values (e.g. '-home')
 * @param {React.ReactNode} [beforeAbout]  — optional slot rendered before the About section (e.g. video)
 */
const LandingContent = ({ navigateWithFade, footerInfo, testIdSuffix = '', beforeAbout, skipToRealFamilies = false, ctaOverride }) => (
  <>
    {beforeAbout}

    {!skipToRealFamilies && (
    <>
    {/* ═══════════════════ ABOUT ═══════════════════ */}
    <section id="about" className="relative z-10 -mt-2">
      <div className="rounded-t-[2.5rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -20px 60px rgba(0,0,0,0.5)' }}>
        <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-roots.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(212,175,55,0.03) 0%, transparent 60%), linear-gradient(180deg, rgba(14,24,41,0.35) 0%, rgba(14,24,41,0.85) 100%)' }} />
        <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-6 leading-tight tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
            More Than Estate Planning.<br />
            <span className="text-[#d4af37]">Total Family Preparedness.</span>
          </h2>
          <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed mb-6">
            Life doesn&apos;t wait for the perfect moment to throw a challenge your way. A sudden illness. A natural disaster. An unexpected loss. The families that get through it aren&apos;t the ones who saw it coming &mdash; they&apos;re the ones who were prepared.
          </p>
          <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed mb-8">
            CarryOn&#8482; is the first complete digital family preparedness platform &mdash; a secure place to organize your documents, leave messages for the people you love, build action plans for any scenario, and ensure that no matter what happens, your family has everything they need to maintain continuity, stay connected, and move forward together.
          </p>
          <button onClick={() => navigateWithFade('/signup')} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-sm transition-transform duration-150 active:scale-95"
            style={{ background: '#d4af37', color: '#0B1221', transition: 'all 0.3s' }}>
            Get Started <ChevronRight className="w-4 h-4" />
          </button>
          <RevealSection delay={0.2}>
            <p className="mt-10 text-[#d4af37] text-sm lg:text-base italic font-medium">
              CarryOn&#8482; helps your family stay organized, connected, and prepared &mdash; not just for the unexpected, but for everything in between. It&apos;s just as valuable today as it is decades from now.
            </p>
          </RevealSection>
        </RevealSection>
      </div>
    </section>

    {/* ═══════════════════ REFRAME ═══════════════════ */}
    <section className="relative z-20 -mt-1">
      <div className="rounded-t-[2rem] py-20 lg:py-28 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute inset-0 opacity-[0.45]" style={{ backgroundImage: 'url(/texture-reframe.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.35) 0%, rgba(14,24,41,0.7) 100%)' }} />
        <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-white mb-6 leading-tight tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
            Valuable Right Now.<br />
            <span className="text-[#d4af37]">Essential When It Matters Most.</span>
          </h2>
          <p className="text-[#7b879e] text-base leading-relaxed mb-8">
            Family preparedness isn&apos;t something you do once and forget. It&apos;s a living system that grows with your family. Every document you upload, every message you record, every plan you build &mdash; it all becomes part of a readiness infrastructure your family can rely on through any of life&apos;s biggest challenges. A job loss. A health crisis. A move across the country. The passing of someone you love. CarryOn&#8482; ensures your family never has to wonder where to look, who to call, or what to do next.
          </p>
          <RevealSection delay={0.15}>
            <p className="text-white text-base lg:text-lg font-semibold italic leading-relaxed">
              CarryOn&#8482; isn&apos;t something you set up and forget. It&apos;s a living system your family uses today &mdash; to organize, coordinate, and communicate &mdash; and relies on tomorrow when it matters most.
            </p>
          </RevealSection>
        </RevealSection>
      </div>
    </section>

    {/* ═══════════════════ EIGHT PILLARS ═══════════════════ */}
    <section id="features" className="relative z-30 -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0f1d30 0%, #132240 50%, #0f1d30 100%)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute top-0 left-0 right-0 h-[280px] sm:hidden opacity-[0.55]" style={{ backgroundImage: 'url(/texture-pillars.jpg)', backgroundSize: 'cover', backgroundPosition: 'center top' }} />
        <div className="absolute top-0 left-0 right-0 h-[280px] sm:hidden" style={{ background: 'linear-gradient(180deg, transparent 40%, #0f1d30 100%)' }} />
        <div className="absolute inset-0 opacity-[0.45] hidden sm:block" style={{ backgroundImage: 'url(/texture-pillars.jpg)', backgroundSize: 'cover', backgroundPosition: 'center top', filter: 'blur(2px)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(15,29,48,0.4) 0%, rgba(15,29,48,0.7) 100%)' }} />
        <div className="max-w-[900px] mx-auto px-6 relative z-10">
          <RevealSection>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white text-center mb-4 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
              Nine Pillars of Family Readiness.
            </h2>
            <p className="text-[#a0aec0] text-base text-center max-w-[650px] mx-auto mb-16 leading-relaxed">
              Each pillar builds on the last &mdash; creating a complete family preparedness architecture, one step at a time.
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
                {PILLARS.map(({ num, icon: Icon, title, abbr, bold, desc }, i) => (
                  <RevealSection key={num} delay={i * 0.06} distance={40} duration={0.8}>
                    <div className="rounded-2xl p-6 lg:p-8 relative overflow-hidden"
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
                          <div className="flex items-baseline gap-3 mb-2">
                            <h4 className="text-white text-xl font-semibold leading-tight tracking-tight" style={{ fontFamily: 'var(--serif)' }}>{title}</h4>
                            <span className="text-[#8b97ab] text-xs font-semibold tracking-wider flex-shrink-0">{abbr}</span>
                          </div>
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
                  <h3 className="text-2xl sm:text-3xl font-semibold text-[#d4af37] mb-3 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
                    Comprehensive Family Preparedness.
                  </h3>
                  <p className="text-[#a0aec0] text-sm lg:text-base leading-relaxed mb-4">
                    Nine pillars. One family. A living system that grows with you, protects what matters most, and ensures that no matter what life brings &mdash; your family is never left searching, wondering, or scrambling.
                  </p>
                  <p className="text-white text-2xl font-medium italic" style={{ fontFamily: 'var(--serif)' }}>
                    They&apos;re ready. Because you prepared.
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
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white text-center mb-4 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
              Built for Real Families.
            </h2>
            <p className="text-[#7b879e] text-base text-center max-w-[650px] mx-auto mb-14 leading-relaxed">
              Beyond the core pillars, CarryOn&#8482; gives your family a complete readiness infrastructure with tools designed for how modern families actually live.
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
                  <h4 className="text-white text-sm font-semibold mb-1.5">{title}</h4>
                  <p className="text-[#6b7a90] text-xs leading-relaxed">{desc}</p>
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
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-5 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
              Family Readiness in Five Steps.
            </h2>
            <p className="text-[#7b879e] text-base max-w-[600px] mx-auto mb-14 leading-relaxed">
              You don&apos;t need to do it all at once. Start with what matters most and build your family&apos;s readiness over time.
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
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-4 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
              Your Family&apos;s Privacy Is Non-Negotiable.
            </h2>
            <p className="text-[#7b879e] text-base max-w-[700px] mx-auto mb-14 leading-relaxed">
              The most important things your family will ever share live on this platform. That&apos;s why every layer of CarryOn&#8482; is built with the same security standards that protect financial institutions and government systems &mdash; because your family deserves nothing less.
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

    {/* ═══════════════════ HOSPICE ═══════════════════ */}
    <section className="relative z-[60] -mt-1">
      <div className="rounded-t-[2rem] py-20 lg:py-24 relative overflow-hidden" style={{ background: '#111F34', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute top-0 left-0 right-0 h-[320px] sm:hidden opacity-[0.5]" style={{ backgroundImage: 'url(/texture-pulse.jpg)', backgroundSize: '160%', backgroundPosition: 'center 88%' }} />
        <div className="absolute top-0 left-0 right-0 h-[320px] sm:hidden" style={{ background: 'linear-gradient(180deg, transparent 55%, #111F34 100%)' }} />
        <div className="absolute inset-0 opacity-[0.3] hidden sm:block" style={{ backgroundImage: 'url(/texture-pulse.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0 hidden sm:block" style={{ background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(17,31,52,0.4) 0%, rgba(17,31,52,0.75) 60%, #111F34 100%)' }} />
        <RevealSection className="max-w-[800px] mx-auto px-6 relative z-10" delay={0.15} distance={60} duration={0.9}>
          <div className="rounded-2xl p-8 lg:p-12 text-center transition-all duration-700 hover:border-[#d4af37]/40 backdrop-blur-md" style={{ border: '1px solid rgba(212,175,55,0.25)', background: 'rgba(212,175,55,0.04)', boxShadow: '0 4px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-[#d4af37] mb-5 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
              Free for Every American in Hospice Care.
            </h2>
            <p className="text-[#7b879e] text-base leading-relaxed mb-6">
              At any given time, over 300,000 Americans are in hospice &mdash; and the vast majority have no plan in place for their families. CarryOn&#8482; is offered at no cost to all U.S. citizens and resident aliens enrolled in certified hospice care. Full platform access. No exceptions.
            </p>
            <p className="text-white text-base font-semibold italic leading-relaxed">
              No one should be denied the ability to organize their affairs and prepare their family &mdash; simply because of their circumstances.
            </p>
          </div>
        </RevealSection>
        <div className="max-w-[800px] mx-auto px-6 relative z-10 mt-6">
          <div className="grid sm:grid-cols-2 gap-5">
            <RevealSection delay={0.35} distance={50} duration={0.8}>
            <div className="rounded-xl p-6 text-center transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20 backdrop-blur-md" style={{ background: 'rgba(15,26,46,0.55)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <h4 className="text-white text-base font-bold mb-2" style={{ fontFamily: 'var(--sans)' }}>Military &amp; Veteran Families</h4>
              <p className="text-[#7b879e] text-sm leading-relaxed">
                Reduced pricing for active-duty service members, veterans, and their families. Your service prepared you for everything &mdash; let CarryOn help prepare your family for anything else.
              </p>
            </div>
            </RevealSection>
            <RevealSection delay={0.45} distance={50} duration={0.8}>
            <div className="rounded-xl p-6 text-center transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20 backdrop-blur-md" style={{ background: 'rgba(15,26,46,0.55)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <h4 className="text-white text-base font-bold mb-2" style={{ fontFamily: 'var(--sans)' }}>New Adult Tier (18&ndash;25)</h4>
              <p className="text-[#7b879e] text-sm leading-relaxed">
                A dedicated tier for young Americans just starting out. Because family preparedness shouldn&apos;t start when you think you need it &mdash; it should start the day you&apos;re responsible for yourself.
              </p>
            </div>
            </RevealSection>
          </div>
        </div>
      </div>
    </section>

    {/* ═══════════════════ VOICES (auto-hides if no featured quotes) ═══════════════════ */}
    <HomeVoicesStrip />

    {/* ═══════════════════ FINAL CTA ═══════════════════ */}
    <section className="relative z-[70] -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: 'url(/texture-dawn.jpg)', backgroundSize: 'cover', backgroundPosition: 'center 60%' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 50%, rgba(14,24,41,0.3) 0%, rgba(14,24,41,0.75) 100%)' }} />
        <RevealSection className="max-w-[600px] mx-auto px-6 text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-5 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
            Readiness Starts Today.
          </h2>
          <p className="text-[#7b879e] text-base mb-8">
            Join the families who are choosing preparedness over uncertainty. Whatever comes next &mdash; your family will be ready.
          </p>
          <button onClick={ctaOverride?.onClick || (() => navigateWithFade('/signup'))} className="inline-flex items-center gap-2 px-10 py-4 rounded-lg font-semibold text-base transition-transform duration-150 active:scale-95"
            style={{ background: '#d4af37', color: '#0B1221', transition: 'all 0.3s' }}>
            {ctaOverride?.label || 'Start Your Free Trial'} <ChevronRight className="w-4 h-4" />
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

export default LandingContent;
