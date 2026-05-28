/**
 * CarryOn™ — Canonical familial/role relationship list.
 *
 * SINGLE SOURCE OF TRUTH for every "Relationship" dropdown that describes how a
 * person relates to the benefactor (Edit Beneficiary, QuickStart Wizard, etc.).
 * Do NOT redefine this list inline anywhere — import it.
 *
 * Note: this is distinct from CES "entity-relationship" roles (trustee/
 * beneficiary/member OF an entity), which are a different concept and are not
 * sourced from this list.
 */
export const RELATIONSHIPS = [
  'Spouse',
  'Partner',
  'Son',
  'Daughter',
  'Son-in-law',
  'Daughter-in-law',
  'Mother',
  'Father',
  'Mother-in-law',
  'Father-in-law',
  'Brother',
  'Sister',
  'Aunt',
  'Uncle',
  'Grandson',
  'Granddaughter',
  'Grandmother',
  'Grandfather',
  'Nephew',
  'Niece',
  'Friend',
  'Trustee',
  'Professional Service Provider',
  'Charity',
  'Other',
];
