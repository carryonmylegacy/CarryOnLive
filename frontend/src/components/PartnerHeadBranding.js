import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Swaps the browser tab favicon + document title to the partner's
 * brand for users authenticated under a B2B/Enterprise partner code.
 *
 * Invariants:
 *   • Renders nothing — pure side-effect component.
 *   • Direct consumer signups and admin/founder sessions: untouched.
 *     `partnerBranding` stays `null` and the original favicon + title
 *     declared in `public/index.html` are preserved.
 *   • On logout / partner unlink / unmount, restores the original
 *     favicon `href` and the original document title so the next
 *     user on the same device gets the right brand.
 */
const DEFAULT_TITLE_SUFFIX = 'CarryOn™ — The Family Continuity Platform';

export default function PartnerHeadBranding() {
  const { partnerBranding } = useAuth();
  const logoUrl = partnerBranding?.logoUrl || null;
  const companyName = partnerBranding?.companyName || null;

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const iconLink = document.querySelector('link[rel="icon"]');
    if (!iconLink) return undefined;

    const originalHref = iconLink.getAttribute('href');
    const originalTitle = document.title;

    if (logoUrl) {
      // Base64 data URLs work directly as favicons in all evergreen
      // browsers. Falls back gracefully (browser keeps last icon)
      // if the data URL is malformed.
      iconLink.setAttribute('href', logoUrl);
    }
    if (companyName) {
      document.title = `${companyName} — Estate Planning powered by CarryOn`;
    }

    return () => {
      if (originalHref) iconLink.setAttribute('href', originalHref);
      // Only reset the title if we actually changed it AND the page
      // hasn't navigated to something more specific in the meantime.
      if (companyName && document.title.startsWith(companyName)) {
        document.title = originalTitle || DEFAULT_TITLE_SUFFIX;
      }
    };
  }, [logoUrl, companyName]);

  return null;
}
