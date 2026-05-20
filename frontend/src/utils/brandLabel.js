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
 * Joins a partner brand name with a product suffix, intelligently
 * de-duplicating word overlap at the boundary.
 *
 *   joinBrandSuffix("LTD Financial", "Financial Picture")
 *     → "LTD Financial Picture"     // dropped duplicate "Financial"
 *
 *   joinBrandSuffix("Smith Insurance", "Insurance Co.")
 *     → "Smith Insurance Co."
 *
 *   joinBrandSuffix("The People's Insurance Co.", "Financial Picture")
 *     → "The People's Insurance Co. Financial Picture"   // no overlap
 *
 * Algorithm: tokenize, find the largest suffix of `brand` that equals
 * a prefix of `suffix` (case-insensitive, ignoring trailing punctuation),
 * then drop that overlap from the suffix.
 */
export function joinBrandSuffix(brand, suffix) {
  if (!brand || !suffix) return [brand, suffix].filter(Boolean).join(' ').trim();
  const normalize = (w) => w.toLowerCase().replace(/[.,'’"]+$/g, '');
  const brandTokens = String(brand).trim().split(/\s+/);
  const suffixTokens = String(suffix).trim().split(/\s+/);
  // Find largest k such that the last k brand tokens match the first k
  // suffix tokens (case + trailing-punct insensitive). Cap k at the
  // smaller of the two arrays to avoid wraparound.
  const maxK = Math.min(brandTokens.length, suffixTokens.length);
  let overlap = 0;
  for (let k = maxK; k >= 1; k -= 1) {
    let match = true;
    for (let i = 0; i < k; i += 1) {
      if (normalize(brandTokens[brandTokens.length - k + i]) !== normalize(suffixTokens[i])) {
        match = false;
        break;
      }
    }
    if (match) { overlap = k; break; }
  }
  return [...brandTokens, ...suffixTokens.slice(overlap)].join(' ');
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

/**
 * Hook returning a `buildBrandedLabel(suffix)` function that pairs a
 * partner brand with a product suffix using the suffix dedupe
 * algorithm above AND the parenthetical-acronym strip in B2B context.
 *
 *   buildBrandedLabel('Financial Picture (CFP)')
 *     → "LTD Financial Picture"    (B2B, brand="LTD Financial")
 *     → "CarryOn Financial Picture (CFP)"  (direct consumer)
 */
export function useBrandedLabelBuilder() {
  const { partnerBranding } = useAuth();
  const isPartner = !!partnerBranding?.companyName;
  const cleaner = isPartner ? stripParentheticalAcronyms : (t) => t;
  return (brand, suffix) => cleaner(joinBrandSuffix(brand, suffix));
}
