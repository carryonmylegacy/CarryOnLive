/**
 * Comparison-page structure. Competitor facts were taken from each company's PUBLIC
 * website on the date in copy key `compare.checked` — quote them, don't guess. Anything we
 * could not confirm is "Not listed" (never "No"). CarryOn rows must describe shipped
 * features only. Corrections: info@carryon.us.
 *
 * All TEXT (row labels, CarryOn column, competitor taglines/positioning/summary/rows/lists/FAQ)
 * lives in copy/siteCopyPhase2.js and is founder-editable. Only the fixed structure stays here:
 * slugs, names, URLs, and which rows are plain yes/no marks.
 */

export const ROW_KEYS = ['price', 'free', 'family', 'vault', 'checklist', 'emergency', 'ai', 'messages', 'passwords', 'verify', 'security', 'compliance', 'export', 'apps', 'support', 'partners'];

// Rows rendered as a check mark (true) instead of text, per column.
export const CARRYON_MARKS = { vault: true };

export const COMPETITORS = [
  { slug: 'trustworthy', name: 'Trustworthy', site: 'https://www.trustworthy.com', pricingUrl: 'https://www.trustworthy.com/pricing', marks: { vault: true, passwords: true }, faqCount: 3 },
  { slug: 'everplans', name: 'Everplans', site: 'https://www.everplans.com', pricingUrl: 'https://www.everplans.com/pricing', marks: { vault: true }, faqCount: 3 },
  { slug: 'resolve-legacy', name: 'Resolve Legacy', site: 'https://www.resolvelegacy.com', pricingUrl: 'https://www.resolvelegacy.com/contact', marks: { vault: true }, faqCount: 3 },
];

export const getCompetitor = (slug) => COMPETITORS.find(c => c.slug === slug);
