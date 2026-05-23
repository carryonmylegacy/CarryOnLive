/**
 * CarryOn Financial Picture — Entities & Structures catalog.
 *
 * Source of truth for the entity-builder feature on the CFP page.
 * Bucketed under 6 friendly categories (matches the wizard's Step 1).
 *
 * Each type carries:
 *  - id           : stable key persisted on cfp_entities.type
 *  - friendly     : plain-English label shown first
 *  - legal        : the legal/full term shown muted underneath
 *  - blurb        : kindergarten-simple two-sentence description
 *  - accent       : colour palette key (overrides bucket default)
 *  - state_relevant : show formation_state field in wizard
 *
 * Colour palette intentionally avoids any stoplight colour
 * (no red, no yellow, no traffic-light green). Bronze is the
 * "weighty / locked" signal previously carried by red.
 */

export const PALETTE = {
  // primary node colours
  cream:    { stroke: '#F5E6C8', fill: 'rgba(245,230,200,0.10)', text: '#F5E6C8', glow: '#F5E6C880' },
  bronze:   { stroke: '#7A5A23', fill: 'rgba(122,90,35,0.16)',   text: '#C49545', glow: '#7A5A2380' },
  indigo:   { stroke: '#6366F1', fill: 'rgba(99,102,241,0.14)',  text: '#A5A9F8', glow: '#6366F180' },
  steel:    { stroke: '#3B82F6', fill: 'rgba(59,130,246,0.14)',  text: '#7AAAFA', glow: '#3B82F680' },
  champagne:{ stroke: '#D4AF37', fill: 'rgba(var(--gold-rgb), 0.14)',  text: '#E8C66A', glow: '#D4A53780' },
  teal:     { stroke: '#0E7490', fill: 'rgba(14,116,144,0.16)',  text: '#3FB6CD', glow: '#0E749080' },
  slate:    { stroke: '#64748B', fill: 'rgba(100,116,139,0.18)', text: '#9AA8BC', glow: '#64748B80' },
};

// Edge / role colours
export const ROLE_PALETTE = {
  owner:       { color: '#D4AF37', dash: null,    label: 'Owner' },
  gp:          { color: '#D4AF37', dash: null,    label: 'General Partner' },
  lp:          { color: '#D4AF37', dash: '3 4',   label: 'Limited Partner' },
  trustee:     { color: '#6366F1', dash: '6 4',   label: 'Trustee' },
  beneficiary: { color: '#0E7490', dash: '2 3',   label: 'Beneficiary' },
  grantor:     { color: '#D4AF37', dash: '1 3',   label: 'Creator (Grantor)' },
  manager:     { color: '#9AA8BC', dash: null,    label: 'Manager' },
  officer:     { color: '#9AA8BC', dash: null,    label: 'Officer' },
  director:    { color: '#9AA8BC', dash: null,    label: 'Director' },
};

// Comprehensive role catalog. Every legal "hat" a person/entity can
// wear in another entity that we've encountered across business, trust,
// charity, partnership, real-property and specialized buckets.
//
// `categories` controls which entity buckets this role surfaces by
// default in the connection picker; `'*'` means "always relevant".
// The picker still exposes a "Show all roles" toggle so unusual
// pairings (e.g. a trust that is itself an LLC member) aren't gated.
//
// `group` is purely visual — the picker can render groups as section
// headings when the list is long.
export const ROLE_OPTIONS = [
  // ── Equity / ownership ──────────────────────────────────────────
  { id: 'owner',              label: 'Owner',              group: 'Equity',     help: 'Holds equity / membership / shares.',                  categories: ['business', 'property', 'specialized'] },
  { id: 'member',             label: 'Member (LLC)',       group: 'Equity',     help: 'LLC member — equity holder under an operating agreement.', categories: ['business', 'specialized'] },
  { id: 'shareholder',        label: 'Shareholder',        group: 'Equity',     help: 'Holds stock in a corporation.',                        categories: ['business'] },
  { id: 'gp',                 label: 'General Partner',    group: 'Equity',     help: 'GP — full management authority and liability.',        categories: ['business'] },
  { id: 'lp',                 label: 'Limited Partner',    group: 'Equity',     help: 'LP — passive equity, no management.',                  categories: ['business'] },
  { id: 'joint_tenant',       label: 'Joint tenant (JTWROS)', group: 'Equity',  help: 'Joint tenancy with right of survivorship.',           categories: ['property'] },
  { id: 'tenant_in_common',   label: 'Tenant in common',   group: 'Equity',     help: 'Co-owner with a divisible undivided interest (no survivorship).', categories: ['property'] },
  { id: 'community_property', label: 'Community property', group: 'Equity',     help: 'Spousal community-property interest.',                 categories: ['property'] },

  // ── Management ──────────────────────────────────────────────────
  { id: 'manager',            label: 'Manager',            group: 'Management', help: 'Day-to-day management (e.g., LLC manager).',           categories: ['business', 'specialized', 'property'] },
  { id: 'officer',            label: 'Officer',            group: 'Management', help: 'Officer (President, CEO, CFO, Secretary, Treasurer).', categories: ['business', 'charity', 'specialized'] },
  { id: 'director',           label: 'Director / Board',   group: 'Management', help: 'Sits on the board.',                                   categories: ['business', 'charity'] },
  { id: 'registered_agent',   label: 'Registered agent',   group: 'Management', help: 'Statutory agent for service of process.',              categories: ['business', 'charity', 'specialized', 'trust'] },

  // ── Trust roles ────────────────────────────────────────────────
  { id: 'grantor',            label: 'Grantor / Settlor',  group: 'Trust',      help: 'Created and funded the trust.',                        categories: ['trust'] },
  { id: 'trustee',            label: 'Trustee',            group: 'Trust',      help: 'Sole or current trustee — fiduciary administration.',  categories: ['trust', 'charity'] },
  { id: 'co_trustee',         label: 'Co-trustee',         group: 'Trust',      help: 'Acts jointly with another trustee.',                   categories: ['trust', 'charity'] },
  { id: 'successor_trustee',  label: 'Successor trustee',  group: 'Trust',      help: 'Steps in if the current trustee resigns or dies.',     categories: ['trust', 'charity'] },
  { id: 'trust_protector',    label: 'Trust protector',    group: 'Trust',      help: 'Modify trustees / amend administrative provisions.',   categories: ['trust'] },
  { id: 'investment_trustee', label: 'Investment trustee', group: 'Trust',      help: 'Trustee for investment decisions (directed-trust split).', categories: ['trust'] },
  { id: 'distribution_trustee', label: 'Distribution trustee', group: 'Trust',  help: 'Trustee for distribution decisions (directed-trust split).', categories: ['trust'] },

  // ── Beneficiary types ──────────────────────────────────────────
  { id: 'beneficiary',            label: 'Beneficiary',            group: 'Beneficiary', help: 'Receives benefits from this entity.',                          categories: ['*'] },
  { id: 'income_beneficiary',     label: 'Income beneficiary',     group: 'Beneficiary', help: 'Receives the income generated by the trust.',                  categories: ['trust'] },
  { id: 'remainder_beneficiary',  label: 'Remainder beneficiary',  group: 'Beneficiary', help: 'Receives the remaining principal at trust termination.',        categories: ['trust', 'property'] },
  { id: 'contingent_beneficiary', label: 'Contingent beneficiary', group: 'Beneficiary', help: 'Receives only if a primary beneficiary cannot.',                categories: ['trust', '*'] },
  { id: 'lifetime_beneficiary',   label: 'Lifetime beneficiary',   group: 'Beneficiary', help: 'Beneficiary for life (e.g., QTIP / life-estate beneficiary).',  categories: ['trust', 'property'] },

  // ── Charity-specific ───────────────────────────────────────────
  { id: 'founder',            label: 'Founder',            group: 'Charity',    help: 'Established the charitable entity.',                  categories: ['charity'] },
  { id: 'donor',              label: 'Donor',              group: 'Charity',    help: 'Made a substantial gift to the charity.',             categories: ['charity'] },

  // ── Other relationships ────────────────────────────────────────
  { id: 'custodian',          label: 'Custodian (UTMA/UGMA)', group: 'Other',  help: 'Custodian of a minor account.',                        categories: ['*'] },
  { id: 'power_of_attorney',  label: 'Power of Attorney',  group: 'Other',      help: 'Holds POA over this entity / its account.',           categories: ['*'] },
  { id: 'authorized_signer',  label: 'Authorized signer',  group: 'Other',      help: 'Authorized to sign on behalf of the entity.',         categories: ['business', 'specialized', 'charity', 'trust'] },
  { id: 'guarantor',          label: 'Guarantor',          group: 'Other',      help: 'Personally guarantees the entity\'s obligations.',    categories: ['business', 'specialized'] },
  { id: 'remainderman',       label: 'Remainderman',       group: 'Other',      help: 'Holds the future interest after a life estate.',      categories: ['property', 'trust'] },
];

/**
 * Roles relevant for a given entity bucket. When `includeAll` is
 * true (or `category` is missing), returns the entire catalog so
 * unusual pairings remain reachable via a "Show all roles" toggle.
 */
export function rolesForCategory(category, includeAll = false) {
  if (!category || includeAll) return ROLE_OPTIONS;
  return ROLE_OPTIONS.filter((r) =>
    (r.categories || []).includes(category) || (r.categories || []).includes('*')
  );
}

/**
 * Equity-style roles that imply an ownership %. Used by the wizard,
 * detail panel, and chart to decide when to surface the % field /
 * label / edge stroke-width scaling.
 */
export const EQUITY_ROLES = new Set([
  'owner', 'member', 'shareholder', 'gp', 'lp',
  'joint_tenant', 'tenant_in_common', 'community_property',
]);
export const isEquityRole = (role) => EQUITY_ROLES.has(role);

// Buckets: Step 1 of the wizard
export const BUCKETS = [
  {
    id: 'business',
    icon: 'Building2',
    label: 'A business',
    sub: 'LLCs, corporations, partnerships',
    accent: 'steel',
  },
  {
    id: 'trust',
    icon: 'Shield',
    label: 'A trust',
    sub: 'Revocable, irrevocable, dynasty, charitable, special needs',
    accent: 'indigo',
  },
  {
    id: 'charity',
    icon: 'Landmark',
    label: 'A charity or foundation',
    sub: 'Nonprofit, private foundation, social welfare',
    accent: 'champagne',
  },
  {
    id: 'property',
    icon: 'Home',
    label: 'Something that holds property',
    sub: 'Land trust, Series LLC, Delaware Statutory Trust',
    accent: 'teal',
  },
  {
    id: 'existing_beneficiary',
    icon: 'UserCheck',
    label: 'Connect someone already in my chart to an entity',
    sub: 'Yourself, a beneficiary, or an outside person → an existing entity',
    accent: 'champagne',
  },
  {
    id: 'external_person',
    icon: 'User',
    label: 'A person or entity who/that isn\'t in my beneficiaries list',
    sub: 'Outside trustee, business partner, third party',
    accent: 'slate',
  },
  {
    id: 'specialized',
    icon: 'Settings',
    label: 'Something specialized',
    sub: 'Family office, captive insurance, PTC, SPV, holding company',
    accent: 'slate',
  },
];

// Types per bucket. accent overrides bucket default per type.
// state_relevant = surface "Formation state" input.
export const TYPES = {
  business: [
    { id: 'sole_prop',       friendly: 'Sole Proprietorship',                   legal: 'Sole Proprietorship',                          accent: 'steel',  state_relevant: false, blurb: 'You and the business are the same in the eyes of the law. Simple to start, but you carry all the risk personally.' },
    { id: 'gen_partnership', friendly: 'General Partnership',                   legal: 'General Partnership (GP)',                     accent: 'steel',  state_relevant: false, blurb: 'Two or more people running a business together. Every partner shares in the profits AND the personal risk.' },
    { id: 'lp',              friendly: 'Limited Partnership',                   legal: 'Limited Partnership (LP)',                     accent: 'steel',  state_relevant: true,  blurb: 'A partnership with a “boss” partner who runs things and silent partners who just put money in.' },
    { id: 'flp',             friendly: 'Family Limited Partnership',            legal: 'Family Limited Partnership (FLP)',             accent: 'steel',  state_relevant: true,  blurb: 'Used to gift business or investment value to family at a discount while you keep control.' },
    { id: 'llp',             friendly: 'Limited Liability Partnership',         legal: 'Limited Liability Partnership (LLP)',          accent: 'steel',  state_relevant: true,  blurb: 'Common for law firms and accountants. Each partner is shielded from the others’ mistakes.' },
    { id: 'lllp',            friendly: 'Limited Liability Limited Partnership', legal: 'Limited Liability Limited Partnership (LLLP)', accent: 'steel',  state_relevant: true,  blurb: 'A stronger version of an LP — the “boss” partner also gets liability protection. Available in some states.' },
    { id: 'llc',             friendly: 'Limited Liability Company',             legal: 'Limited Liability Company (LLC)',              accent: 'steel',  state_relevant: true,  blurb: 'The most popular flexible business shell. Owners are called “members” and aren’t personally on the hook for the company’s debts.' },
    { id: 'pllc',            friendly: 'Professional LLC',                      legal: 'Professional LLC (PLLC)',                      accent: 'steel',  state_relevant: true,  blurb: 'An LLC for licensed professionals — doctors, lawyers, architects.' },
    { id: 'l3c',             friendly: 'Low-Profit LLC',                        legal: 'Low-Profit LLC (L3C)',                         accent: 'steel',  state_relevant: true,  blurb: 'A for-profit LLC with a built-in social mission. Available in some states.' },
    { id: 'c_corp',          friendly: 'C Corporation',                         legal: 'C-Corporation',                                accent: 'steel',  state_relevant: true,  blurb: 'A standard corporation. Pays its own taxes; owners (shareholders) pay tax again on dividends.' },
    { id: 's_corp',          friendly: 'S Corporation',                         legal: 'S-Corporation',                                accent: 'steel',  state_relevant: true,  blurb: 'A corporation whose profits flow straight to the owners’ tax returns. Limits on who can own one.' },
    { id: 'pc',              friendly: 'Professional Corporation',              legal: 'Professional Corporation (P.C.)',              accent: 'steel',  state_relevant: true,  blurb: 'A corporation for licensed professionals.' },
    { id: 'b_corp',          friendly: 'Benefit Corporation',                   legal: 'Benefit Corporation (B-Corp)',                 accent: 'steel',  state_relevant: true,  blurb: 'A for-profit corporation legally committed to a social or environmental mission.' },
    { id: 'close_corp',      friendly: 'Close Corporation',                     legal: 'Close Corporation',                            accent: 'steel',  state_relevant: true,  blurb: 'A corporation with very few shareholders and fewer formalities.' },
    { id: 'cooperative',     friendly: 'Cooperative (Co-op)',                   legal: 'Cooperative',                                  accent: 'steel',  state_relevant: true,  blurb: 'A business owned and democratically run by its members.' },
  ],

  trust: [
    { id: 'unspecified',      friendly: 'Trust (pick type)',                legal: 'Trust — type not yet specified',            accent: 'indigo', state_relevant: false, blurb: 'Placeholder trust tile dropped here from your QuickStart Wizard. Tap Edit and choose the exact trust type so the rest of the chart, the AI, and your guide use the right language.' },
    { id: 'revocable_living', friendly: 'Revocable Living Trust',           legal: 'Revocable Living Trust (RLT)',              accent: 'indigo', state_relevant: false, blurb: 'A trust you can change or cancel anytime while you’re alive. Avoids probate but offers no asset protection.' },
    { id: 'irrevocable',      friendly: 'Irrevocable Trust (general)',      legal: 'Irrevocable Trust',                         accent: 'bronze', state_relevant: false, blurb: 'A trust that locks in once created. You give up control in exchange for tax savings and asset protection.' },
    { id: 'testamentary',     friendly: 'Testamentary Trust',               legal: 'Testamentary Trust',                        accent: 'indigo', state_relevant: false, blurb: 'A trust written into your will that comes alive only when you pass away.' },
    { id: 'ilit',             friendly: 'Life Insurance Trust',             legal: 'Irrevocable Life Insurance Trust (ILIT)',   accent: 'bronze', state_relevant: false, blurb: 'A trust that owns a life insurance policy so the payout doesn’t count as part of your taxable estate.' },
    { id: 'grat',             friendly: 'GRAT — Grantor Retained Annuity Trust', legal: 'Grantor Retained Annuity Trust (GRAT)', accent: 'bronze', state_relevant: false, blurb: 'Lets you pass appreciating assets (like fast-growing stock) to family with very little gift tax.' },
    { id: 'grut',             friendly: 'GRUT — Grantor Retained Unitrust', legal: 'Grantor Retained Unitrust (GRUT)',          accent: 'bronze', state_relevant: false, blurb: 'Like a GRAT but pays you a percentage of the trust value each year instead of a fixed amount.' },
    { id: 'slat',             friendly: 'Spousal Lifetime Access Trust',    legal: 'Spousal Lifetime Access Trust (SLAT)',      accent: 'bronze', state_relevant: false, blurb: 'You make a tax-smart gift to your spouse’s trust — the family still effectively has access to the money.' },
    { id: 'idgt',             friendly: 'IDGT — Intentionally Defective Grantor Trust', legal: 'Intentionally Defective Grantor Trust (IDGT)', accent: 'bronze', state_relevant: false, blurb: 'You pay the income tax bill so the trust grows tax-free for your heirs. The “defect” is intentional and helpful.' },
    { id: 'qprt',             friendly: 'QPRT — Personal Residence Trust',  legal: 'Qualified Personal Residence Trust (QPRT)', accent: 'indigo', state_relevant: false, blurb: 'Lets you transfer your home to heirs at a discounted gift value while you keep living there.' },
    { id: 'qtip',             friendly: 'QTIP / Marital Trust',             legal: 'Qualified Terminable Interest Property Trust (QTIP)', accent: 'indigo', state_relevant: false, blurb: 'Provides for your surviving spouse for life, then passes what’s left to your chosen heirs (often kids from a prior marriage).' },
    { id: 'bypass',           friendly: 'Bypass / Credit Shelter Trust',    legal: 'Bypass / AB / Credit Shelter Trust',        accent: 'indigo', state_relevant: false, blurb: 'Uses each spouse’s estate-tax exemption so as much as possible passes to the kids tax-free.' },
    { id: 'gst_dynasty',      friendly: 'Dynasty Trust',                    legal: 'Generation-Skipping Transfer (GST) / Dynasty Trust', accent: 'bronze', state_relevant: true,  blurb: 'A long-lived trust designed to benefit children, grandchildren, and beyond — sometimes for centuries.' },
    { id: 'dapt',             friendly: 'Asset Protection Trust',           legal: 'Domestic Asset Protection Trust (DAPT / Legacy Trust)', accent: 'bronze', state_relevant: true, blurb: 'A trust you fund for yourself that creditors usually can’t reach. Available in select states like NV, DE, OH.' },
    { id: 'snt',              friendly: 'Special Needs Trust',              legal: 'Special Needs / Supplemental Needs Trust (SNT)', accent: 'indigo', state_relevant: false, blurb: 'Provides for a disabled loved one without disqualifying them from government benefits like SSI or Medicaid.' },
    { id: 'crt',              friendly: 'Charitable Remainder Trust',       legal: 'Charitable Remainder Trust (CRT / CRAT / CRUT)', accent: 'indigo', state_relevant: false, blurb: 'You get income for life or a set period, and what’s left goes to charity.' },
    { id: 'clt',              friendly: 'Charitable Lead Trust',            legal: 'Charitable Lead Trust (CLT)',               accent: 'indigo', state_relevant: false, blurb: 'Charity gets income first; your heirs get whatever remains at the end.' },
    { id: 'spendthrift',      friendly: 'Spendthrift Trust',                legal: 'Spendthrift Trust',                         accent: 'indigo', state_relevant: false, blurb: 'Protects a beneficiary from blowing through their inheritance — and from creditors.' },
    { id: 'crummey',          friendly: 'Crummey Trust',                    legal: 'Crummey Trust',                             accent: 'indigo', state_relevant: false, blurb: 'Lets gifts to the trust qualify for the annual gift-tax exclusion via short-term withdrawal rights.' },
    { id: 'qdot',             friendly: 'QDOT — Non-Citizen Spouse Trust',  legal: 'Qualified Domestic Trust (QDOT)',           accent: 'indigo', state_relevant: false, blurb: 'A special trust used when your spouse isn’t a U.S. citizen, so the marital deduction still applies.' },
    { id: 'pet_trust',        friendly: 'Pet Trust',                        legal: 'Pet Trust',                                 accent: 'indigo', state_relevant: false, blurb: 'Sets aside money to care for your animals after you’re gone.' },
    { id: 'minor_trust',      friendly: 'Minor’s Trust',                    legal: 'Minor Trust',                               accent: 'indigo', state_relevant: false, blurb: 'Holds property for a child until they reach the age you choose.' },
    { id: 'ira_ben_trust',    friendly: 'IRA Beneficiary Trust',            legal: 'Stand-Alone IRA Beneficiary Trust',         accent: 'indigo', state_relevant: false, blurb: 'A specialized trust that receives an IRA so the heir’s payouts (and protection) are managed thoughtfully.' },
    { id: 'medicaid_apt',     friendly: 'Medicaid Asset Protection Trust',  legal: 'Medicaid Asset Protection Trust (MAPT)',    accent: 'bronze', state_relevant: false, blurb: 'Helps qualify for Medicaid long-term care while preserving assets for heirs (5-year look-back rules apply).' },
    { id: 'blind_trust',      friendly: 'Blind Trust',                      legal: 'Blind Trust',                               accent: 'indigo', state_relevant: false, blurb: 'You hand assets to a trustee and get no information about how they’re managed — common for public officials.' },
    { id: 'esbt',             friendly: 'ESBT — S-Corp Stock Trust',        legal: 'Electing Small Business Trust (ESBT)',      accent: 'indigo', state_relevant: false, blurb: 'A trust eligible to hold S-corporation stock without breaking the S-election.' },
    { id: 'qsst',             friendly: 'QSST — S-Corp Stock Trust',        legal: 'Qualified Subchapter S Trust (QSST)',       accent: 'indigo', state_relevant: false, blurb: 'Another trust type allowed to own S-corporation stock — different rules than ESBT.' },
    { id: 'ing_trust',        friendly: 'ING / NING / DING / CING Trust',   legal: 'Incomplete Gift Non-Grantor Trust',         accent: 'bronze', state_relevant: true,  blurb: 'An advanced trust designed to reduce state income tax. Funded in NV, DE, OH, WY etc.' },
    { id: 'foreign_trust',    friendly: 'Foreign Trust',                    legal: 'Foreign Trust',                             accent: 'bronze', state_relevant: false, blurb: 'A trust formed under non-U.S. law. Heavy U.S. reporting if you’re a U.S. person.' },
  ],

  charity: [
    { id: 'nonprofit_501c3',   friendly: '501(c)(3) Nonprofit',          legal: '501(c)(3) Nonprofit Corporation',                     accent: 'champagne', state_relevant: true, blurb: 'A tax-exempt charity. Donations are usually tax-deductible.' },
    { id: 'private_foundation',friendly: 'Private Foundation',           legal: 'Private Non-Operating Foundation (501(c)(3))',         accent: 'champagne', state_relevant: true, blurb: 'A family-controlled charity, must give away at least 5% per year. Common UHNW legacy vehicle.' },
    { id: 'nonprofit_501c4',   friendly: '501(c)(4) Social Welfare',     legal: '501(c)(4) Social Welfare Organization',                accent: 'champagne', state_relevant: true, blurb: 'Tax-exempt social-welfare org. More flexible on advocacy than a (c)(3); donations usually NOT tax-deductible.' },
  ],

  property: [
    { id: 'series_llc',       friendly: 'Series LLC',                 legal: 'Series LLC',                                  accent: 'teal', state_relevant: true,  blurb: 'A “parent” LLC with multiple internal sleeves — each sleeve walled off so a problem in one doesn’t affect the others.' },
    { id: 'land_trust',       friendly: 'Land Trust',                 legal: 'Land Trust / Title-Holding Trust',            accent: 'teal', state_relevant: true,  blurb: 'A trust that holds title to real estate, often used for privacy.' },
    { id: 'dst',              friendly: 'Delaware Statutory Trust',   legal: 'Delaware Statutory Trust (DST)',              accent: 'teal', state_relevant: false, blurb: 'A statutory trust commonly used for real estate investments and 1031 exchanges.' },
    { id: 'mass_business',    friendly: 'Massachusetts Business Trust', legal: 'Massachusetts Business Trust',              accent: 'teal', state_relevant: false, blurb: 'A trust that operates like a corporation — rare, but used in some investment structures.' },
  ],

  specialized: [
    { id: 'ptc',              friendly: 'Private Trust Company',      legal: 'Private Trust Company (PTC)',                 accent: 'slate', state_relevant: true,  blurb: 'A family-owned “bank” that acts as trustee for the family’s trusts. Licensed in select states.' },
    { id: 'family_office',    friendly: 'Family Office',              legal: 'Family Office (LLC / Corp / FLP)',            accent: 'slate', state_relevant: true,  blurb: 'A central management vehicle that runs investments, taxes, and household affairs for a wealthy family.' },
    { id: 'captive_insurance',friendly: 'Captive Insurance Company',  legal: 'Captive Insurance Company',                   accent: 'slate', state_relevant: true,  blurb: 'A small insurance company you own that insures the risks of your other businesses.' },
    { id: 'spv',              friendly: 'Special Purpose Vehicle',    legal: 'Special Purpose Vehicle / Entity (SPV / SPE)', accent: 'slate', state_relevant: true,  blurb: 'A throwaway company created for a single deal — common in real estate and finance.' },
    { id: 'holding_co',       friendly: 'Holding Company',            legal: 'Holding Company / Shell Company',             accent: 'slate', state_relevant: true,  blurb: 'A company whose only job is to own other companies. Used for layering and privacy.' },
    { id: 'probate_estate',   friendly: 'Decedent’s Estate',          legal: 'Decedent’s Estate / Probate Estate',          accent: 'slate', state_relevant: false, blurb: 'A temporary legal “shell” that exists between a person’s death and the distribution of their belongings.' },
  ],
};

// Quick lookup helper
export const getTypeMeta = (bucketId, typeId) => {
  const list = TYPES[bucketId] || [];
  return list.find((t) => t.id === typeId) || null;
};

export const getBucketMeta = (bucketId) => BUCKETS.find((b) => b.id === bucketId) || null;

// Resolve the colour palette for a given entity row (db doc).
// Falls back to the bucket's default accent when the type override is missing.
export const getEntityPalette = (entity) => {
  if (!entity) return PALETTE.slate;
  const meta = getTypeMeta(entity.category, entity.type);
  const accent = meta?.accent || getBucketMeta(entity.category)?.accent || 'slate';
  return PALETTE[accent] || PALETTE.slate;
};

// US states list (no DC for entity formation purposes — though some accept it)
export const FORMATION_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

export default { BUCKETS, TYPES, ROLE_OPTIONS, ROLE_PALETTE, PALETTE, FORMATION_STATES };
