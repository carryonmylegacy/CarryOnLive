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
import SEO from '../components/SEO';
import PublicFooter from '../components/PublicFooter';
import { Link } from 'react-router-dom';
import {
  Shield, Lock, KeyRound, FileCheck, Server, AlertTriangle,
  Eye, Mail, ArrowLeft, CheckCircle2, Clock,
} from 'lucide-react';
import { useCopy, renderCopy } from '../copy/CopyContext';

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

/* Bullets for one section: copy keys security.<section>.1 … security.<section>.N */
const CopyBullets = ({ section, count, t }) => (
  <ul className="space-y-2">
    {Array.from({ length: count }, (_, i) => (
      <Bullet key={i}>{renderCopy(t(`security.${section}.${i + 1}`))}</Bullet>
    ))}
  </ul>
);

const SecurityPage = () => {
  // Land at the top regardless of where the previous page's scroll was.
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const { t } = useCopy();
  return (
  <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--t)' }} data-testid="security-page">
    <SEO title={t('security.seo.title')} description={t('security.seo.description')} path="/security" />
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
          <Shield className="w-3 h-3" /> {t('security.hero.pill')}
        </div>
        <h1
          className="text-4xl sm:text-5xl font-semibold leading-[1.1] mb-5"
          style={{ fontFamily: 'var(--serif)' }}
        >
          {t('security.hero.h1a')} <span className="italic" style={{ color: 'var(--gold)' }}>{t('security.hero.h1b')}</span> {t('security.hero.h1c')}
        </h1>
        <p className="text-base leading-relaxed" style={{ color: 'var(--t3)' }}>
          {renderCopy(t('security.hero.intro'))}
        </p>
      </div>

      {/* Encryption */}
      <Section icon={Lock} title={t('security.s.encryption')} testid="security-encryption">
        <CopyBullets section="encryption" count={5} t={t} />
      </Section>

      {/* Authentication */}
      <Section icon={KeyRound} title={t('security.s.auth')} testid="security-auth">
        <CopyBullets section="auth" count={5} t={t} />
      </Section>

      {/* Key rotation */}
      <Section icon={Clock} title={t('security.s.rotation')} testid="security-rotation">
        <CopyBullets section="rotation" count={4} t={t} />
      </Section>

      {/* Infra */}
      <Section icon={Server} title={t('security.s.infra')} testid="security-infra">
        <CopyBullets section="infra" count={5} t={t} />
      </Section>

      {/* Headers */}
      <Section icon={FileCheck} title={t('security.s.headers')} testid="security-headers">
        <CopyBullets section="headers" count={7} t={t} />
      </Section>

      {/* Data protection */}
      <Section icon={Eye} title={t('security.s.privacy')} testid="security-privacy">
        <ul className="space-y-2">
          <Bullet>{renderCopy(t('security.privacy.1'))} <Link to="/wind-down-promise" className="underline" style={{ color: 'var(--gold)' }}>{t('security.privacy.1link')}</Link>.</Bullet>
          {[2, 3, 4, 5].map(n => <Bullet key={n}>{renderCopy(t(`security.privacy.${n}`))}</Bullet>)}
        </ul>
      </Section>

      {/* Compliance */}
      <Section icon={Shield} title={t('security.s.compliance')} testid="security-compliance">
        <ul className="space-y-2">
          <Bullet>{renderCopy(t('security.compliance.1'))}</Bullet>
          <Bullet>{renderCopy(t('security.compliance.2'))} <a href="mailto:privacy@carryon.us" className="underline" style={{ color: 'var(--gold)' }}>privacy@carryon.us</a>.</Bullet>
          <Bullet>{renderCopy(t('security.compliance.3'))}</Bullet>
        </ul>
      </Section>

      {/* Reporting */}
      <Section icon={AlertTriangle} title={t('security.s.reporting')} testid="security-reporting">
        <p>
          {renderCopy(t('security.reporting.intro'))}
        </p>
        <ul className="space-y-2">
          <Bullet>
            <strong>{t('security.reporting.email_label')}</strong>{' '}
            <a href="mailto:security@carryon.us" className="underline" style={{ color: 'var(--gold)' }}>security@carryon.us</a>
          </Bullet>
          <Bullet>
            <strong>{t('security.reporting.txt_label')}</strong>{' '}
            <a href="/.well-known/security.txt" className="underline" style={{ color: 'var(--gold)' }}>www.carryon.us/.well-known/security.txt</a>
          </Bullet>
          <Bullet>{renderCopy(t('security.reporting.rules'))}</Bullet>
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
          {t('security.contact.before')}{' '}
          <a href="mailto:security@carryon.us" className="underline font-semibold" style={{ color: 'var(--gold)' }}>
            security@carryon.us
          </a>
          {t('security.contact.after')}
        </div>
      </div>

      <p className="text-xs mt-10 text-center" style={{ color: 'var(--t5)' }}>
        {renderCopy(t('security.updated'))}
      </p>
    </div>
    <PublicFooter />
  </div>
  );
};

export default SecurityPage;
