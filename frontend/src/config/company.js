// Canonical company entity info — single source of truth for the frontend.
// The admin Site Content tab can override address/phone at runtime via
// GET /api/public/site-content; these are the canonical defaults.
export const COMPANY = {
  // Founder-confirmed structure (Sep 21 2026, option B): CarryOn Technologies LLC operates the platform and
  // is the contracting party in the Terms/Privacy Policy; CarryOn Enterprises Inc is its parent and holds the
  // brand/copyright. `entity` = parent (copyright lines), `disclosure` = operator identity (footers, legal, About).
  entity: 'CarryOn Enterprises Inc',
  operatingEntity: 'CarryOn Technologies LLC',
  disclosure: 'CarryOn Technologies LLC, a CarryOn Enterprises Inc company',
  addressLine1: '1550 Wilson Boulevard 7th Floor',
  addressLine2: 'Arlington, VA 22209',
  phone: '(703) 889-0017',
  emailGeneral: 'support@carryon.us',
  emailPrivacy: 'privacy@carryon.us',
  emailSecurity: 'security@carryon.us',
  emailSupport: 'support@carryon.us',
};

export const copyrightLine = () => `© ${new Date().getFullYear()} ${COMPANY.entity} — All rights reserved.`;
