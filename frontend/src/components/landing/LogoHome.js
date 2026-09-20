import React from 'react';
import { Link } from 'react-router-dom';

// Upper-left brand mark for public pages: always the real CarryOn logo, always goes home.
export const LogoHome = ({ testId = 'logo-home', className = 'h-12', src = '/carryon-logo.png', alt = 'CarryOn' }) => (
  <Link to="/" className="inline-flex items-center flex-shrink-0" aria-label="CarryOn home" data-testid={testId}>
    <img src={src} alt={alt} className={className} />
  </Link>
);

export default LogoHome;
