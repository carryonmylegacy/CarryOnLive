import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

// Upper-left brand mark for public pages: always the real CarryOn logo, always goes home.
// Signed in → `/` (routes to the right portal). Signed out → `/home`, the marketing homepage —
// `/` would show the sign-in screen inside the installed app / PWA shell.
export const LogoHome = ({ testId = 'logo-home', className = 'h-12', src = '/carryon-logo.png', alt = 'CarryOn' }) => {
  const { isAuthenticated } = useAuth();
  return (
    <Link to={isAuthenticated ? '/' : '/home'} className="inline-flex items-center flex-shrink-0" aria-label="CarryOn home" data-testid={testId}>
      <img src={src} alt={alt} className={className} />
    </Link>
  );
};

export default LogoHome;
