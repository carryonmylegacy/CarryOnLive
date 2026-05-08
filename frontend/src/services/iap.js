/**
 * Apple In-App Purchase service for the native iOS app.
 * Uses StoreKit 2 via @capgo/native-purchases.
 * Web/PWA continues using Stripe — this is iOS-only.
 *
 * Static import is required — dynamic import() hangs on Capacitor native.
 */
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
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
  seniors_monthly: 'us.carryon.app.v2.seniors_monthly',
  seniors_quarterly: 'us.carryon.app.v2.seniors_quarterly',
  seniors_annual: 'us.carryon.app.v2.seniors_annual',
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
  ben_seniors_monthly: 'us.carryon.app.v2.ben_seniors_monthly',
  ben_seniors_quarterly: 'us.carryon.app.v2.ben_seniors_quarterly',
  ben_seniors_annual: 'us.carryon.app.v2.ben_seniors_annual',
  ben_hospice_monthly: 'us.carryon.app.v2.ben_hospice_monthly',
  ben_hospice_quarterly: 'us.carryon.app.v2.ben_hospice_quarterly',
  ben_hospice_annual: 'us.carryon.app.v2.ben_hospice_annual',
};

const ALL_PRODUCT_IDS = Object.values(IAP_PRODUCTS);

export async function isIAPAvailable() {
  if (!isNative) return false;
  try {
    // Timeout so the check never hangs if the native bridge is unresponsive
    const result = await Promise.race([
      NativePurchases.isBillingSupported(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('isBillingSupported timed out')), 10000)
      ),
    ]);
    console.log('[IAP] isBillingSupported:', result.isBillingSupported);
    return result.isBillingSupported;
  } catch (err) {
    console.error('[IAP] isBillingSupported check failed:', err);
    return false;
  }
}

export async function getIAPProducts() {
  if (!isNative) return [];
  try {
    const result = await Promise.race([
      NativePurchases.getProducts({
        productIdentifiers: ALL_PRODUCT_IDS,
        productType: PURCHASE_TYPE.SUBS,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getProducts timed out')), 15000)
      ),
    ]);
    const products = result.products || [];
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
  if (!isNative) throw new Error('IAP only available on native iOS');

  console.log('[IAP] Starting purchase for:', productId);

  try {
    // Timeout so it never hangs indefinitely (30 sec)
    const transaction = await Promise.race([
      NativePurchases.purchaseProduct({
        productIdentifier: productId,
        productType: PURCHASE_TYPE.SUBS,
        quantity: 1,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Purchase timed out. Please try again.')), 30000)
      ),
    ]);

    console.log('[IAP] Purchase completed, transaction:', {
      transactionId: transaction.transactionId,
      productIdentifier: transaction.productIdentifier,
      hasReceipt: !!transaction.receipt,
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
    const msg = (err.message || err.code || '').toLowerCase();
    // Check for user cancellation
    if (msg.includes('cancel') || msg.includes('e_user_cancelled')) {
      return { cancelled: true };
    }
    // If StoreKit can't find the product, run diagnostics
    if (msg.includes('cannot find product')) {
      console.warn('[IAP] Product not found in Store. Running diagnostics...');
      try {
        const diag = await getIAPProducts();
        console.log('[IAP] Store returned', diag.length, 'products:', diag.map(p => p.productId));
      } catch (diagErr) {
        console.error('[IAP] Diagnostic fetch also failed:', diagErr);
      }
      throw new Error(
        `Product "${productId}" not found in the App Store. ` +
        'Please check: (1) Paid Applications Agreement is active in App Store Connect, ' +
        '(2) Products are in "Ready to Submit" or "Approved" status, ' +
        '(3) Try again in a few minutes — new products can take time to propagate.'
      );
    }
    throw err;
  }
}

export async function restoreIAPPurchases() {
  if (!isNative) throw new Error('IAP only available on native iOS');

  try {
    console.log('[IAP] Restoring purchases...');
    await Promise.race([
      NativePurchases.restorePurchases(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Restore timed out')), 30000)
      ),
    ]);

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
