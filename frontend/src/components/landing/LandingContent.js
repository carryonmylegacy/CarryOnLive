import React from 'react';
import { Shield, Users, ChevronRight, Lock as LockIcon, Sparkles, FileCheck, UserCheck, Trash2, ClipboardCheck, MessageSquare, Key, Layers, Smartphone, MapPin, ShieldAlert, ArrowUpDown, SlidersHorizontal, Radio, MessageCircle, DollarSign, BookOpen, Network, Landmark, Heart, Clock } from 'lucide-react';
import { RevealSection } from './RevealSection';
import HomeVoicesStrip from '../HomeVoicesStrip';

/* ── data: 4 pillars × their functions ── */
const PILLARS = [
  {
    num: '01',
    icon: Heart,
    title: 'Legacy',
    abbr: 'People & plan',
    color: '#3B82F6',
    blurb: 'The people who matter, the plan you leave them, and the audit trail of every change you make along the way.',
    functions: [
      { abbr: 'Beneficiaries', name: 'Beneficiaries', desc: 'Name who matters, set what each person sees, and control when they see it.' },
      { abbr: 'MM', name: 'Milestone Messages', desc: 'Video, audio, or written messages delivered at specific future moments \u2014 weddings, graduations, birthdays, the day after.' },
      { abbr: 'FFN', name: 'Friends & Family Notification', desc: 'A coordinated, dignified call-list so the right people hear the news the right way.' },
      { abbr: 'DTS', name: 'Designated Trustee Services', desc: 'Let a trusted attorney, advisor, or family member act on your behalf \u2014 every change logged and undoable.' },
      { abbr: 'EPT', name: 'Estate Plan Timeline', desc: 'A living record of every edit you make to your plan, who made it, and when.' },
    ],
  },
  {
    num: '02',
    icon: LockIcon,
    title: 'Vault',
    abbr: 'Documents & credentials',
    color: '#d4af37',
    blurb: 'Every document and credential your family will actually need \u2014 encrypted, organized, and surfaced by an AI that finds what you missed.',
    functions: [
      { abbr: 'SDV', name: 'Secure Document Vault', desc: 'AES-256 encrypted vault for wills, trusts, deeds, policies, and directives \u2014 released only to the people you name.' },
      { abbr: 'DAV', name: 'Digital Access Vault', desc: 'Passwords, bank logins, password-manager seeds, and crypto keys \u2014 assigned to the right people.' },
      { abbr: 'EGA', name: 'Estate Guardian\u2122 AI', desc: 'An AI estate-law analyst that reads inside your encrypted vault and flags gaps, contradictions, and deadlines you missed.' },
    ],
  },
  {
    num: '03',
    icon: Landmark,
    title: 'Financial',
    abbr: 'Money & structure',
    color: '#22C993',
    blurb: 'The complete money picture and a visual map of every trust, entity, and structure that holds it together.',
    functions: [
      { abbr: 'CFP', name: 'CarryOn Financial Picture', desc: 'A complete, encrypted view of bank accounts, investments, policies, bills, debts, and properties \u2014 with the right contact attached to each.' },
      { abbr: 'CES', name: 'CarryOn Entities & Structures', desc: 'A visual, pan-and-zoom org chart of every trust, LLC, partnership, charitable entity, and the people connected to each.' },
    ],
  },
  {
    num: '04',
    icon: Clock,
    title: 'Preparedness',
    abbr: 'Crisis playbook',
    color: '#B794F6',
    blurb: 'The playbook your family follows on the hardest days \u2014 step-by-step actions, pre-built protocols, and a private channel to coordinate.',
    functions: [
      { abbr: 'IAC', name: 'Immediate Action Checklist', desc: 'A step-by-step playbook for the first hours, days, and weeks \u2014 auto-built from your vault and fully customizable.' },
      { abbr: 'CCP', name: 'CarryOn Contingency Protocols', desc: 'Pre-authored response plans for the scenarios your family might face \u2014 medical, disaster, incapacity, transition.' },
      { abbr: 'ECT', name: 'Estate Communications Tool', desc: 'Phone-number-free family messaging that works from any device \u2014 so coordination keeps working when nothing else does.' },
    ],
  },
];

/* ── data: platform features ── */
const PLATFORM_FEATURES = [
  { icon: UserCheck, title: 'Benefactor & Beneficiary System', desc: 'Enroll the people who matter most. Control what each person can see, access, and manage within your family\'s readiness plan.' },
  { icon: ArrowUpDown, title: 'Succession Hierarchy', desc: 'Ranked beneficiary succession with automatic promotion when a primary can no longer serve. Your chain of responsibility never breaks.' },
  { icon: Layers, title: 'Multi-Estate Support', desc: 'Manage multiple estates under one account — built for blended, extended, and modern families with complex structures.' },
  { icon: Users, title: 'Family Plan Savings', desc: 'Bundle your household for percentage-based discounts on every tier. The more family members you prepare, the more you save.' },
  { icon: ShieldAlert, title: 'Emergency Access', desc: 'Verified protocol for beneficiaries to request vault access when a benefactor is incapacitated. Built for real emergencies.' },
  { icon: SlidersHorizontal, title: 'Pillar Permissions', desc: 'Control exactly what each beneficiary can see across every function in every pillar &mdash; vault, messages, checklists, protocols, and more. Granular, per-person access.' },
  { icon: Smartphone, title: 'Native Mobile App', desc: 'iOS and Android with biometric login, push notifications, and full platform access. Your family\'s readiness goes wherever you go.' },
  { icon: MapPin, title: '50-State Legal Intelligence', desc: 'Estate Guardian calibrates every analysis to your declared state of residence and its specific laws. Personalized, not generic.' },
];

/* ── data: five steps ── */
const FIVE_STEPS = [
  { step: '1', title: 'Enroll Your Family', desc: 'Invite your beneficiaries \u2014 the people who matter most. Set their roles, permissions, and access levels. Your family\'s readiness starts with the people in it.' },
  { step: '2', title: 'Leave Your Messages', desc: 'Record Milestone Messages for the moments you want to be part of \u2014 graduations, weddings, birthdays, or just a Tuesday. Create them over time, as many as you want, delivered exactly as you envision.' },
  { step: '3', title: 'Upload & Analyze', desc: 'Upload your documents into the Secure Document Vault. Estate Guardian\u2122 AI analyzes everything and auto-creates the beginnings of your personalized Immediate Action Checklist \u2014 so your family has a clear plan from day one.' },
  { step: '4', title: 'Build Your Protocols', desc: 'Create CarryOn Contingency Protocols for the scenarios that matter to your family. Connect your documents, checklists, and communication channels into coordinated response plans. Use the Estate Communications Tool to keep everyone in sync.' },
  { step: '5', title: 'Live Your Life', desc: 'Your family\'s readiness infrastructure is built. Save credentials in the Digital Access Vault, organize contacts in Friends & Family Notification, and update your plan whenever life changes. When any challenge comes \u2014 your family will never be left searching.' },
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
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(var(--gold-rgb), 0.03) 0%, transparent 60%), linear-gradient(180deg, rgba(14,24,41,0.35) 0%, rgba(14,24,41,0.85) 100%)' }} />
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
          <button onClick={() => navigateWithFade('/signup')} className="gold-keep-dark inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-sm transition-transform duration-150 active:scale-95"
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

    {/* ═══════════════════ FOUR PILLARS ═══════════════════ */}
    <section id="features" className="relative z-30 -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0f1d30 0%, #132240 50%, #0f1d30 100%)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute top-0 left-0 right-0 h-[280px] sm:hidden opacity-[0.55]" style={{ backgroundImage: 'url(/texture-pillars.jpg)', backgroundSize: 'cover', backgroundPosition: 'center top' }} />
        <div className="absolute top-0 left-0 right-0 h-[280px] sm:hidden" style={{ background: 'linear-gradient(180deg, transparent 40%, #0f1d30 100%)' }} />
        <div className="absolute inset-0 opacity-[0.45] hidden sm:block" style={{ backgroundImage: 'url(/texture-pillars.jpg)', backgroundSize: 'cover', backgroundPosition: 'center top', filter: 'blur(2px)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(15,29,48,0.4) 0%, rgba(15,29,48,0.7) 100%)' }} />
        <div className="max-w-[900px] mx-auto px-6 relative z-10">
          <RevealSection>
            <p className="text-sm uppercase tracking-[0.18em] mb-3 text-center" style={{ color: 'var(--gold)' }}>Total Estate Readiness</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white text-center mb-4 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
              Four Pillars. One Outcome.
            </h2>
            <p className="text-[#a0aec0] text-base text-center max-w-[650px] mx-auto mb-16 leading-relaxed">
              Four pillars hold up everything CarryOn does. Each one bundles a small set of focused functions that work together so your family is genuinely ready &mdash; not scrambling.
            </p>
          </RevealSection>

          <div data-testid={`pillars-flow${testIdSuffix}`}>
            <div className="relative" style={{ marginBottom: '20px' }}>
              <div className="relative z-10 flex flex-col gap-6">
                {PILLARS.map(({ num, icon: Icon, title, abbr, blurb, color, functions }, i) => (
                  <RevealSection key={num} delay={i * 0.06} distance={40} duration={0.8}>
                    <div className="rounded-2xl p-6 lg:p-8 relative overflow-hidden"
                      style={{
                        background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)',
                        border: `1.5px solid ${color}80`,
                        boxShadow: `0 2px 16px rgba(0,0,0,0.15), 0 0 32px ${color}1a`,
                      }}>
                      <div className="flex items-start gap-5 mb-5">
                        <div className="flex flex-col items-center gap-2.5 flex-shrink-0 pt-0.5">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm"
                            style={{ background: `linear-gradient(135deg, ${color}26, ${color}14)`, border: `1.5px solid ${color}66`, color }}>
                            {num}
                          </div>
                          <div className="w-9 h-9 rounded-full flex items-center justify-center"
                            style={{ background: `${color}1a` }}>
                            <Icon className="w-4 h-4" style={{ color: `${color}cc` }} />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-3 mb-2">
                            <h4 className="text-white text-2xl font-semibold leading-tight tracking-tight" style={{ fontFamily: 'var(--serif)' }}>{title}</h4>
                            <span className="text-[#8b97ab] text-xs font-semibold tracking-wider flex-shrink-0 uppercase">{abbr}</span>
                          </div>
                          <p className="text-sm font-medium leading-relaxed" style={{ color: '#e8c972' }}>{blurb}</p>
                        </div>
                      </div>
                      <ul className="space-y-2.5 sm:ml-[68px] ml-0">
                        {functions.map((fn) => (
                          <li key={fn.abbr} className="flex items-start gap-3 text-sm leading-relaxed">
                            <span className="flex-shrink-0 mt-[3px] w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                            <span className="text-[#cbd5e1]">
                              <span className="font-semibold text-white">{fn.name}</span>
                              <span className="text-[#8b97ab] font-medium"> ({fn.abbr})</span>
                              <span className="text-[#a0aec0]"> &mdash; {fn.desc}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
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
                    border: '2px solid rgba(var(--gold-rgb), 0.30)',
                    boxShadow: '0 8px 48px rgba(0,0,0,0.35), 0 0 60px rgba(var(--gold-rgb), 0.08), inset 0 1px 0 rgba(var(--gold-rgb), 0.06)',
                  }}>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ background: 'linear-gradient(135deg, rgba(var(--gold-rgb), 0.15), rgba(var(--gold-rgb), 0.08))', border: '1.5px solid rgba(var(--gold-rgb), 0.25)' }}>
                    <Shield className="w-6 h-6 text-[#d4af37]" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-semibold text-[#d4af37] mb-3 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
                    Total Estate Readiness.
                  </h3>
                  <p className="text-[#a0aec0] text-sm lg:text-base leading-relaxed mb-4">
                    Four pillars. One family. A living system that grows with you, protects what matters most, and ensures that no matter what life brings &mdash; your family is never left searching, wondering, or scrambling.
                  </p>
                  <p className="text-[#8b97ab] text-xs lg:text-sm leading-relaxed mb-4 italic">
                    And when transition comes, your family gets the <span className="font-semibold text-[#cbd5e1]">Beneficiary Estate Concierge (BEC)</span> &mdash; an AI that answers their plain-English questions, grounded only in the documents you chose to share.
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
                  style={{ background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(var(--gold-rgb), 0.35)' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: 'rgba(var(--gold-rgb), 0.1)', border: '1px solid rgba(var(--gold-rgb), 0.12)' }}>
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
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 30%, rgba(var(--gold-rgb), 0.03) 0%, transparent 70%)' }} />
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
                  <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-base" style={{ background: 'rgba(var(--gold-rgb), 0.15)', color: '#d4af37', border: '1px solid rgba(var(--gold-rgb), 0.25)' }}>
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
          <div className="rounded-2xl p-8 lg:p-12 text-center transition-all duration-700 hover:border-[#d4af37]/40 backdrop-blur-md" style={{ border: '1px solid rgba(var(--gold-rgb), 0.25)', background: 'rgba(var(--gold-rgb), 0.04)', boxShadow: '0 4px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
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
          <button onClick={ctaOverride?.onClick || (() => navigateWithFade('/signup'))} className="gold-keep-dark inline-flex items-center gap-2 px-10 py-4 rounded-lg font-semibold text-base transition-transform duration-150 active:scale-95"
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
            <a href="/privacy" className="text-[#94a3b8] text-xs hover:text-[#cbd5e1] transition-colors" data-testid={`landing-footer-privacy-link${testIdSuffix}`}>Privacy Policy</a>
            <a href="/terms" className="text-[#94a3b8] text-xs hover:text-[#cbd5e1] transition-colors" data-testid={`landing-footer-terms-link${testIdSuffix}`}>Terms of Service</a>
            <span className="text-[#94a3b8] text-xs">Accessibility</span>
          </div>
          <div className="text-right text-[#94a3b8] text-xs leading-relaxed">
            <p>{footerInfo.line1}</p>
            <p>{footerInfo.line2}</p>
            <p>{footerInfo.phone}</p>
          </div>
        </div>
        <p className="text-center text-[#94a3b8] text-xs mt-6">&copy; {new Date().getFullYear()} CarryOn Technologies LLC. All rights reserved.</p>
      </div>
    </footer>
  </>
);

export default LandingContent;
