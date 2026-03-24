/**
 * Apple In-App Purchase service for the native iOS app.
 * Uses StoreKit 2 via @capgo/native-purchases.
 * Web/PWA continues using Stripe — this is iOS-only.
 */
import { isNative } from './native';
import { API_URL } from '../config';

// Product IDs must match EXACTLY what's in App Store Connect
// Prefix: us.carryon.app.v2.
export const IAP_PRODUCTS = {
  // ── Benefactor Plans ──
  premium_monthly: 'us.carryon.app.v2.premium_monthly',
  premium_quarterly: 'us.carryon.app.v2.premium_quarterly',
  premium_annual: 'us.carryon.app.v2.premium_annual',
  standard_monthly: 'us.carryon.app.v2.standard_monthly',
  standard_quarterly: 'us.carryon.app.v2.standard_quarterly',
  standard_annual: 'us.carryon.app.v2.standard_annual',
  base_monthly: 'us.carryon.app.v2.base_monthly',
  base_quarterly: 'us.carryon.app.v2.base_quarterly',
  base_annual: 'us.carryon.app.v2.base_annual',
  new_adult_monthly: 'us.carryon.app.v2.new_adult_monthly',
  new_adult_quarterly: 'us.carryon.app.v2.new_adult_quarterly',
  new_adult_annual: 'us.carryon.app.v2.new_adult_annual',
  military_monthly: 'us.carryon.app.v2.military_monthly',
  military_quarterly: 'us.carryon.app.v2.military_quarterly',
  military_annual: 'us.carryon.app.v2.military_annual',
  veteran_monthly: 'us.carryon.app.v2.veteran_monthly',
  veteran_quarterly: 'us.carryon.app.v2.veteran_quarterly',
  veteran_annual: 'us.carryon.app.v2.veteran_annual',
  // ── Beneficiary Plans ──
  ben_premium_monthly: 'us.carryon.app.v2.ben_premium_monthly',
  ben_premium_quarterly: 'us.carryon.app.v2.ben_premium_quarterly',
  ben_premium_annual: 'us.carryon.app.v2.ben_premium_annual',
  ben_standard_monthly: 'us.carryon.app.v2.ben_standard_monthly',
  ben_standard_quarterly: 'us.carryon.app.v2.ben_standard_quarterly',
  ben_standard_annual: 'us.carryon.app.v2.ben_standard_annual',
  ben_base_monthly: 'us.carryon.app.v2.ben_base_monthly',
  ben_base_quarterly: 'us.carryon.app.v2.ben_base_quarterly',
  ben_base_annual: 'us.carryon.app.v2.ben_base_annual',
  ben_military_monthly: 'us.carryon.app.v2.ben_military_monthly',
  ben_military_quarterly: 'us.carryon.app.v2.ben_military_quarterly',
  ben_military_annual: 'us.carryon.app.v2.ben_military_annual',
  ben_veteran_monthly: 'us.carryon.app.v2.ben_veteran_monthly',
  ben_veteran_quarterly: 'us.carryon.app.v2.ben_veteran_quarterly',
  ben_veteran_annual: 'us.carryon.app.v2.ben_veteran_annual',
  ben_hospice_monthly: 'us.carryon.app.v2.ben_hospice_monthly',
  ben_hospice_quarterly: 'us.carryon.app.v2.ben_hospice_quarterly',
  ben_hospice_annual: 'us.carryon.app.v2.ben_hospice_annual',
};

const ALL_PRODUCT_IDS = Object.values(IAP_PRODUCTS);

let NativePurchasesPlugin = null;
let PURCHASE_TYPE_ENUM = null;

async function getPurchasesPlugin() {
  if (!isNative) return null;
  if (NativePurchasesPlugin) return NativePurchasesPlugin;
  try {
    const mod = await import('@capgo/native-purchases');
    NativePurchasesPlugin = mod.NativePurchases;
    PURCHASE_TYPE_ENUM = mod.PURCHASE_TYPE;
    console.log('[IAP] Plugin loaded, PURCHASE_TYPE:', PURCHASE_TYPE_ENUM);
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
    console.log('[IAP] isBillingSupported:', isBillingSupported);
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
    const subsType = PURCHASE_TYPE_ENUM?.SUBS || 'subs';
    const { products } = await plugin.getProducts({
      productIdentifiers: ALL_PRODUCT_IDS,
      productType: subsType,
    });
    console.log('[IAP] Fetched', products.length, 'products');
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

  const subsType = PURCHASE_TYPE_ENUM?.SUBS || 'subs';
  console.log('[IAP] Starting purchase for:', productId, 'type:', subsType);

  try {
    // Wrap in a timeout so it never hangs indefinitely (2 min)
    const transaction = await Promise.race([
      plugin.purchaseProduct({
        productIdentifier: productId,
        productType: subsType,
        quantity: 1,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Purchase timed out. Please try again.')), 120000)
      ),
    ]);

    console.log('[IAP] Purchase completed, transaction:', {
      transactionId: transaction.transactionId,
      productIdentifier: transaction.productIdentifier,
      hasReceipt: !!transaction.receipt,
      hasJws: !!transaction.jwsRepresentation,
      environment: transaction.environment,
    });

    // Send receipt + transaction to backend for server-side Apple verification
    const token = localStorage.getItem('carryon_token');
    const res = await fetch(`${API_URL}/subscriptions/validate-apple-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        receipt: transaction.receipt || '',
        transaction_id: transaction.transactionId,
        product_id: productId,
      }),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.detail || 'Server validation failed');
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
