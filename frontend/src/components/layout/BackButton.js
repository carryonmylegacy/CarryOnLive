import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Universal back button — sits in `DashboardLayout` above `<Outlet />`
 * so every authenticated page gets a consistent affordance to return
 * to the previous page in history, no matter how the user got there.
 *
 * Behavior (May 22 2026 — per founder spec):
 *   • Hidden on `/dashboard` itself — the dashboard is the root
 *     destination, there's no "before" to go back to.
 *   • Hidden on auth/public pages — those don't render through
 *     `DashboardLayout` anyway, so this is enforced by mount point,
 *     not by route list.
 *   • Click → `navigate(-1)` if the browser has more than one entry
 *     in history, else falls back to `/dashboard` so a deep-linked
 *     visit doesn't dead-end on a closed-tab no-op.
 *
 * Style chosen for uniformity: small pill, neutral border + grey
 * text in resting state, hover transitions to brand gold. Matches
 * the cleanest of the ~10 ad-hoc back buttons that previously
 * lived across the platform (sourced from `FounderAboutPage.js`'s
 * variant). All other top-of-page "Back" affordances were removed
 * in the same pass so there is now exactly ONE per page.
 */
const BackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Pages that legitimately have no "before" within the SPA history,
  // OR pages where a Back button would be confusing chrome.
  //   /dashboard           — root benefactor destination
  //   /admin               — root admin destination
  //   /ops                 — root operator destination
  //   /beneficiary/*hub    — root beneficiary destination
  //   /onboarding          — modal-style fullscreen onboarding
  //   /transition          — sensitive flow with its own nav
  const HIDDEN_EXACT = new Set([
    '/dashboard',
    '/admin',
    '/ops',
    '/beneficiary',
    '/beneficiary/dashboard',
    '/beneficiary/hub',
    '/onboarding',
    '/transition',
  ]);
  if (HIDDEN_EXACT.has(location.pathname)) return null;

  const handleBack = () => {
    // `window.history.length > 1` is the cheapest check; on a deep
    // link the SPA's history stack only has the entry that brought
    // the user here, so we fall back to /dashboard instead of
    // closing the tab. (iOS PWA returns 1 even after several
    // SPA navigations in some edge cases — accept that as the
    // graceful fallback.)
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div
      className="px-4 lg:px-6 pt-3 lg:pt-4"
      data-testid="universal-back-button-wrapper"
    >
      <button
        onClick={handleBack}
        type="button"
        data-testid="universal-back-button"
        aria-label="Go back to the previous page"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-all border border-[var(--b)] text-[var(--t4)] hover:text-[var(--gold)] hover:border-[var(--gold)] active:scale-95"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </button>
    </div>
  );
};

export default BackButton;
