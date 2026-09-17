import React from 'react';
import SEO from '../components/SEO';
import PublicFooter from '../components/PublicFooter';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import { useCopy, renderBlocks } from '../copy/CopyContext';

const LINK = 'text-[#7AABFD] hover:text-[#A5C6FE] transition-colors';
const BLOCKS = { pClass: 'mb-3 last:mb-0', ulClass: 'list-disc list-inside space-y-1 ml-2', linkClass: LINK };
const SECTIONS = 10;

const PrivacyPolicyPage = () => {
  const { t } = useCopy();
  return (
    <>
    <div
      className="min-h-screen pb-12 px-4"
      style={{ background: 'linear-gradient(145deg, #0F1629, #141C33 40%, #0F1629)', paddingTop: 'calc(3rem + env(safe-area-inset-top, 0px))' }}
    >
      <SEO title={t('privacy.seo.title')} description={t('privacy.seo.description')} path="/privacy" />
      <div className="max-w-3xl mx-auto relative z-10">
        <Link to="/login" className="inline-flex items-center gap-2 text-[#A0AABF] hover:text-white mb-8 transition-colors" data-testid="privacy-back-link">
          <ArrowLeft className="w-4 h-4" />
          {t('legal.back')}
        </Link>

        <div className="glass-card p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-7 h-7 text-[#d4af37]" />
            <h1 className="text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }} data-testid="privacy-page-title">
              {t('privacy.title')}
            </h1>
          </div>
          <p className="text-[#7B879E] text-sm mb-8">{t('privacy.updated')}</p>

          <div className="space-y-8 text-[#C0C8D8] text-sm leading-relaxed">
            {Array.from({ length: SECTIONS - 1 }, (_, i) => i + 1).map(n => (
              <section key={n} data-testid={`privacy-section-${n}`}>
                <h2 className="text-lg font-semibold text-[var(--t)] mb-3">{t(`privacy.s${n}.title`)}</h2>
                {renderBlocks(t(`privacy.s${n}.body`), BLOCKS)}
              </section>
            ))}

            <section data-testid={`privacy-section-${SECTIONS}`}>
              <h2 className="text-lg font-semibold text-[var(--t)] mb-3">{t('privacy.s10.title')}</h2>
              <p>
                {t('privacy.s10.dsr')} <a href="mailto:privacy@carryon.us" className={LINK} data-testid="privacy-dsr-email">privacy@carryon.us</a>
              </p>
              <p className="mt-2">
                {t('privacy.s10.general')} <a href="mailto:support@carryon.us" className={LINK} data-testid="privacy-general-email">support@carryon.us</a>
              </p>
            </section>
          </div>
        </div>

        <div className="mt-6 text-center space-x-4">
          <Link to="/terms" className="text-[#7AABFD] text-sm hover:text-[#A5C6FE] transition-colors" data-testid="privacy-to-terms-link">{t('footer.terms')}</Link>
          <span className="text-[#525C72]">&middot;</span>
          <Link to="/login" className="text-[#7AABFD] text-sm hover:text-[#A5C6FE] transition-colors">{t('nav.signin')}</Link>
        </div>
      </div>
      <PublicFooter />
    </div>
    </>
  );
};

export default PrivacyPolicyPage;
