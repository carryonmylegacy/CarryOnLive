import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCopy } from '../../copy/CopyContext';

// Where "home" is: signed in → `/` (routes to the right portal); signed out → `/home`, the
// marketing homepage — `/` renders the sign-in screen inside the installed app / PWA shell.
export const homeHref = (isAuthenticated) => (isAuthenticated ? '/' : '/home');

// Back arrow for every public page. `compact` hides the label on phones (header placement).
export const BackHome = ({ testId = 'back-home', label, compact = false, className = '', style }) => {
  const { isAuthenticated } = useAuth();
  const { t } = useCopy();
  return (
    <Link to={homeHref(isAuthenticated)} aria-label="Back to the home page" data-testid={testId} style={style}
      className={`inline-flex items-center gap-1 text-sm font-medium text-[var(--t4)] hover:text-[var(--t)] transition-colors min-h-[44px] ${className}`}>
      <ArrowLeft className="w-5 h-5 flex-shrink-0" />
      <span className={compact ? 'hidden sm:inline' : ''}>{label ?? t('footer.home')}</span>
    </Link>
  );
};

export default BackHome;
