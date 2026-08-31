/**
 * AccessibilityPage — public accessibility statement at /accessibility.
 * Styled to match /security. Claims no unverified conformance.
 */
import React, { useEffect } from 'react';
import SEO from '../components/SEO';
import PublicFooter from '../components/PublicFooter';
import { Link } from 'react-router-dom';
import {
  Accessibility, ArrowLeft, CheckCircle2, AlertTriangle, Mail, Target,
} from 'lucide-react';
import { COMPANY } from '../config/company';

const Section = ({ icon: Icon, title, children, testid }) => (
  <section
    className="rounded-xl p-6 mb-5"
    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
    data-testid={testid}
  >
    <div className="flex items-start gap-3 mb-4">
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

const AccessibilityPage = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
  <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--t)' }} data-testid="accessibility-page">
    <SEO title="Accessibility — CarryOn" description="Our commitment to WCAG 2.1 AA conformance and how to report an accessibility barrier." path="/accessibility" />
    <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-12 pb-24" style={{ paddingTop: 'calc(48px + env(safe-area-inset-top, 0px))' }}>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm mb-8 hover:text-white transition-colors"
        style={{ color: 'var(--t4)' }}
        data-testid="accessibility-back-home"
      >
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>

      {/* Hero */}
      <div className="mb-10">
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs mb-5"
          style={{ background: 'rgba(var(--gold-rgb), 0.08)', border: '1px solid rgba(var(--gold-rgb), 0.2)', color: 'var(--gold)' }}
        >
          <Accessibility className="w-3 h-3" /> Accessibility
        </div>
        <h1
          className="text-4xl sm:text-5xl font-semibold leading-[1.1] mb-5"
          style={{ fontFamily: 'var(--serif)' }}
        >
          Accessibility at CarryOn
        </h1>
        <p className="text-base leading-relaxed" style={{ color: 'var(--t3)' }}>
          CarryOn targets WCAG 2.1 Level AA. Because families often use the platform
          during medical crises, evacuations, and bereavement, accessibility is treated
          as a core requirement rather than a compliance exercise.
        </p>
      </div>

      <Section icon={Target} title="What is in place today" testid="accessibility-in-place">
        <ul className="space-y-2.5">
          <Bullet>Keyboard navigation across the public site and application.</Bullet>
          <Bullet>Skip-to-content links so keyboard and screen-reader users can bypass navigation.</Bullet>
          <Bullet>Visible focus indicators on interactive elements.</Bullet>
          <Bullet>Text resizing and pinch-zoom support — we do not disable browser or device zoom.</Bullet>
          <Bullet>Semantic headings and landmarks for assistive technology.</Bullet>
          <Bullet>Color contrast targeting the AA threshold.</Bullet>
        </ul>
      </Section>

      <Section icon={AlertTriangle} title="Known limitations" testid="accessibility-limitations">
        <p>
          No third-party accessibility audit has been completed yet. We make no
          conformance claim beyond what we have verified ourselves. When an independent
          audit is completed, its findings — including anything we still need to fix —
          will be published on this page.
        </p>
      </Section>

      <Section icon={Mail} title="Report an accessibility barrier" testid="accessibility-reporting">
        <p>
          If anything on CarryOn is hard to use with assistive technology, we want to
          know about it and we will respond within five business days.
        </p>
        <ul className="space-y-2.5">
          <Bullet>
            Email: <a href={`mailto:${COMPANY.emailGeneral}`} className="underline hover:text-white transition-colors" data-testid="accessibility-email">{COMPANY.emailGeneral}</a>
          </Bullet>
          <Bullet>
            Phone: <a href={`tel:+1${COMPANY.phone.replace(/\D/g, '')}`} className="underline hover:text-white transition-colors" data-testid="accessibility-phone">{COMPANY.phone}</a>
          </Bullet>
        </ul>
      </Section>

      <p className="text-xs mt-10 text-center" style={{ color: 'var(--t5)' }} data-testid="accessibility-last-updated">
        Last updated: August 31, 2026.
      </p>
    </div>
    <PublicFooter />
  </div>
  );
};

export default AccessibilityPage;
