/**
 * SecurityPage — public security & trust page at /security.
 *
 * The single page security-conscious buyers (and reporters) check before
 * trusting a family-data platform with anything important. Modeled on
 * what Trust & Will, 1Password, and Stripe publish.
 *
 * Source-of-truth facts only. If a control isn't actually in place, it
 * isn't claimed here.
 */
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield, Lock, KeyRound, FileCheck, Server, AlertTriangle,
  Eye, Mail, ArrowLeft, CheckCircle2, Clock,
} from 'lucide-react';

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

const SecurityPage = () => {
  // Land at the top regardless of where the previous page's scroll was.
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
  <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--t)' }} data-testid="security-page">
    <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-12 pb-24" style={{ paddingTop: 'calc(48px + env(safe-area-inset-top, 0px))' }}>
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm mb-8 hover:text-white transition-colors"
        style={{ color: 'var(--t4)' }}
        data-testid="security-back-home"
      >
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>

      {/* Hero */}
      <div className="mb-10">
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs mb-5"
          style={{ background: 'rgba(var(--gold-rgb), 0.08)', border: '1px solid rgba(var(--gold-rgb), 0.2)', color: 'var(--gold)' }}
        >
          <Shield className="w-3 h-3" /> Trust & Security
        </div>
        <h1
          className="text-4xl sm:text-5xl font-semibold leading-[1.1] mb-5"
          style={{ fontFamily: 'var(--serif)' }}
        >
          Your family's most private moments deserve <span className="italic" style={{ color: 'var(--gold)' }}>military-grade</span> protection.
        </h1>
        <p className="text-base leading-relaxed" style={{ color: 'var(--t3)' }}>
          We built CarryOn for families like ours. The same encryption, key handling,
          and operational controls we'd want guarding our own wills, our own messages,
          our own kids' inheritance. This page documents — honestly — exactly what
          those controls are today.
        </p>
      </div>

      {/* Encryption */}
      <Section icon={Lock} title="Encryption — at rest and in transit" testid="security-encryption">
        <ul className="space-y-2">
          <Bullet><strong>AES-256-GCM</strong> for every encrypted document, message, and vault item.</Bullet>
          <Bullet><strong>Per-estate encryption salt</strong> generated at estate creation. No two families share a key.</Bullet>
          <Bullet><strong>PBKDF2-HMAC-SHA256, 600,000 iterations</strong> for password-derived keys (NIST recommends ≥600k).</Bullet>
          <Bullet><strong>TLS 1.3</strong> with HSTS preload (max-age 1 year, includeSubDomains, preload).</Bullet>
          <Bullet><strong>Zero-knowledge vault contents.</strong> Engineering staff cannot read your stored documents.</Bullet>
        </ul>
      </Section>

      {/* Authentication */}
      <Section icon={KeyRound} title="Authentication & Session Security" testid="security-auth">
        <ul className="space-y-2">
          <Bullet>HMAC-SHA256 signed JWTs with token blacklist + auto-expiring TTL index in MongoDB.</Bullet>
          <Bullet>Single-session enforcement for non-admin accounts — old sessions are invalidated when you log in elsewhere.</Bullet>
          <Bullet>Account lockout after 5 failed attempts within 15 minutes.</Bullet>
          <Bullet>Email-based 2FA (OTP) available for all accounts. SMS 2FA gated on Twilio A2P 10DLC approval.</Bullet>
          <Bullet>WebAuthn / Passkey support for benefactor and beneficiary accounts.</Bullet>
        </ul>
      </Section>

      {/* Key rotation */}
      <Section icon={Clock} title="Key & Secret Rotation" testid="security-rotation">
        <ul className="space-y-2">
          <Bullet>JWT signing secrets rotated at least annually and on any incident.</Bullet>
          <Bullet>Stripe API keys rotated when staff change roles or leave.</Bullet>
          <Bullet>VAPID push keys persisted to environment, not disk — survives pod restarts cleanly.</Bullet>
          <Bullet>Per-estate AES salts are immutable for the life of the estate; we never re-key without explicit user consent because it would invalidate all encrypted data.</Bullet>
        </ul>
      </Section>

      {/* Infra */}
      <Section icon={Server} title="Infrastructure" testid="security-infra">
        <ul className="space-y-2">
          <Bullet>Hosted on Railway (US East) and Vercel (global edge). MongoDB Atlas (encrypted-at-rest, automatic backups, point-in-time recovery).</Bullet>
          <Bullet>Distributed scheduler locks (MongoDB-backed) prevent duplicate background jobs in multi-pod deployments.</Bullet>
          <Bullet>MongoDB-backed sliding-window rate limiter on every authentication and high-value endpoint.</Bullet>
          <Bullet>Sentry error monitoring on both backend (FastAPI + Starlette) and frontend, gated behind env-based DSN so dev environments never report.</Bullet>
          <Bullet>K8s-style liveness + readiness probes (<code>/api/health/live</code>, <code>/api/health/ready</code>) for graceful rolling deploys.</Bullet>
        </ul>
      </Section>

      {/* Headers */}
      <Section icon={FileCheck} title="Browser-Side Hardening" testid="security-headers">
        <ul className="space-y-2">
          <Bullet>Content Security Policy (default-src 'self', tight allow-list for Stripe and fonts).</Bullet>
          <Bullet>HSTS with preload + includeSubDomains.</Bullet>
          <Bullet>X-Frame-Options: DENY (no clickjacking).</Bullet>
          <Bullet>X-Content-Type-Options: nosniff.</Bullet>
          <Bullet>Referrer-Policy: strict-origin-when-cross-origin.</Bullet>
          <Bullet>Permissions-Policy locks down camera, mic, geolocation, payment to first-party only.</Bullet>
          <Bullet>Cross-Origin-Opener-Policy / Cross-Origin-Resource-Policy: same-origin.</Bullet>
        </ul>
      </Section>

      {/* Data protection */}
      <Section icon={Eye} title="Privacy & Data Protection" testid="security-privacy">
        <ul className="space-y-2">
          <Bullet>You own your data. Full export tooling described on our <Link to="/wind-down-promise" className="underline" style={{ color: 'var(--gold)' }}>Wind-Down & Data-Portability Promise</Link>.</Bullet>
          <Bullet>Beneficiaries see <em>nothing</em> until you choose. Pre-transition, the only surface they have is their own profile.</Bullet>
          <Bullet>"Public Device Mode" wipes the local cache (IndexedDB + JWT) on tab close or inactivity for shared devices (libraries, FEMA shelters).</Bullet>
          <Bullet>We never sell, trade, or market your family data to third parties. Ever.</Bullet>
        </ul>
      </Section>

      {/* Compliance */}
      <Section icon={Shield} title="Compliance & Audits" testid="security-compliance">
        <ul className="space-y-2">
          <Bullet><strong>SOC 2 Type II — In Progress.</strong> We are mid-audit. We will publish the report and audit firm name on this page when complete. We do not claim SOC 2 attestation today.</Bullet>
          <Bullet>GDPR & CCPA data-subject rights (access, deletion, portability) supported via in-app export and a written request to <a href="mailto:privacy@carryon.us" className="underline" style={{ color: 'var(--gold)' }}>privacy@carryon.us</a>.</Bullet>
          <Bullet>HIPAA-style controls applied to medical directives stored in the Secure Document Vault, though we are not a covered entity.</Bullet>
        </ul>
      </Section>

      {/* Reporting */}
      <Section icon={AlertTriangle} title="Reporting a Vulnerability" testid="security-reporting">
        <p>
          If you've found a security issue, please tell us before you tell the
          internet. We don't have a paid bug bounty yet, but we will publicly
          credit you on this page (with your permission) and respond within 72
          hours.
        </p>
        <ul className="space-y-2">
          <Bullet>
            <strong>Email:</strong>{' '}
            <a href="mailto:security@carryon.us" className="underline" style={{ color: 'var(--gold)' }}>security@carryon.us</a>
          </Bullet>
          <Bullet>
            <strong>RFC 9116 security.txt:</strong>{' '}
            <a href="/.well-known/security.txt" className="underline" style={{ color: 'var(--gold)' }}>www.carryon.us/.well-known/security.txt</a>
          </Bullet>
          <Bullet>Please don't run brute-force, denial-of-service, or social-engineering tests against live accounts.</Bullet>
        </ul>
      </Section>

      {/* Contact */}
      <div
        className="rounded-xl p-6 mt-8 flex items-center gap-4"
        style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px solid rgba(var(--gold-rgb), 0.2)' }}
        data-testid="security-contact-cta"
      >
        <Mail className="w-6 h-6 flex-shrink-0" style={{ color: 'var(--gold)' }} />
        <div className="text-sm" style={{ color: 'var(--t3)' }}>
          Questions about how we protect your family's information? Write to{' '}
          <a href="mailto:security@carryon.us" className="underline font-semibold" style={{ color: 'var(--gold)' }}>
            security@carryon.us
          </a>
          . We answer every legitimate inquiry, often within the same day.
        </div>
      </div>

      <p className="text-xs mt-10 text-center" style={{ color: 'var(--t5)' }}>
        Last updated: April 29, 2026. This page is the source of truth for
        CarryOn's security posture. We change it before we change practice.
      </p>
    </div>
  </div>
  );
};

export default SecurityPage;
