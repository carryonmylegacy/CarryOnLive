/**
 * Apple In-App Purchase service for the native iOS app.
 * Uses StoreKit 2 via @capgo/native-purchases.
 * Web/PWA continues using Stripe — this is iOS-only.
 */
import { isNative } from './native';
import { API_URL } from '../config';

// Product IDs must match exactly what's in App Store Connect
export const IAP_PRODUCTS = {
  // ── Benefactor Plans ──
  premium_monthly: 'us.carryon.app.premium_monthly',
  premium_quarterly: 'us.carryon.app.premium_quarterly',
  premium_annual: 'us.carryon.app.premium_annual',
  standard_monthly: 'us.carryon.app.standard_monthly',
  standard_quarterly: 'us.carryon.app.standard_quarterly',
  standard_annual: 'us.carryon.app.standard_annual',
  base_monthly: 'us.carryon.app.base_monthly',
  base_quarterly: 'us.carryon.app.base_quarterly',
  base_annual: 'us.carryon.app.base_annual',
  new_adult_monthly: 'us.carryon.app.new_adult_monthly',
  new_adult_quarterly: 'us.carryon.app.new_adult_quarterly',
  new_adult_annual: 'us.carryon.app.new_adult_annual',
  military_monthly: 'us.carryon.app.military_monthly',
  military_quarterly: 'us.carryon.app.military_quarterly',
  military_annual: 'us.carryon.app.military_annual',
  veteran_monthly: 'us.carryon.app.veteran_monthly',
  veteran_quarterly: 'us.carryon.app.veteran_quarterly',
  veteran_annual: 'us.carryon.app.veteran_annual',
  // ── Beneficiary Plans ──
  ben_premium_monthly: 'us.carryon.app.ben_premium_monthly',
  ben_premium_quarterly: 'us.carryon.app.ben_premium_quarterly',
  ben_premium_annual: 'us.carryon.app.ben_premium_annual',
  ben_standard_monthly: 'us.carryon.app.ben_standard_monthly',
  ben_standard_quarterly: 'us.carryon.app.ben_standard_quarterly',
  ben_standard_annual: 'us.carryon.app.ben_standard_annual',
  ben_base_monthly: 'us.carryon.app.ben_base_monthly',
  ben_base_quarterly: 'us.carryon.app.ben_base_quarterly',
  ben_base_annual: 'us.carryon.app.ben_base_annual',
  ben_military_monthly: 'us.carryon.app.ben_military_monthly',
  ben_military_quarterly: 'us.carryon.app.ben_military_quarterly',
  ben_military_annual: 'us.carryon.app.ben_military_annual',
  ben_veteran_monthly: 'us.carryon.app.ben_veteran_monthly',
  ben_veteran_quarterly: 'us.carryon.app.ben_veteran_quarterly',
  ben_veteran_annual: 'us.carryon.app.ben_veteran_annual',
  ben_hospice_monthly: 'us.carryon.app.ben_hospice_monthly',
};

const ALL_PRODUCT_IDS = Object.values(IAP_PRODUCTS);

let NativePurchasesPlugin = null;
let PURCHASE_TYPE = null;

async function getPurchasesPlugin() {
  if (!isNative) return null;
  if (NativePurchasesPlugin) return NativePurchasesPlugin;
  try {
    const mod = await import('@capgo/native-purchases');
    NativePurchasesPlugin = mod.NativePurchases;
    PURCHASE_TYPE = mod.PURCHASE_TYPE;
    return NativePurchasesPlugin;
  } catch (err) {
    console.error('[IAP] Failed to load native-purchases plugin:', err);
    return null;
  }
}

export async function isIAPAvailable() {
  const plugin = await getPurchasesPlugin();
  if (!plugin) return false;
  try {
    const { isBillingSupported } = await plugin.isBillingSupported();
    return isBillingSupported;
  } catch (err) {
    console.error('[IAP] isBillingSupported check failed:', err);
    return false;
  }
}

export async function getIAPProducts() {
  const plugin = await getPurchasesPlugin();
  if (!plugin) return [];
  try {
    const { products } = await plugin.getProducts({
      productIdentifiers: ALL_PRODUCT_IDS,
      productType: PURCHASE_TYPE?.SUBS || 'SUBS',
    });
    return products.map(p => ({
      productId: p.identifier,
      title: p.title,
      description: p.description,
      price: p.price,
      priceString: p.priceString,
      currency: p.currencyCode,
    }));
  } catch (err) {
    console.error('[IAP] Failed to fetch products:', err);
    return [];
  }
}

export async function purchaseIAP(productId) {
  const plugin = await getPurchasesPlugin();
  if (!plugin) throw new Error('IAP not available');

  console.log('[IAP] Starting purchase for:', productId);

  try {
    // Wrap purchase in a timeout so it never hangs indefinitely
    const result = await Promise.race([
      plugin.purchaseProduct({
        productIdentifier: productId,
        productType: PURCHASE_TYPE?.SUBS || 'SUBS',
        quantity: 1,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Purchase timed out. Please try again.')), 120000)
      ),
    ]);

    console.log('[IAP] Purchase completed, validating with server...');

    // Send receipt + transaction to backend for server-side Apple verification
    const token = localStorage.getItem('carryon_token');
    const res = await fetch(`${API_URL}/subscriptions/validate-apple-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        receipt: result.receipt || '',
        transaction_id: result.transactionIdentifier,
        product_id: productId,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Server validation failed');
    }

    console.log('[IAP] Server validation successful');
    return await res.json();
  } catch (err) {
    console.error('[IAP] Purchase error:', err);
    // Check for user cancellation (various plugin error formats)
    const msg = (err.message || err.code || '').toLowerCase();
    if (msg.includes('cancel') || msg.includes('e_user_cancelled')) {
      return { cancelled: true };
    }
    throw err;
  }
}

export async function restoreIAPPurchases() {
  const plugin = await getPurchasesPlugin();
  if (!plugin) throw new Error('IAP not available');

  try {
    console.log('[IAP] Restoring purchases...');
    await plugin.restorePurchases();

    // Re-validate with backend
    const token = localStorage.getItem('carryon_token');
    await fetch(`${API_URL}/subscriptions/sync-apple`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    console.log('[IAP] Restore complete');
    return { success: true };
  } catch (err) {
    console.error('[IAP] Restore failed:', err);
    throw err;
  }
}
