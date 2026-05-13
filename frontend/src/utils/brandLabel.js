/**
 * Strips known feature-name parenthetical acronyms from a label
 * when the current user is in a B2B partner portal.
 *
 *   "Milestone Messages (MM)"  →  "Milestone Messages"   (B2B)
 *   "Milestone Messages (MM)"  →  "Milestone Messages (MM)"  (direct consumer)
 *
 * Strict invariants:
 *   • Allowlist-driven — we ONLY strip product-feature acronyms.
 *     Legal/entity acronyms like (LLC), (LP), (DBA), (PLLC), (CVC),
 *     (OTP), (CCS), (SOC), (ZIP), (US), and any acronyms we don't
 *     recognize stay intact.
 *   • No-op for direct consumer signups and admin/founder sessions.
 *   • Idempotent: running it twice yields the same result.
 */
import { useAuth } from '../contexts/AuthContext';

// Product-feature acronyms in CarryOn's pillar/feature vocabulary.
// Add to this list when launching a new pillar with an acronym.
const FEATURE_ACRONYMS = [
  'MM', 'IAC', 'EGA', 'CFP', 'CCP', 'ECT', 'SDV', 'DAV',
  'DTS', 'FFN', 'BEC', 'EPT',
];

const STRIP_RE = new RegExp(`\\s*\\((?:${FEATURE_ACRONYMS.join('|')})\\)`, 'g');

export function stripParentheticalAcronyms(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(STRIP_RE, '');
}

/**
 * Hook returning a label-cleaner function.
 * In a B2B partner portal → strips parenthetical acronyms.
 * Otherwise → identity (returns text unchanged).
 */
export function useLabelCleaner() {
  const { partnerBranding } = useAuth();
  const isPartner = !!partnerBranding?.companyName;
  return isPartner ? stripParentheticalAcronyms : (t) => t;
}
