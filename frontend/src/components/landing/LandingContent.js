import React from 'react';
import { Shield, Users, ChevronRight, Lock as LockIcon, Sparkles, FileCheck, UserCheck, Layers, Smartphone, MapPin, ShieldAlert, ArrowUpDown, SlidersHorizontal, Landmark, Heart, Clock, Sun, LifeBuoy, Sunrise, Activity, Plane, Briefcase, CloudRain, Truck } from 'lucide-react';
import { RevealSection } from './RevealSection';
import HomeVoicesStrip from '../HomeVoicesStrip';

/* ── data: the continuity timeline (before / during / after) ── */
const TIMELINE = [
  {
    phase: 'Before',
    tag: 'While life is good',
    icon: Sun,
    color: '#3B82F6',
    body: 'You organize what matters, name the people who\u2019ll need access, record the messages you want them to have, and let CarryOn\u2019s AI find the gaps before they become emergencies. Quiet, ongoing, at your own pace.',
  },
  {
    phase: 'During',
    tag: 'When something happens',
    icon: LifeBuoy,
    color: '#d4af37',
    body: 'A clear, step-by-step plan tells your family exactly what to do first \u2014 who to contact, what\u2019s urgent, what can wait \u2014 with the right documents already attached and a private channel to coordinate, even from different cities.',
  },
  {
    phase: 'After',
    tag: 'Moving forward',
    icon: Sunrise,
    color: '#22C993',
    body: 'Responsibilities transfer cleanly, beneficiaries get exactly what you chose to share, and an AI concierge answers their questions in plain English. The family keeps going \u2014 informed, connected, and supported.',
  },
];

/* ── data: the disruptions one system covers ── */
const DISRUPTIONS = [
  { icon: Activity, label: 'A sudden hospital stay' },
  { icon: Plane, label: 'A military deployment' },
  { icon: Briefcase, label: 'Extended travel or absence' },
  { icon: CloudRain, label: 'A hurricane or evacuation' },
  { icon: ShieldAlert, label: 'Sudden incapacity' },
  { icon: Heart, label: 'Supporting an aging parent' },
  { icon: Truck, label: 'A move across the country' },
  { icon: Sunrise, label: 'Death & estate transition' },
];

/* ── data: the questions every family hopes they never answer in a hurry ── */
const QUESTIONS = [
  { q: 'Who needs to be reached \u2014 and who can act for me?', a: 'A coordinated, dignified notification list, and the right person already empowered to step in.', pillar: 'People', color: '#3B82F6' },
  { q: 'What will they actually need \u2014 and where is it?', a: 'Documents, accounts, and credentials \u2014 surfaced the moment they\u2019re needed, and no sooner.', pillar: 'Access', color: '#d4af37' },
  { q: 'Where\u2019s the money, and what\u2019s owed?', a: 'The full financial picture \u2014 accounts, policies, bills, and property \u2014 each with the right contact attached.', pillar: 'Money', color: '#22C993' },
  { q: 'What should they do first?', a: 'A step-by-step checklist tailored to your state, with a private channel to keep everyone in sync.', pillar: 'Action', color: '#B794F6' },
];

/* ── data: 4 pillars × their functions (names are platform law; framed as outcomes) ── */
const PILLARS = [
  {
    num: '01',
    icon: Heart,
    title: 'People',
    abbr: 'Know who matters',
    color: '#3B82F6',
    blurb: 'Name your people, decide what each one sees and when, and make sure the right person can act \u2014 with a living record of every decision.',
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
    title: 'Access',
    abbr: 'Within reach, not a moment sooner',
    color: '#d4af37',
    blurb: 'Everything your family will need to act \u2014 documents, credentials, and an AI that reads your plan to catch what you missed \u2014 released only to the people you choose.',
    functions: [
      { abbr: 'SDV', name: 'Secure Document Vault', desc: 'AES-256 encrypted vault for wills, trusts, deeds, policies, and directives \u2014 released only to the people you name.' },
      { abbr: 'DAV', name: 'Digital Access Vault', desc: 'Passwords, bank logins, password-manager seeds, and crypto keys \u2014 assigned to the right people.' },
      { abbr: 'EGA', name: 'Estate Guardian\u2122 AI', desc: 'An AI estate-law analyst that reads inside your encrypted vault and flags gaps, contradictions, and deadlines you missed.' },
    ],
  },
  {
    num: '03',
    icon: Landmark,
    title: 'Money',
    abbr: 'Clarity, not a mystery',
    color: '#22C993',
    blurb: 'The whole money picture and a visual map of every entity that holds it together \u2014 so nothing is lost and no one is left guessing.',
    functions: [
      { abbr: 'CFP', name: 'CarryOn Financial Picture', desc: 'A complete, encrypted view of bank accounts, investments, policies, bills, debts, and properties \u2014 with the right contact attached to each.' },
      { abbr: 'CES', name: 'CarryOn Entities & Structures', desc: 'A visual, pan-and-zoom org chart of every trust, LLC, partnership, charitable entity, and the people connected to each.' },
    ],
  },
  {
    num: '04',
    icon: Clock,
    title: 'Action',
    abbr: 'The playbook for the hardest days',
    color: '#B794F6',
    blurb: 'Step-by-step actions, pre-built response plans, and a private family channel that keeps working when nothing else does.',
    functions: [
      { abbr: 'IAC', name: 'Immediate Action Checklist', desc: 'A step-by-step playbook for the first hours, days, and weeks \u2014 auto-built from your vault and fully customizable.' },
      { abbr: 'CCP', name: 'CarryOn Contingency Protocols', desc: 'Pre-authored response plans for the scenarios your family might face \u2014 medical, disaster, incapacity, transition.' },
      { abbr: 'ECT', name: 'Estate Communications Tool', desc: 'Phone-number-free family messaging that works from any device \u2014 so coordination keeps working when nothing else does.' },
    ],
  },
];

/* ── data: platform features ── */
const PLATFORM_FEATURES = [
  { icon: UserCheck, title: 'Benefactor & Beneficiary System', desc: 'Enroll the people who matter most. Control what each person can see, access, and manage within your family\'s continuity plan.' },
  { icon: ArrowUpDown, title: 'Succession Hierarchy', desc: 'Ranked beneficiary succession with automatic promotion when a primary can no longer serve. Your chain of responsibility never breaks.' },
  { icon: Layers, title: 'Multi-Estate Support', desc: 'Manage multiple estates under one account — built for blended, extended, and modern families with complex structures.' },
  { icon: Users, title: 'Family Plan Savings', desc: 'Bundle your household for percentage-based discounts on every tier. The more family members you prepare, the more you save.' },
  { icon: ShieldAlert, title: 'Emergency Access', desc: 'Verified protocol for beneficiaries to request vault access when a benefactor is incapacitated. Built for real emergencies.' },
  { icon: SlidersHorizontal, title: 'Granular Permissions', desc: 'Control exactly what each beneficiary can see across every function in every pillar &mdash; vault, messages, checklists, protocols, and more. Per-person access.' },
  { icon: Smartphone, title: 'Native Mobile App', desc: 'iOS and Android with biometric login, push notifications, and full platform access. Your family\'s continuity goes wherever you go.' },
  { icon: MapPin, title: '50-State Legal Intelligence', desc: 'Estate Guardian calibrates every analysis to your declared state of residence and its specific laws. Personalized, not generic.' },
];

/* ── data: five steps ── */
const FIVE_STEPS = [
  { step: '1', title: 'Bring Your People In', desc: 'Invite the family members who\u2019ll need access \u2014 the people who matter most. Decide who sees what, and when. Your family\u2019s readiness starts with the people in it.' },
  { step: '2', title: 'Say What Matters', desc: 'Record Milestone Messages for the moments you want to be part of \u2014 graduations, weddings, birthdays, or just a Tuesday. Create them over time, as many as you want, delivered exactly as you envision.' },
  { step: '3', title: 'Add What They\u2019ll Need', desc: 'Add your key documents and details. Estate Guardian\u2122 AI reviews everything and drafts the beginnings of your family\u2019s personalized Immediate Action Checklist \u2014 so they have a clear plan from day one.' },
  { step: '4', title: 'Set the Playbook', desc: 'Turn it into coordinated CarryOn Contingency Protocols for the scenarios that matter to your family. Connect your documents, checklists, and the Estate Communications Tool so everyone stays in sync.' },
  { step: '5', title: 'Live Your Life', desc: 'Your family\u2019s continuity system is built. Save credentials in the Digital Access Vault, organize contacts in Friends & Family Notification, and update your plan whenever life changes. When any challenge comes \u2014 your family is never left searching.' },
];

/* ── data: security items ── */
const SECURITY_ITEMS = [
  { icon: LockIcon, text: 'AES-256 per-estate encryption \u2014 your family\'s data is never accessed by our team' },
  { icon: Sparkles, text: 'Estate Guardian\u2122 AI operates entirely within your encrypted vault \u2014 no data ever leaves' },
  { icon: Shield, text: 'Two-factor authentication on every login with device trust options for your family' },
  { icon: Users, text: 'Transition verification by a human team \u2014 not algorithms, not AI. Real people confirming real events.' },
  { icon: FileCheck, text: 'SOC 2 Type II audit in progress \u2014 full audit trail and GDPR data rights built in', link: '/security' },
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
    {/* ═══════════════════ REFRAME — "never about the files" ═══════════════════ */}
    <section id="about" className="relative z-10 -mt-2">
      <div className="rounded-t-[2.5rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -20px 60px rgba(0,0,0,0.5)' }}>
        <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-roots.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(var(--gold-rgb), 0.03) 0%, transparent 60%), linear-gradient(180deg, rgba(14,24,41,0.35) 0%, rgba(14,24,41,0.85) 100%)' }} />
        <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10" data-testid={`reframe-section${testIdSuffix}`}>
          <p className="text-sm uppercase tracking-[0.18em] mb-4" style={{ color: 'var(--gold)' }}>The Family Continuity Platform</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-6 leading-tight tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
            It was never about<br />
            <span className="text-[#d4af37]">finding the files.</span>
          </h2>
          <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed mb-6">
            When life is disrupted, the hard part isn&apos;t <em className="text-white/90 not-italic font-medium">where</em> the information is. It&apos;s knowing what to do first, who to call, what&apos;s already handled, and what your loved one would have wanted.
          </p>
          <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed mb-8">
            Most families piece that together under pressure &mdash; searching drawers and inboxes, guessing at next steps, hoping nothing important is missed. CarryOn&#8482; replaces the guesswork with a clear, shared plan your family can actually follow &mdash; <span className="text-white font-medium">calm instead of chaos, direction instead of dread.</span>
          </p>
          <button onClick={() => navigateWithFade('/signup')} className="gold-keep-dark inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-sm transition-transform duration-150 active:scale-95"
            data-testid={`reframe-cta${testIdSuffix}`}
            style={{ background: '#d4af37', color: '#0B1221', transition: 'all 0.3s' }}>
            Start your family&apos;s plan <ChevronRight className="w-4 h-4" />
          </button>
        </RevealSection>
      </div>
    </section>

    {/* ═══════════════════ CONTINUITY TIMELINE (before / during / after) ═══════════════════ */}
    <section className="relative z-20 -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute inset-0 opacity-[0.35]" style={{ backgroundImage: 'url(/texture-reframe.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.4) 0%, rgba(14,24,41,0.8) 100%)' }} />
        <div className="max-w-[1000px] mx-auto px-6 relative z-10">
          <RevealSection className="text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-4 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
              Continuity isn&apos;t a moment.<br className="hidden sm:block" /> <span className="text-[#d4af37]">It&apos;s before, during, and after.</span>
            </h2>
            <p className="text-[#a0aec0] text-base max-w-[640px] mx-auto mb-16 leading-relaxed">
              CarryOn is the one system that&apos;s relevant at every stage &mdash; so your family is never starting from zero.
            </p>
          </RevealSection>
          <div className="grid md:grid-cols-3 gap-6" data-testid={`continuity-timeline${testIdSuffix}`}>
            {TIMELINE.map(({ phase, tag, icon: Icon, color, body }, i) => (
              <RevealSection key={phase} delay={i * 0.12} distance={40} duration={0.8}>
                <div className="rounded-2xl p-7 h-full relative overflow-hidden"
                  style={{ background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: `1.5px solid ${color}66`, boxShadow: `0 2px 16px rgba(0,0,0,0.2), 0 0 32px ${color}14` }}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mb-5"
                    style={{ background: `linear-gradient(135deg, ${color}26, ${color}14)`, border: `1.5px solid ${color}66` }}>
                    <Icon className="w-5 h-5" style={{ color }} />
                  </div>
                  <h3 className="text-white text-xl font-semibold tracking-tight mb-1" style={{ fontFamily: 'var(--serif)' }}>{phase}</h3>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color }}>{tag}</p>
                  <p className="text-[#a0aec0] text-sm leading-relaxed">{body}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </div>
    </section>

    {/* ═══════════════════ BREADTH — every disruption, one system ═══════════════════ */}
    <section className="relative z-[25] -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 30%, rgba(var(--gold-rgb), 0.04) 0%, transparent 70%)' }} />
        <div className="max-w-[1000px] mx-auto px-6 relative z-10">
          <RevealSection className="text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-4 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
              One system for everything<br className="hidden sm:block" /> life doesn&apos;t warn you about.
            </h2>
            <p className="text-[#7b879e] text-base max-w-[620px] mx-auto mb-14 leading-relaxed">
              Most plans only cover the final day. Real families face disruption far more often &mdash; and CarryOn is there for all of it.
            </p>
          </RevealSection>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid={`disruptions-grid${testIdSuffix}`}>
            {DISRUPTIONS.map(({ icon: Icon, label }, i) => (
              <RevealSection key={label} delay={i * 0.05}>
                <div className="rounded-xl p-5 h-full flex flex-col items-center text-center gap-3 transition-all duration-500 hover:-translate-y-1"
                  style={{ background: 'linear-gradient(160deg, #16284a 0%, #142240 100%)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(var(--gold-rgb), 0.1)', border: '1px solid rgba(var(--gold-rgb), 0.18)' }}>
                    <Icon className="w-4 h-4 text-[#d4af37]" />
                  </div>
                  <span className="text-[#cbd5e1] text-sm font-medium leading-snug">{label}</span>
                </div>
              </RevealSection>
            ))}
          </div>
          <RevealSection delay={0.3}>
            <p className="text-center text-white text-lg lg:text-xl font-medium italic mt-12" style={{ fontFamily: 'var(--serif)' }}>
              Same family. Same plan. Ready every time.
            </p>
          </RevealSection>
        </div>
      </div>
    </section>

    {/* ═══════════════════ THE QUESTIONS — anxiety into confidence ═══════════════════ */}
    <section className="relative z-[28] -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute inset-0 opacity-[0.3]" style={{ backgroundImage: 'url(/texture-pathway.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.5) 0%, rgba(14,24,41,0.85) 100%)' }} />
        <div className="max-w-[820px] mx-auto px-6 relative z-10">
          <RevealSection className="text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-4 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
              The questions every family hopes<br className="hidden sm:block" /> they never answer in a hurry.
            </h2>
            <p className="text-[#a0aec0] text-base max-w-[640px] mx-auto mb-14 leading-relaxed">
              It all comes down to one: <em className="text-white/90 not-italic font-medium">&ldquo;What happens if I&apos;m suddenly unavailable?&rdquo;</em> CarryOn answers it in advance &mdash; one clear answer for each part of your plan, and only for the people you choose.
            </p>
          </RevealSection>
          <div className="space-y-4" data-testid={`questions-list${testIdSuffix}`}>
            {QUESTIONS.map(({ q, a, pillar, color }, i) => (
              <RevealSection key={q} delay={i * 0.08}>
                <div className="rounded-xl p-6 transition-all duration-500"
                  style={{ background: 'rgba(20,34,64,0.6)', border: `1px solid ${color}33`, backdropFilter: 'blur(6px)' }}>
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <p className="text-white text-base lg:text-lg font-medium" style={{ fontFamily: 'var(--serif)' }}>&ldquo;{q}&rdquo;</p>
                    <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full mt-0.5"
                      style={{ color, background: `${color}1f`, border: `1px solid ${color}59` }}>{pillar}</span>
                  </div>
                  <p className="text-[#9fb0c8] text-sm lg:text-base leading-relaxed flex items-start gap-2">
                    <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0" style={{ color }} />
                    <span>{a}</span>
                  </p>
                </div>
              </RevealSection>
            ))}
          </div>
          <RevealSection delay={0.3}>
            <p className="text-center text-[#d4af37] text-base lg:text-lg italic font-medium mt-12">
              When every answer is already there, fear turns into confidence.
            </p>
          </RevealSection>
        </div>
      </div>
    </section>

    {/* ═══════════════════ FOUR PILLARS — capabilities as outcomes ═══════════════════ */}
    <section id="features" className="relative z-30 -mt-1">
      <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0f1d30 0%, #132240 50%, #0f1d30 100%)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute top-0 left-0 right-0 h-[280px] sm:hidden opacity-[0.55]" style={{ backgroundImage: 'url(/texture-pillars.jpg)', backgroundSize: 'cover', backgroundPosition: 'center top' }} />
        <div className="absolute top-0 left-0 right-0 h-[280px] sm:hidden" style={{ background: 'linear-gradient(180deg, transparent 40%, #0f1d30 100%)' }} />
        <div className="absolute inset-0 opacity-[0.45] hidden sm:block" style={{ backgroundImage: 'url(/texture-pillars.jpg)', backgroundSize: 'cover', backgroundPosition: 'center top', filter: 'blur(2px)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(15,29,48,0.4) 0%, rgba(15,29,48,0.7) 100%)' }} />
        <div className="max-w-[900px] mx-auto px-6 relative z-10">
          <RevealSection>
            <p className="text-sm uppercase tracking-[0.18em] mb-3 text-center" style={{ color: 'var(--gold)' }}>One connected system</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white text-center mb-4 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
              Everything your family needs to keep going.
            </h2>
            <p className="text-[#a0aec0] text-base text-center max-w-[650px] mx-auto mb-16 leading-relaxed">
              Four pillars work together so your family is genuinely ready &mdash; not scrambling. Each one turns what you organize today into action your family can take tomorrow.
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
                          <div className="flex flex-col sm:flex-row sm:items-baseline gap-x-3 gap-y-1 mb-2">
                            <h4 className="text-white text-2xl font-semibold leading-tight tracking-tight" style={{ fontFamily: 'var(--serif)' }}>{title}</h4>
                            <span className="text-[#8b97ab] text-xs font-semibold tracking-wider uppercase break-words min-w-0">{abbr}</span>
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
                    Total Family Continuity.
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
              Built for how your family actually lives.
            </h2>
            <p className="text-[#7b879e] text-base text-center max-w-[650px] mx-auto mb-14 leading-relaxed">
              Behind the calm experience is a complete continuity infrastructure &mdash; with tools designed for modern, blended, and far-flung families.
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
              You don&apos;t have to do it all at once.
            </h2>
            <p className="text-[#7b879e] text-base max-w-[600px] mx-auto mb-14 leading-relaxed">
              Start with what matters most. Build your family&apos;s readiness over time &mdash; a little at a time is enough.
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
              The most important things your family<br className="hidden sm:block" /> will ever share. Protected like it.
            </h2>
            <p className="text-[#7b879e] text-base max-w-[700px] mx-auto mb-14 leading-relaxed">
              Every layer of CarryOn&#8482; is built on the encryption, key-management, and access controls we{' '}
              <a href="/security" onClick={(e) => { e.preventDefault(); navigateWithFade('/security'); }}
                className="text-[#d4af37] underline underline-offset-2 hover:brightness-110 transition-all"
                data-testid={`security-document-publicly-link${testIdSuffix}`}>document publicly</a>
              {' '}&mdash; because the people you love deserve nothing less.
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SECURITY_ITEMS.map(({ icon: Icon, text, link }, i) => {
              const card = (
                <div className={`rounded-xl p-6 text-center h-full backdrop-blur-sm${link ? ' cursor-pointer transition-colors duration-300 hover:border-[#d4af37]/40' : ''}`}
                  style={{ background: 'rgba(14,24,41,0.25)', border: '1.5px solid rgba(255,255,255,0.15)', boxShadow: '0 8px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
                  <Icon className="w-6 h-6 text-[#7b879e] mx-auto mb-4 transition-colors duration-300 group-hover:text-[#d4af37]" />
                  <p className="text-[#94a3b8] text-sm leading-relaxed">{text}</p>
                </div>
              );
              return (
                <RevealSection key={i} delay={i * 0.08}>
                  {link ? (
                    <a href={link} onClick={(e) => { e.preventDefault(); navigateWithFade(link); }} className="block h-full"
                      data-testid={`security-item-link-${i}${testIdSuffix}`}>{card}</a>
                  ) : card}
                </RevealSection>
              );
            })}
          </div>
          <RevealSection delay={0.45}>
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="/security" onClick={(e) => { e.preventDefault(); navigateWithFade('/security'); }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold text-[#d4af37] transition-colors duration-300 hover:border-[#d4af37]/60"
                style={{ border: '1.5px solid rgba(var(--gold-rgb), 0.35)', background: 'rgba(var(--gold-rgb), 0.05)' }}
                data-testid={`security-page-cta${testIdSuffix}`}>
                Read our full Security &amp; Trust documentation <ChevronRight className="w-4 h-4" />
              </a>
              <a href="/wind-down-promise" onClick={(e) => { e.preventDefault(); navigateWithFade('/wind-down-promise'); }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold text-[#d4af37] transition-colors duration-300 hover:border-[#d4af37]/60"
                style={{ border: '1.5px solid rgba(var(--gold-rgb), 0.35)', background: 'rgba(var(--gold-rgb), 0.05)' }}
                data-testid={`wind-down-promise-cta${testIdSuffix}`}>
                Our Wind-Down &amp; Data Portability Promise <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </RevealSection>
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
              Readiness shouldn&apos;t depend on your circumstances.
            </h2>
            <p className="text-[#7b879e] text-base leading-relaxed mb-6">
              At any given time, over 300,000 Americans are in hospice &mdash; and the vast majority have no plan in place for their families. CarryOn&#8482; is offered at no cost to all U.S. citizens and resident aliens enrolled in certified hospice care. Full platform access. No exceptions.
            </p>
            <p className="text-white text-base font-semibold italic leading-relaxed">
              No one should be denied the ability to prepare their family &mdash; simply because of their circumstances.
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
                A dedicated tier for young Americans just starting out. Because preparedness shouldn&apos;t start when you think you need it &mdash; it should start the day you&apos;re responsible for yourself.
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
        <RevealSection className="max-w-[640px] mx-auto px-6 text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-5 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
            If something happens tomorrow &mdash;<br className="hidden sm:block" /> will your family know what to do?
          </h2>
          <p className="text-[#7b879e] text-base mb-8">
            Join the families choosing confidence over uncertainty. Start in minutes, build at your pace, and be ready for anything.
          </p>
          <button onClick={ctaOverride?.onClick || (() => navigateWithFade('/signup'))} className="gold-keep-dark inline-flex items-center gap-2 px-10 py-4 rounded-lg font-semibold text-base transition-transform duration-150 active:scale-95"
            data-testid={`final-cta-button${testIdSuffix}`}
            style={{ background: '#d4af37', color: '#0B1221', transition: 'all 0.3s' }}>
            {ctaOverride?.label || 'Start your family\u2019s plan'} <ChevronRight className="w-4 h-4" />
          </button>
          <p className="text-[#6b7a90] text-xs mt-5">Free to start &middot; Your data is yours alone &middot; Cancel anytime</p>
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
