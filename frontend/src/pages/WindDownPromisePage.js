/**
 * WindDownPromisePage — public commitment page at /wind-down-promise.
 *
 * Addresses the single biggest objection security-conscious buyers raise:
 * "What happens to my data if you go out of business?"
 *
 * The page is itself a public, written commitment. We treat it as a
 * binding promise document — change it ONLY with an explicit founder
 * decision, and date the change.
 */
import React, { useEffect } from 'react';
import SEO from '../components/SEO';
import PublicFooter from '../components/PublicFooter';
import { Link } from 'react-router-dom';
import {
  HeartHandshake, Download, Calendar, Code2, Mail, ArrowLeft, CheckCircle2,
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
    <SEO title="Wind-Down & Data Portability Promise — CarryOn" description="Our binding written commitment: 90 days notice, full self-service export, and an open-source decryption tool. Your family’s data always comes home with you." path="/wind-down-promise" />
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

      <Card icon={Calendar} title="1. Ninety days minimum notice" testid="winddown-notice">
        <p>
          If CarryOn is ever sunsetting — voluntarily, due to acquisition, or for
          any other reason — every active account will receive at least{' '}
          <strong>90 calendar days of advance written notice</strong> via email
          and in-app banner before any service degradation.
        </p>
        <p>
          During that 90-day window, all features remain fully functional. Your
          documents stay accessible. Your beneficiaries keep their access.
          Nothing is removed early "to save costs."
        </p>
      </Card>

      <Card icon={Download} title="2. Full self-service export — at any time" testid="winddown-export">
        <p>You don't have to wait for a wind-down to take your data home. Today, while we are healthy and growing, you can already:</p>
        <ul className="space-y-2">
          <Bullet>Export every uploaded document in its original file format (PDF, JPG, MP4, WAV, etc.).</Bullet>
          <Bullet>Export every milestone message in original audio/video format with delivery metadata.</Bullet>
          <Bullet>Export your Immediate Action Checklist as CSV and PDF.</Bullet>
          <Bullet>Export your CarryOn Contingency Protocols and Estate Plan Timeline as PDF.</Bullet>
          <Bullet>Export your full beneficiary roster, including invitation status and contact info.</Bullet>
          <Bullet>Request a single ZIP of <em>everything</em> via the in-app data-portability tool, or by writing to <a href="mailto:privacy@carryon.us" className="underline" style={{ color: 'var(--gold)' }}>privacy@carryon.us</a>.</Bullet>
        </ul>
      </Card>

      <Card icon={Code2} title="3. Open-source decryption utility" testid="winddown-decrypt">
        <p>
          CarryOn vaults are encrypted with AES-256-GCM and a per-estate salt. In
          a wind-down event, we will publish a stand-alone, open-source CLI tool
          to GitHub under a permissive license that accepts:
        </p>
        <ul className="space-y-2">
          <Bullet>Your exported encrypted archive (ZIP).</Bullet>
          <Bullet>Your master password.</Bullet>
        </ul>
        <p>
          and outputs every document in plaintext on your own computer — no
          servers, no accounts, no internet connection required. The tool is
          ours to publish; the data is yours to keep forever.
        </p>
      </Card>

      <Card icon={HeartHandshake} title="4. Founders Circle members are protected first" testid="winddown-fc">
        <p>
          If you are a Founders Circle Lifetime member, we owe you more than a
          ZIP file. In a wind-down, FC members get <strong>concierge migration
          support</strong> — a real person walks you through your export,
          confirms decryption, and helps you load your data into whichever
          successor platform you choose.
        </p>
      </Card>

      <Card icon={Mail} title="5. We will never silently disappear" testid="winddown-noghost">
        <p>
          The single worst thing a platform like ours can do is go offline
          without warning. We commit, in writing:
        </p>
        <ul className="space-y-2">
          <Bullet>No silent shutdown. Ever.</Bullet>
          <Bullet>If I (the founder) am ever unable to operate the company personally, my own estate plan includes hand-off instructions for CarryOn to a successor founder or acquirer with these same commitments.</Bullet>
          <Bullet>If we are acquired, the acquirer must agree to honor this entire promise as a condition of the deal. We will not sign a term sheet that doesn't include it.</Bullet>
        </ul>
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
        First published: April 29, 2026. Any change to this page must be
        accompanied by an updated changelog entry and 30 days' notice to
        active members.
      </p>
    </div>
    <PublicFooter />
  </div>
  );
};

export default WindDownPromisePage;
