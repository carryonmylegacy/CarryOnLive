import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { API_URL } from '../config';
import { COMPANY, copyrightLine } from '../config/company';
import { useCopy } from '../copy/CopyContext';

let cachedInfo = null;

const LINKS = [
  { to: '/privacy', k: 'privacy' },
  { to: '/terms', k: 'terms' },
  { to: '/security', k: 'security' },
  { to: '/wind-down-promise', k: 'winddown' },
  { to: '/accessibility', k: 'accessibility' },
  { to: '/readiness-score', k: 'readiness' },
  { to: '/guides', k: 'guides', flag: 'guides_launched' },
  { to: '/founder-about', k: 'founder' },
];

export const PublicFooter = () => {
  const { t, flags } = useCopy();
  const [info, setInfo] = useState(
    cachedInfo || { line1: COMPANY.addressLine1, line2: COMPANY.addressLine2, phone: COMPANY.phone }
  );

  useEffect(() => {
    if (cachedInfo) return undefined;
    let live = true;
    apiClient.get(`${API_URL}/public/site-content`).then(r => {
      cachedInfo = {
        line1: r.data.footer_address_line1 || COMPANY.addressLine1,
        line2: r.data.footer_address_line2 || COMPANY.addressLine2,
        phone: r.data.footer_phone || COMPANY.phone,
      };
      if (live) setInfo(cachedInfo);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  return (
    <footer className="relative z-[80] py-10" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} data-testid="public-footer">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <img src="/carryon-logo.png" alt="CarryOn" className="h-8 opacity-60" />
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Legal and trust pages">
            {LINKS.filter(l => !l.flag || flags[l.flag]).map(l => (
              <Link
                key={l.to}
                to={l.to}
                className="text-[#94a3b8] text-xs hover:text-[#cbd5e1] transition-colors"
                data-testid={`footer-link${l.to.replace(/\//g, '-')}`}
              >
                {t(`footer.${l.k}`)}
              </Link>
            ))}
          </nav>
          <div className="text-center sm:text-right text-[#94a3b8] text-xs leading-relaxed" data-testid="footer-entity-block">
            <p>{COMPANY.disclosure}</p>
            <p>{info.line1}</p>
            <p>{info.line2}</p>
            <p><a href={`tel:+1${info.phone.replace(/\D/g, '')}`} className="hover:text-[#cbd5e1] transition-colors">{info.phone}</a></p>
          </div>
        </div>
        <p className="text-center text-[#94a3b8] text-xs mt-6" data-testid="footer-copyright">{copyrightLine()}</p>
      </div>
    </footer>
  );
};

export default PublicFooter;
