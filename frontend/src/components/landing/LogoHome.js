import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { homeHref } from './BackHome';

// Upper-left brand mark for public pages: always the real CarryOn logo, always goes home (see homeHref).
export const LogoHome = ({ testId = 'logo-home', className = 'h-12', src = '/carryon-logo.png', alt = 'CarryOn' }) => {
  const { isAuthenticated } = useAuth();
  return (
    <Link to={homeHref(isAuthenticated)} className="inline-flex items-center flex-shrink-0" aria-label="CarryOn home" data-testid={testId}>
      <img src={src} alt={alt} className={className} />
    </Link>
  );
};

export default LogoHome;
