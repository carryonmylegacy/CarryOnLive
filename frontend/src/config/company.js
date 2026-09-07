// Canonical company entity info — single source of truth for the frontend.
// The admin Site Content tab can override address/phone at runtime via
// GET /api/public/site-content; these are the canonical defaults.
export const COMPANY = {
  entity: 'CarryOn Enterprises Inc.',
  addressLine1: '1550 Wilson Boulevard 7th Floor',
  addressLine2: 'Arlington, VA 22209',
  phone: '(703) 889-0017',
  emailGeneral: 'support@carryon.us',
  emailPrivacy: 'privacy@carryon.us',
  emailSecurity: 'security@carryon.us',
  emailSupport: 'support@carryon.us',
};

export const copyrightLine = () => `© ${new Date().getFullYear()} ${COMPANY.entity.replace(/\.$/, '')}. All rights reserved.`;
