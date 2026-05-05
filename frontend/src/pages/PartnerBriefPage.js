import React, { useState, useMemo } from 'react';

const PILLARS = [
  { n: '01', name: 'Milestone Messages', abbr: 'MM', desc: 'Recorded video, audio, or written messages a person leaves to be delivered to specific loved ones at specific future moments — a wedding, a graduation, a 30th birthday, the day after they pass.' },
  { n: '02', name: 'Secure Document Vault', abbr: 'SDV', desc: 'Encrypted storage for the documents a family will actually need — wills, trusts, deeds, insurance policies, medical directives — sealed and released to the right people at the right time.' },
  { n: '03', name: 'Estate Guardian™ AI', abbr: 'EGA', desc: 'An AI assistant trained on this specific family’s plan that can answer the family’s questions when the person isn’t there — “where is dad’s life insurance?”, “what did mom want for the house?”' },
  { n: '04', name: 'Immediate Action Checklist', abbr: 'IAC', desc: 'A step-by-step playbook of what to do in the first hours, days, and weeks after someone passes — personalized to that family’s situation.' },
  { n: '05', name: 'CarryOn Contingency Protocols', abbr: 'CCP', desc: 'Pre-authored emergency plans the person sets up while healthy — what to do if they’re in an accident, hospitalized, declared incapacitated, or pass — with the right people pre-notified and the right documents pre-routed.' },
  { n: '06', name: 'Estate Communications Tool', abbr: 'ECT', desc: 'A private, family-only secure messaging space — so coordination during a hard time happens inside the platform, not on group texts that get forwarded or screenshotted.' },
  { n: '07', name: 'Digital Access Vault', abbr: 'DAV', desc: 'Encrypted storage for digital account credentials — banking, email, social, password manager, crypto wallet keys — so the family can actually GET INTO the accounts the will mentions.' },
  { n: '08', name: 'Family & Friends Notification', abbr: 'FFN', desc: 'Coordinated, dignified notification of everyone who needs to know — in the order and through the channel the person chose, while they were the one writing the message.' },
  { n: '09', name: 'CarryOn Financial Picture', abbr: 'CFP', desc: 'A complete, living picture of the household’s bills, debts, accounts, and properties — so the family knows what’s owed, what’s owned, and what to do with all of it.' },
];

const VERTICALS = [
  {
    id: 'life-insurance',
    title: 'A. Life Insurance Agents / Brokers',
    cares: [
      'Higher policy retention (clients lapse less when they feel "set up").',
      'Better claims experience — beneficiaries know the policy exists, can find it, can act on it without a 6-month battle.',
      'Differentiation in a commoditized market — they want to be the agent who also helped the family get organized.',
      'Compliance comfort: nothing in CarryOn replaces or alters the policy itself.',
    ],
    pillars: 'SDV (where the policy lives), EGA (so the family can ask "where’s dad’s policy"), FFN (the agent gets notified when a transition event occurs), IAC (claims-filing step lives in the checklist), CFP (policy shows up in the household financial picture).',
    questions: [
      'Are you looking for a tool to offer your existing book of business, or are you exploring this as a referral / affiliate channel for new client acquisition?',
      'Roughly how many policies do you have under management?',
      'Do you currently have any post-sale "family preparedness" or "legacy" service you offer clients today, even informally?',
      'Are you part of a larger agency / IMO / FMO, or independent?',
    ],
    disqualify: 'They’re really looking for a CRM, a quoting engine, or a lead-generation service. We’re not those.',
  },
  {
    id: 'financial-planners',
    title: 'B. Financial Planners / Wealth Advisors / RIAs',
    cares: [
      'Estate-planning gap: clients have wealth but no organized "go-time" plan for the family.',
      'Practice differentiation: high-net-worth clients increasingly expect holistic family-readiness support.',
      'Continuity: when the primary client passes, the surviving spouse often leaves the advisor within 2 years. CarryOn keeps the family inside an organized hand-off.',
      'Fiduciary comfort: CarryOn doesn’t give financial advice; it organizes what the advisor and client have already decided.',
    ],
    pillars: 'CFP (full household picture), SDV (estate documents in one place), EGA (family asks the AI, not the advisor at 11pm), MM (the human-legacy piece advisors can’t deliver themselves), CCP (incapacity protocols), DAV (the digital-access gap most advisors quietly worry about).',
    questions: [
      'What does your current estate-organization handoff look like for a client family today?',
      'Are you AUM-based, fee-only, hybrid? (Just for context — affects how a partnership would feel for them.)',
      'Roughly how many client households, and what’s the typical age range of the primary?',
      'Do you work inside a broker-dealer / RIA umbrella, or independently?',
      'Have you had a client family go through a transition event in the last 18 months? (If yes, ask gently what that hand-off looked like.)',
    ],
  },
  {
    id: 'funeral-homes',
    title: 'C. Funeral Homes / Cemetery Operators / Pre-Need Planners',
    cares: [
      'Pre-need conversion: families who plan ahead spend more, dispute less, and refer more.',
      'After-care: the bereaved family doesn’t just need a service, they need help with the next 90 days.',
      'Differentiation from corporate consolidators — independents need a digital story.',
      'Their families are often older and tech-anxious — they need something a 70-year-old will actually use.',
    ],
    pillars: 'IAC (the "first 30 days after death" surface), FFN (notifying the right people, in the right order, in the family’s voice), MM (the legacy piece — funeral homes are increasingly asked for video tribute services), SDV (death certificate, obituary draft, service plan).',
    questions: [
      'Do you offer pre-need / pre-arrangement today, and what does that intake look like?',
      'Are you independent, part of a regional group, or under a larger umbrella?',
      'Do you have an after-care program — six-month follow-ups, grief resources?',
      'Roughly how many services per year? (Sizing question — DON’T quote pricing.)',
      'Are you exploring this as something you’d offer at intake, give as part of pre-need, or refer to as an aftercare partner?',
    ],
  },
  {
    id: 'estate-attorneys',
    title: 'D. Estate Planning Attorneys / Trust & Estate Firms',
    cares: [
      'Their work product (the will, the trust, the POA) sits in a drawer until the day it’s needed — and on that day, the family can’t find it, doesn’t understand it, and calls the attorney in a panic.',
      'Document delivery + family education is the bottleneck of their practice — they want the document used correctly, not just filed.',
      'Liability comfort: anything the family does inside CarryOn must not contradict or substitute for the legal instrument.',
      'They want to look modern to younger clients without learning new software themselves.',
    ],
    pillars: 'SDV (their documents live there, sealed and released correctly), EGA (the AI that explains the document to the family in plain English without giving legal advice), IAC (the action checklist their POA / executor will actually use), DAV (digital-asset access the will references but the family can never find), CCP (incapacity vs death protocols).',
    questions: [
      'How does your firm currently hand off the executed plan to the client family — copy, secure portal, document vault?',
      'Do you offer plan-review or update services post-execution, or is it largely engagement-by-engagement?',
      'Roughly how many active client families, and how many new plans per year?',
      'Are you a solo / boutique firm, or part of a larger T&E practice?',
      'Do you already use a document portal vendor (Trust & Will, Wealth.com, Vanilla, EncoreEstate)? (Asking because that affects how a partnership would feel — NOT to compare features.)',
    ],
  },
];

const ADJACENT = [
  { name: 'Employee-benefits brokers / HR-tech', frame: 'Selling CarryOn as a workplace benefit. Pillars: full nine, framed as financial-wellness + family-preparedness. Qualify on plan-sponsor count, age skew, current EAP / financial-wellness offering.' },
  { name: 'Hospice / palliative care providers', frame: 'CarryOn is free for every American in hospice care — so this is a referral / awareness partnership, not a revenue partnership. Pillars: IAC, MM, SDV, FFN, CCP. Qualify on patient volume + service area.' },
  { name: 'Faith communities / clergy', frame: 'Same family-preparedness frame, often paired with a "blessing the plan" intake. Pillars: MM (legacy messages), FFN (community notification), IAC. Qualify on congregation size + member-benefit vs referral.' },
  { name: 'Military / veteran service organizations', frame: 'CarryOn has Military and Veteran tier discounts. Pillars: full nine, framed as "leave nothing for your family to figure out." Qualify on org type, member count, deployment cadence if active-duty.' },
  { name: 'Senior-living operators / CCRCs', frame: 'Resident-onboarding and family-coordination angle. Pillars: full nine. Qualify on resident count, independent vs assisted vs memory-care mix.' },
];

const ELEVATOR = [
  { abbr: 'MM', line: 'Pre-recorded video, audio, or written messages a person leaves to be delivered to specific loved ones at specific future moments.' },
  { abbr: 'SDV', line: 'Encrypted, beneficiary-keyed storage for the documents the family will actually need, released at the right time to the right person.' },
  { abbr: 'EGA', line: 'An AI guide trained on the family’s specific plan, so the family can ask questions and get answers grounded in this specific household — not generic advice.' },
  { abbr: 'IAC', line: 'A personalized step-by-step playbook for what to do in the hours, days, and weeks after someone passes.' },
  { abbr: 'CCP', line: 'Pre-authored emergency plans for accident, incapacity, hospitalization, or death — set up while the person is healthy, ready to fire when needed.' },
  { abbr: 'ECT', line: 'A private, family-only secure messaging space — so the hard conversations don’t happen on text threads or social media.' },
  { abbr: 'DAV', line: 'Encrypted credential storage so the family can actually access the digital accounts the will references.' },
  { abbr: 'FFN', line: 'Coordinated, dignified notification of everyone who needs to know, in the order and tone the person chose.' },
  { abbr: 'CFP', line: 'A complete, living picture of the household’s bills, debts, accounts, and properties — so the family knows what’s owed, owned, and what to do with it.' },
];

/**
 * PartnerBriefPage — public, no-auth, shareable B2B screening brief.
 *
 * Purpose: equip the founder’s assistant to qualify and book interested
 * B2B partners (life insurance, financial planners, funeral homes, estate
 * planners, etc.) without demoing or making promises that are the
 * founder’s call to make.
 *
 * Linked to from the Admin → Marketing → Sales Brief tab. The page is
 * served at /partner-brief so the founder can paste the URL into any
 * email or DM. No login required.
 */
export default function PartnerBriefPage() {
  const [copied, setCopied] = useState(false);
  const fullUrl = useMemo(() => (typeof window !== 'undefined' ? window.location.href.split('?')[0].split('#')[0] : ''), []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — leave silent */
    }
  };

  const onPrint = () => window.print();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: '#E5E7EB' }} data-testid="partner-brief-page">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-light { background: #fff !important; color: #111 !important; }
          .print-light * { color: #111 !important; border-color: #ddd !important; background: transparent !important; }
        }
        .pb-anchor { scroll-margin-top: 80px; }
      `}</style>

      {/* Top bar */}
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(15,22,41,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(212,175,55,0.18)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: '#d4af37' }}>CarryOn<span style={{ fontSize: 12, verticalAlign: 'top' }}>™</span></span>
            <span style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94A3B8' }}>Partner Brief</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onCopy}
              data-testid="partner-brief-copy-link"
              style={{ padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: 'linear-gradient(135deg,#d4af37,#b8962e)', color: '#080e1a', border: 'none', cursor: 'pointer' }}
            >
              {copied ? 'Link copied' : 'Copy link'}
            </button>
            <button
              onClick={onPrint}
              data-testid="partner-brief-print"
              style={{ padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: 'transparent', color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer' }}
            >
              Print / PDF
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="print-light" style={{ maxWidth: 880, margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Header */}
        <header style={{ marginBottom: 36 }}>
          <p style={{ fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#d4af37', marginBottom: 8 }}>For partners considering a CarryOn relationship</p>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 44, lineHeight: 1.1, fontWeight: 600, color: '#F8FAFC', margin: 0 }}>
            CarryOn<span style={{ fontSize: 22, verticalAlign: 'top' }}>™</span> Partner Brief
          </h1>
          <p style={{ fontSize: 16, color: '#94A3B8', marginTop: 12, lineHeight: 1.6 }}>
            An overview of the platform, the nine pillars, and how each maps to the businesses we partner with — life insurance, financial planning, funeral homes, estate planning attorneys, and adjacent verticals. Used by our team to qualify partner conversations before a discovery call with the founder.
          </p>
        </header>

        {/* TOC */}
        <nav style={tocStyle}>
          <p style={tocLabelStyle}>Contents</p>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 14 }}>
            <li><a href="#one-breath" style={linkStyle}>1. The platform in one breath</a></li>
            <li><a href="#pillars" style={linkStyle}>2. The Nine Pillars</a></li>
            <li><a href="#verticals" style={linkStyle}>3. Use cases by vertical</a></li>
            <li><a href="#adjacent" style={linkStyle}>4. Adjacent verticals</a></li>
            <li><a href="#screening" style={linkStyle}>5. Screening posture</a></li>
            <li><a href="#elevator" style={linkStyle}>6. Quick reference</a></li>
          </ol>
        </nav>

        {/* 1. ONE BREATH */}
        <Section id="one-breath" title="1. The platform in one breath">
          <Quote>
            CarryOn<span style={{ fontSize: '0.7em', verticalAlign: 'top' }}>™</span> is the digital family preparedness platform that brings together every aspect of a person’s life — so they and their loved ones can carry on through anything.
          </Quote>
          <p style={pStyle}>
            A single, secure platform where someone organizes their entire life picture — important documents, financial accounts, digital logins, who needs to be told what when something happens, recorded messages for loved ones at future life moments, and an AI guide that can answer their family’s questions when they’re not there to. It’s built so the family is genuinely <em>ready</em>, not scrambling.
          </p>
        </Section>

        {/* 2. PILLARS */}
        <Section id="pillars" title="2. The Nine Pillars of Family Readiness">
          <p style={pStyle}>
            These are the canonical names used across all CarryOn surfaces. The TM mark on Estate Guardian is required.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {PILLARS.map((p) => (
              <div key={p.abbr} style={pillarCardStyle}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
                  <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#d4af37', fontWeight: 600 }}>{p.n}</span>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: '#F8FAFC', margin: 0 }}>{p.name}</h3>
                  <span style={{ fontSize: 11, color: '#64748B', letterSpacing: '0.1em' }}>{p.abbr}</span>
                </div>
                <p style={{ fontSize: 14, color: '#CBD5E1', lineHeight: 1.6, margin: 0 }}>{p.desc}</p>
              </div>
            ))}
          </div>
          <p style={{ ...pStyle, marginTop: 18, fontSize: 14, color: '#94A3B8' }}>
            <strong style={{ color: '#E5E7EB' }}>Foundational element</strong> (not a pillar): <strong>Beneficiaries</strong> — every pillar is built around designated beneficiaries with role-based, granular access. The benefactor decides who sees what, when.
          </p>
        </Section>

        {/* 3. VERTICALS */}
        <Section id="verticals" title="3. Use cases by partner vertical">
          <p style={pStyle}>For each vertical: what they’re solving for, which pillars resonate first, and the qualifying questions our team will ask.</p>
          <div style={{ display: 'grid', gap: 18 }}>
            {VERTICALS.map((v) => (
              <div key={v.id} style={verticalCardStyle}>
                <h3 style={{ fontSize: 19, fontWeight: 700, color: '#F8FAFC', marginTop: 0, marginBottom: 12 }}>{v.title}</h3>

                <div style={subhdStyle}>What they care about</div>
                <ul style={ulStyle}>
                  {v.cares.map((c, i) => <li key={i} style={liStyle}>{c}</li>)}
                </ul>

                <div style={subhdStyle}>Pillars that resonate first</div>
                <p style={{ ...pStyle, fontSize: 14 }}>{v.pillars}</p>

                <div style={subhdStyle}>Qualifying questions</div>
                <ol style={olStyle}>
                  {v.questions.map((q, i) => <li key={i} style={liStyle}>{q}</li>)}
                </ol>

                {v.disqualify && (
                  <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 12, fontStyle: 'italic' }}>
                    Disqualify gently if: {v.disqualify}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* 4. ADJACENT */}
        <Section id="adjacent" title="4. Adjacent verticals">
          <div style={{ display: 'grid', gap: 12 }}>
            {ADJACENT.map((a, i) => (
              <div key={i} style={pillarCardStyle}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: '#F8FAFC', margin: 0, marginBottom: 6 }}>{a.name}</h4>
                <p style={{ fontSize: 14, color: '#CBD5E1', margin: 0, lineHeight: 1.6 }}>{a.frame}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* 5. SCREENING POSTURE */}
        <Section id="screening" title="5. Screening posture">
          <p style={pStyle}>The team’s job on a first call is to listen, qualify, and book — not to demo, quote, or technically educate.</p>

          <div style={subhdStyle}>Always escalated to the founder</div>
          <ul style={ulStyle}>
            <li style={liStyle}>White-label or co-branding requests.</li>
            <li style={liStyle}>API access, SSO, data integrations.</li>
            <li style={liStyle}>Pricing, revenue share, referral fees.</li>
            <li style={liStyle}>HIPAA / SOC 2 / GDPR specifics, data residency, encryption-at-rest details.</li>
            <li style={liStyle}>Roadmap or unreleased features.</li>
            <li style={liStyle}>Acquisition, investment, or M&A conversations.</li>
            <li style={liStyle}>Specific integrations with named vendors.</li>
            <li style={liStyle}>Anything beginning with &ldquo;Could CarryOn build…&rdquo; or &ldquo;Would you be willing to…&rdquo;</li>
          </ul>

          <div style={subhdStyle}>Captured on every screening call</div>
          <ol style={olStyle}>
            <li style={liStyle}>Full name, title, company, email, mobile.</li>
            <li style={liStyle}>Vertical and rough company size.</li>
            <li style={liStyle}>Independent vs. part of a larger entity.</li>
            <li style={liStyle}>Why now? — what prompted them to reach out this week.</li>
            <li style={liStyle}>Decision-maker or scoping for one.</li>
            <li style={liStyle}>The specific feature or use case they led with (verbatim).</li>
            <li style={liStyle}>Geography, source of referral, anything they want the founder to know up front.</li>
          </ol>
        </Section>

        {/* 6. ELEVATOR */}
        <Section id="elevator" title="6. Quick reference — elevator answers">
          <p style={pStyle}>Ten-second confirmations, not demo scripts. Designed to keep the conversation moving toward a discovery call with the founder.</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {ELEVATOR.map((e, i) => (
              <div key={i} style={{ ...pillarCardStyle, padding: '12px 16px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#d4af37', marginRight: 10 }}>{e.abbr}</span>
                <span style={{ fontSize: 14, color: '#CBD5E1', lineHeight: 1.5 }}>{e.line}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Footer */}
        <footer style={{ marginTop: 60, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: '#64748B', textAlign: 'center' }}>
          <p style={{ margin: 0 }}>
            Discovery and demos are run personally by the founder on the live platform. To schedule, reply to the introduction that brought you here.
          </p>
          <p style={{ margin: '8px 0 0 0' }}>
            CarryOn<span style={{ fontSize: '0.8em', verticalAlign: 'top' }}>™</span> · Confidential. For partner consideration only — not a public marketing document.
          </p>
        </footer>
      </div>
    </div>
  );
}

const tocStyle = { background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: 12, padding: '16px 20px', marginBottom: 36 };
const tocLabelStyle = { fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#d4af37', margin: '0 0 10px 0' };
const linkStyle = { color: '#CBD5E1', textDecoration: 'none', padding: '4px 0', display: 'block' };
const pStyle = { fontSize: 15, color: '#CBD5E1', lineHeight: 1.7, margin: '0 0 14px 0' };
const subhdStyle = { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94A3B8', marginTop: 14, marginBottom: 6, fontWeight: 700 };
const ulStyle = { margin: '0 0 8px 0', paddingLeft: 20 };
const olStyle = { margin: '0 0 8px 0', paddingLeft: 22 };
const liStyle = { fontSize: 14, color: '#CBD5E1', lineHeight: 1.6, marginBottom: 6 };
const pillarCardStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' };
const verticalCardStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: 14, padding: '20px 22px' };

function Section({ id, title, children }) {
  return (
    <section id={id} className="pb-anchor" style={{ marginBottom: 44 }}>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, color: '#F8FAFC', margin: '0 0 14px 0', borderBottom: '1px solid rgba(212,175,55,0.25)', paddingBottom: 8 }}>{title}</h2>
      {children}
    </section>
  );
}

function Quote({ children }) {
  return (
    <blockquote style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontStyle: 'italic', color: '#F8FAFC', borderLeft: '3px solid #d4af37', paddingLeft: 18, margin: '0 0 18px 0', lineHeight: 1.5 }}>
      {children}
    </blockquote>
  );
}
