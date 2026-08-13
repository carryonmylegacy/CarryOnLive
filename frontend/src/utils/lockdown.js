/**
 * SDV-only lockdown + trustee-boundary helpers (Aug 2026 founder rules).
 *
 * Lockdown: when subscriptionStatus.sdv_only_lockdown is true (trial
 * expired, no subscription, no overrides) every feature EXCEPT the
 * Secure Document Vault is disabled — buttons stay visible but greyed,
 * a persistent banner explains why, and the backend refuses the writes.
 *
 * Trustee boundary: Milestone Messages are fully off-limits inside a
 * trustee (manager clicked-in) session — they're personal letters.
 */

export const isFeatureKeyLocked = (featureKey, { lockdown = false, trusteeMode = false } = {}) => {
  if (trusteeMode && featureKey === 'mm') return true;
  if (lockdown && featureKey && featureKey !== 'sdv') return true;
  return false;
};

const ALLOWED_NAV_IN_LOCKDOWN = [
  '/dashboard', '/vault', '/settings', '/subscription',
  '/security-settings', '/support', '/pro/clients',
];

export const isNavRouteLocked = (to, { lockdown = false, trusteeMode = false } = {}) => {
  if (trusteeMode && typeof to === 'string' && to.startsWith('/messages')) return true;
  if (!lockdown || typeof to !== 'string') return false;
  if (ALLOWED_NAV_IN_LOCKDOWN.includes(to) || to.startsWith('/vault') || to.startsWith('/section/')) return false;
  return true;
};
