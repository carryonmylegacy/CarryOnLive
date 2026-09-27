const SLUG_KEY = 'cy_partner_slug';
const CODE_KEY = 'cy_partner_code';
const AT_KEY = 'cy_partner_at';
const INTENT_KEY = 'carryon_checkout_intent';
const TTL_MS = 24 * 60 * 60 * 1000;

// White-label landing (/p/:slug) context for the signup flow. It must never outlive the
// visit that created it: a CarryOn-owned entry (/start plan tile, Explore door, a checkout
// intent) wins, and anything older than 24h is stale (founder, Sep 26 2026).
export const stashPartner = (slug) => {
  try {
    localStorage.setItem(SLUG_KEY, slug);
    localStorage.setItem(AT_KEY, String(Date.now()));
    localStorage.removeItem(CODE_KEY);
  } catch { /* private mode */ }
};

export const clearPartnerStash = () => {
  try { [SLUG_KEY, CODE_KEY, AT_KEY].forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
};

export const readPartnerSlug = () => {
  try {
    const slug = localStorage.getItem(SLUG_KEY);
    if (!slug) return null;
    const at = Number(localStorage.getItem(AT_KEY) || 0);
    if (Date.now() - at > TTL_MS || sessionStorage.getItem(INTENT_KEY)) {
      clearPartnerStash();
      return null;
    }
    return slug;
  } catch { return null; }
};

export const readPartnerCode = () => {
  try { return readPartnerSlug() ? localStorage.getItem(CODE_KEY) : null; } catch { return null; }
};
