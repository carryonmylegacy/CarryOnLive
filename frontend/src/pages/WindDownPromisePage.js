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
import { useCopy, renderCopy, copyList } from '../copy/CopyContext';

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

const LINK = 'underline text-[color:var(--gold)]';

const WindDownPromisePage = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const { t } = useCopy();
  const bullets = (k) => (
    <ul className="space-y-2">
      {copyList(t(k)).map((item, i) => <Bullet key={i}>{renderCopy(item, undefined, LINK)}</Bullet>)}
    </ul>
  );
  return (
  <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--t)' }} data-testid="wind-down-page">
    <SEO title={t('winddown.seo.title')} description={t('winddown.seo.description')} path="/wind-down-promise" />
    <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-12 pb-24" style={{ paddingTop: 'calc(48px + env(safe-area-inset-top, 0px))' }}>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm mb-8 hover:text-white transition-colors"
        style={{ color: 'var(--t4)' }}
        data-testid="winddown-back-home"
      >
        <ArrowLeft className="w-4 h-4" /> {t('winddown.back')}
      </Link>

      <div className="mb-10">
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs mb-5"
          style={{ background: 'rgba(var(--gold-rgb), 0.08)', border: '1px solid rgba(var(--gold-rgb), 0.2)', color: 'var(--gold)' }}
        >
          <HeartHandshake className="w-3 h-3" /> {t('winddown.pill')}
        </div>
        <h1
          className="text-4xl sm:text-5xl font-semibold leading-[1.1] mb-5"
          style={{ fontFamily: 'var(--serif)' }}
        >
          {t('winddown.h1a')} <span className="italic" style={{ color: 'var(--gold)' }}>{t('winddown.h1b')}</span>.
        </h1>
        <p className="text-base leading-relaxed" style={{ color: 'var(--t3)' }}>
          {renderCopy(t('winddown.intro'))}
        </p>
        <p className="text-base leading-relaxed mt-3" style={{ color: 'var(--t3)' }}>
          {renderCopy(t('winddown.intro2'))}
        </p>
      </div>

      <Card icon={Download} title={t('winddown.state1.title')} testid="winddown-state1">
        <p>{renderCopy(t('winddown.state1.intro'))}</p>
        {bullets('winddown.state1.bullets')}
      </Card>

      <Card icon={Calendar} title={t('winddown.state2.title')} testid="winddown-state2">
        <p>{renderCopy(t('winddown.state2.intro'))}</p>
        {bullets('winddown.state2.bullets')}
      </Card>

      <Card icon={Archive} title={t('winddown.state3.title')} testid="winddown-state3">
        <p>{renderCopy(t('winddown.state3.text'))}</p>
      </Card>

      <Card icon={Code2} title={t('winddown.formats.title')} testid="winddown-decrypt">
        <p>{renderCopy(t('winddown.formats.text'))}</p>
      </Card>

      <div
        className="rounded-xl p-6 mt-8 text-center"
        style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px solid rgba(var(--gold-rgb), 0.2)' }}
      >
        <p className="text-base italic" style={{ fontFamily: 'var(--serif)', color: 'var(--gold)' }}>
          &ldquo;{t('winddown.quote')}&rdquo;
        </p>
        <p className="text-xs mt-3" style={{ color: 'var(--t5)' }}>
          {t('winddown.attribution')}
        </p>
      </div>

      <p className="text-xs mt-10 text-center" style={{ color: 'var(--t5)' }}>
        {renderCopy(t('winddown.revision'))}
      </p>
    </div>
    <PublicFooter />
  </div>
  );
};

export default WindDownPromisePage;
