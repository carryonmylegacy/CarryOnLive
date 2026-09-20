import React from 'react';
import SEO from '../components/SEO';
import PublicFooter from '../components/PublicFooter';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { useCopy, renderBlocks } from '../copy/CopyContext';
import { LogoHome } from '../components/landing/LogoHome';

const LINK = 'text-[#7AABFD] hover:text-[#A5C6FE] transition-colors';
const BLOCKS = { pClass: 'mb-3 last:mb-0', ulClass: 'list-disc list-inside space-y-1 ml-2', linkClass: LINK };
const SECTIONS = 12;

const TermsPage = () => {
  const { t } = useCopy();
  return (
    <>
    <div
      className="min-h-screen pb-12 px-4"
      style={{ background: 'linear-gradient(145deg, #0F1629, #141C33 40%, #0F1629)', paddingTop: 'calc(3rem + env(safe-area-inset-top, 0px))' }}
    >
      <SEO title={t('terms.seo.title')} description={t('terms.seo.description')} path="/terms" />
      <div className="max-w-3xl mx-auto relative z-10">
        <div className="flex items-center justify-between mb-8">
          <LogoHome testId="terms-logo" />
          <Link to="/login" className="inline-flex items-center gap-2 text-[#A0AABF] hover:text-white transition-colors" data-testid="terms-back-link">
            <ArrowLeft className="w-4 h-4" />
            {t('legal.back')}
          </Link>
        </div>

        <div className="glass-card p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-7 h-7 text-[#d4af37]" />
            <h1 className="text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }} data-testid="terms-page-title">
              {t('terms.title')}
            </h1>
          </div>
          <p className="text-[#7B879E] text-sm mb-8">{t('terms.updated')}</p>

          <div className="space-y-8 text-[#C0C8D8] text-sm leading-relaxed">
            {Array.from({ length: SECTIONS - 1 }, (_, i) => i + 1).map(n => (
              <section key={n} data-testid={`terms-section-${n}`}>
                <h2 className="text-lg font-semibold text-[var(--t)] mb-3">{t(`terms.s${n}.title`)}</h2>
                {renderBlocks(t(`terms.s${n}.body`), BLOCKS)}
              </section>
            ))}

            <section data-testid={`terms-section-${SECTIONS}`}>
              <h2 className="text-lg font-semibold text-[var(--t)] mb-3">{t('terms.s12.title')}</h2>
              <p>
                {t('terms.s12.contact')} <a href="mailto:support@carryon.us" className={LINK} data-testid="terms-contact-email">support@carryon.us</a>
              </p>
            </section>
          </div>
        </div>

        <div className="mt-6 text-center space-x-4">
          <Link to="/privacy" className="text-[#7AABFD] text-sm hover:text-[#A5C6FE] transition-colors" data-testid="terms-to-privacy-link">{t('footer.privacy')}</Link>
          <span className="text-[#525C72]">&middot;</span>
          <Link to="/login" className="text-[#7AABFD] text-sm hover:text-[#A5C6FE] transition-colors">{t('nav.signin')}</Link>
        </div>
      </div>
      <PublicFooter />
    </div>
    </>
  );
};

export default TermsPage;
