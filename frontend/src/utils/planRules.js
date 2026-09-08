// Founder-defined plan rules, read from /subscriptions/plans. Nothing here hardcodes a tier id,
// an age, a discount, or a document list — the portal owns all of it.

export const hasAgeWindow = (p) => p?.age_min != null || p?.age_max != null;

// "18–25" · "65+" · "" when the plan has no age window
export const ageLabel = (p) => {
  if (!hasAgeWindow(p)) return '';
  if (p.age_max != null) return `${p.age_min ?? 0}–${p.age_max}`;
  return `${p.age_min}+`;
};

// "Seniors (65+)" · "New Adult (18–25)" · "Military / First Responder"
export const tierDisplayName = (p) => (hasAgeWindow(p) ? `${p.name} (${ageLabel(p)})` : p?.name || '');

// Discount tiers are the ones that require eligibility (verification); the rest are the main tiers.
export const isDiscountTier = (p) => !!p?.requires_verification;

// Age-window tiers are unlocked by date of birth (eligible_tiers from /subscriptions/status);
// every other tier is selectable and, if it requires verification, verifies before checkout.
export const isAgeEligible = (p, eligibleTiers) => !hasAgeWindow(p) || (eligibleTiers || []).includes(p.id);
export const verifiesBeforeCheckout = (p) => !!p?.requires_verification && !hasAgeWindow(p);

export const verificationDocs = (p) => p?.verification_docs || [];

// Card badge: "Verified · 65+" / "Verified" / null
export const verificationBadge = (p) => {
  if (!p?.requires_verification) return null;
  return hasAgeWindow(p) ? `Verified · ${ageLabel(p)}` : 'Verified';
};

// "Eligible for a discount? Military / First Responder, Veteran, Hospice, Seniors (65+), New Adult (18–25),
//  and Enterprise / B2B Partner have dedicated tiers."
export const discountTiersBlurb = (plans) => {
  const names = (plans || []).filter(isDiscountTier).map(tierDisplayName);
  if (!names.length) return '';
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}` : names[0];
  return `Eligible for a discount? ${list} have dedicated tiers.`;
};

// Highest founder-set saving for a cycle across the plans shown — the billing-toggle badge.
export const maxCycleSaving = (plans, cycle) =>
  Math.max(0, ...(plans || []).map((p) => Number(p?.[`${cycle}_discount_percent`]) || 0));

export const savingsLabel = (plans, cycle) => {
  const pct = maxCycleSaving(plans, cycle);
  return pct > 0 ? `Save ${pct}%` : null;
};
