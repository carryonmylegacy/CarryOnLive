/**
 * Feature gating utilities.
 *
 * Maps frontend routes to feature keys so that navigation items
 * and dashboard cards can be hidden when a feature is gated for
 * the user's subscription tier.
 */

// Map of route path → feature key
const ROUTE_TO_FEATURE = {
  '/beneficiaries': 'beneficiaries',
  '/messages': 'mm',
  '/checklist': 'iac',
  '/vault': 'sdv',
  '/guardian': 'ega',
  '/ffn': 'ffn',
  '/digital-wallet': 'dav',
  '/trustee': 'dts',
  '/timeline': 'timeline',
  '/estate-chat': 'ect',
  '/connected-protocol': 'ccp',
  '/financial': 'cfp',
  '/entities': 'ces',
  '/beneficiary/estate-chat': 'ect',
  '/beneficiary/connected-protocol': 'ccp',
  '/beneficiary/financial': 'cfp',
  '/beneficiary/entities': 'ces',
};

/**
 * Check if a given route is enabled for the user.
 * @param {string} route - e.g. '/vault'
 * @param {string[]|null} enabledFeatures - array of enabled feature keys, null = all enabled
 * @returns {boolean}
 */
export const isFeatureEnabled = (route, enabledFeatures) => {
  // null means all features are enabled (beta mode, trial, etc.)
  if (!enabledFeatures) return true;
  const featureKey = ROUTE_TO_FEATURE[route];
  // Routes without a feature key (dashboard, settings, etc.) are always enabled
  if (!featureKey) return true;
  return enabledFeatures.includes(featureKey);
};

/**
 * Filter an array of navigation items by enabled features.
 * Each item must have a `to` property matching a route.
 * @param {Array} items - nav items with `to` property
 * @param {string[]|null} enabledFeatures
 * @returns {Array} filtered items
 */
export const filterNavByFeatures = (items, enabledFeatures) => {
  if (!enabledFeatures) return items;
  return items.filter(item => isFeatureEnabled(item.to, enabledFeatures));
};

/**
 * Check if a feature key is enabled.
 * @param {string} featureKey - e.g. 'sdv', 'ega'
 * @param {string[]|null} enabledFeatures
 * @returns {boolean}
 */
export const isFeatureKeyEnabled = (featureKey, enabledFeatures) => {
  if (!enabledFeatures) return true;
  return enabledFeatures.includes(featureKey);
};
