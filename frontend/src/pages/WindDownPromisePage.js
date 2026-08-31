/**
 * WindDownPromisePage — public commitment page at /wind-down-promise.
 *
 * Addresses the single biggest objection security-conscious buyers raise:
 * "What happens to my data if you go out of business?"
 *
 * The page is itself a public, written commitment. We treat it as a
 * binding promise document — change it ONLY with an explicit founder
 * decision, and date the change.
 * Three-state rewrite approved by founder, June 2026.
 */
import React, { useEffect } from 'react';
import SEO from '../components/SEO';
import PublicFooter from '../components/PublicFooter';
import { Link } from 'react-router-dom';
import {
  HeartHandshake, Download, Calendar, Archive, Code2, ArrowLeft, CheckCircle2,
} from 'lucide-react';

const Card = ({ icon: Icon, title, children, testid }) => (
  <section
    className="rounded-xl p-6 mb-5"
    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
    data-testid={testid}
  >
    <div className="flex items-start gap-3 mb-3">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(var(--gold-rgb), 0.10)', border: '1px solid rgba(var(--gold-rgb), 0.25)' }}
      >
        <Icon className="w-5 h-5" style={{ color: 'var(--gold)' }} />
      </div>
      <h2
        className="text-2xl font-semibold leading-tight"
        style={{ color: 'var(--t)', fontFamily: 'var(--serif)' }}
      >
        {title}
      </h2>
    </div>
    <div className="text-[15px] leading-relaxed space-y-3" style={{ color: 'var(--t3)' }}>
      {children}
    </div>
  </section>
);

const Bullet = ({ children }) => (
  <li className="flex items-start gap-2.5">
    <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0" style={{ color: 'var(--gold)' }} />
    <span>{children}</span>
  </li>
);

const WindDownPromisePage = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
  <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--t)' }} data-testid="wind-down-page">
    <SEO title="Wind-Down & Data Portability Promise — CarryOn" description="Our binding written commitment in three states: what you can export today, what happens if a wind-down is ever announced (90 days minimum notice), and what stays yours after — in formats that never need our servers." path="/wind-down-promise" />
    <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-12 pb-24" style={{ paddingTop: 'calc(48px + env(safe-area-inset-top, 0px))' }}>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm mb-8 hover:text-white transition-colors"
        style={{ color: 'var(--t4)' }}
        data-testid="winddown-back-home"
      >
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>

      <div className="mb-10">
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs mb-5"
          style={{ background: 'rgba(var(--gold-rgb), 0.08)', border: '1px solid rgba(var(--gold-rgb), 0.2)', color: 'var(--gold)' }}
        >
          <HeartHandshake className="w-3 h-3" /> Wind-down & Portability Promise
        </div>
        <h1
          className="text-4xl sm:text-5xl font-semibold leading-[1.1] mb-5"
          style={{ fontFamily: 'var(--serif)' }}
        >
          If we ever shut down, your family's data <span className="italic" style={{ color: 'var(--gold)' }}>comes home with you</span>.
        </h1>
        <p className="text-base leading-relaxed" style={{ color: 'var(--t3)' }}>
          CarryOn's founder, a retired 24-year military veteran, "boot-strapped" CarryOn
          from inception to what it is today because he believes this work matters. We
          also know nothing in tech lasts forever. So we want you to know exactly what
          would happen — long before anything ever needs to.
        </p>
        <p className="text-base leading-relaxed mt-3" style={{ color: 'var(--t3)' }}>
          This is a binding written promise. We commit to every line below.
        </p>
      </div>

      <Card icon={Download} title="State 1 — Today, while CarryOn is healthy" testid="winddown-state1">
        <p>You can take your data home right now, without asking us:</p>
        <ul className="space-y-2">
          <Bullet>
            A complete data export from Settings &rarr; Privacy (protected by step-up
            verification) &mdash; your profile, estates, milestone message text, Digital
            Access Vault entries including their secret values, your full financial
            picture (bills, debts, accounts, property), entities &amp; structures,
            Friends &amp; Family contacts, contingency protocols, Immediate Action
            Checklist, and your estate plan timeline &mdash; one readable JSON file.
          </Bullet>
          <Bullet>Every uploaded document, downloadable individually in its original file format (PDF, JPG, MP4, WAV&hellip;).</Bullet>
          <Bullet>Milestone message audio and video in original format.</Bullet>
          <Bullet>
            Formatted PDFs from your Estate Binder &mdash; Immediate Action Checklist,
            Contingency Protocols, Financial Picture hand-off package, Estate Guardian
            plan and transcript, Emergency Card, Family Readiness Report.
          </Bullet>
          <Bullet>Or write to <a href="mailto:privacy@carryon.us" className="underline" style={{ color: 'var(--gold)' }}>privacy@carryon.us</a> and we assemble it with you.</Bullet>
        </ul>
      </Card>

      <Card icon={Calendar} title="State 2 — If a wind-down is ever announced" testid="winddown-state2">
        <p>No silent shutdown. Ever. If CarryOn is ever sunsetting &mdash; voluntarily, due to acquisition, or for any other reason:</p>
        <ul className="space-y-2">
          <Bullet>Every active account receives at least <strong>90 calendar days of advance written notice</strong> (email + in-app banner) before any service degradation.</Bullet>
          <Bullet>Every feature stays fully functional for the whole window. Nothing removed early "to save costs."</Bullet>
          <Bullet>Every export path in State 1 stays open all 90 days, and we actively remind you to use them.</Bullet>
          <Bullet>Founders Circle Lifetime members get <strong>concierge migration support</strong> &mdash; a real person walks you through your export and confirms you have everything.</Bullet>
          <Bullet>If we are acquired, the acquirer must honor this entire promise as a condition of the deal. If the founder is ever unable to operate the company, his own estate plan includes hand-off instructions to a successor with these same commitments.</Bullet>
        </ul>
      </Card>

      <Card icon={Archive} title="State 3 — After the last day" testid="winddown-state3">
        <p>
          Everything you downloaded stays readable forever on your own computer &mdash;
          original file formats and plain JSON. No proprietary formats, no CarryOn
          servers, no accounts, no internet connection required.
        </p>
      </Card>

      <Card icon={Code2} title="No proprietary formats — ever" testid="winddown-decrypt">
        <p>
          Nothing we give you ever needs our servers to read. If we ever offer
          encrypted archive downloads, we commit to publishing an open-source
          decryption tool on GitHub at the same time, under a permissive license.
        </p>
      </Card>

      <div
        className="rounded-xl p-6 mt-8 text-center"
        style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px solid rgba(var(--gold-rgb), 0.2)' }}
      >
        <p className="text-base italic" style={{ fontFamily: 'var(--serif)', color: 'var(--gold)' }}>
          "Your family deserves a plan, not a panic. So does the platform that holds it."
        </p>
        <p className="text-xs mt-3" style={{ color: 'var(--t5)' }}>
          — Barnet Harris, Founder
        </p>
      </div>

      <p className="text-xs mt-10 text-center" style={{ color: 'var(--t5)' }}>
        First published: April 29, 2026. Last revised: June 2026 (three-state
        rewrite). Any change to this page must be accompanied by an updated
        changelog entry and 30 days' notice to active members.
      </p>
    </div>
    <PublicFooter />
  </div>
  );
};

export default WindDownPromisePage;
