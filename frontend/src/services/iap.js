/**
 * Apple In-App Purchase service for the native iOS app.
 * Uses StoreKit 2 via @capgo/native-purchases.
 * Web/PWA continues using Stripe — this is iOS-only.
 */
import { isNative } from './native';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

let NativePurchases = null;

async function getPurchasesPlugin() {
  if (!isNative) return null;
  if (NativePurchases) return NativePurchases;
  try {
    const mod = await import('@capgo/native-purchases');
    NativePurchases = mod.NativePurchases;
    return NativePurchases;
  } catch {
    return null;
  }
}

export async function isIAPAvailable() {
  const plugin = await getPurchasesPlugin();
  if (!plugin) return false;
  try {
    const { isBillingSupported } = await plugin.isBillingSupported();
    return isBillingSupported;
  } catch {
    return false;
  }
}

export async function getIAPProducts() {
  const plugin = await getPurchasesPlugin();
  if (!plugin) return [];
  try {
    const { products } = await plugin.getProducts({ productIds: ALL_PRODUCT_IDS });
    return products.map(p => ({
      productId: p.identifier,
      title: p.title,
      description: p.description,
      price: p.price,
      priceString: p.priceString,
      currency: p.currencyCode,
    }));
  } catch (err) {
    console.error('Failed to fetch IAP products:', err);
    return [];
  }
}

export async function purchaseIAP(productId) {
  const plugin = await getPurchasesPlugin();
  if (!plugin) throw new Error('IAP not available');
  
  try {
    const result = await plugin.purchaseProduct({
      productIdentifier: productId,
      productType: 'AUTO_RENEWABLE_SUBSCRIPTION',
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
        receipt: result.receipt || '',
        transaction_id: result.transactionIdentifier,
        product_id: productId,
      }),
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Validation failed');
    }
    
    return await res.json();
  } catch (err) {
    if (err.message?.includes('userCancelled') || err.message?.includes('cancelled')) {
      return { cancelled: true };
    }
    throw err;
  }
}

export async function restoreIAPPurchases() {
  const plugin = await getPurchasesPlugin();
  if (!plugin) throw new Error('IAP not available');
  
  try {
    await plugin.restorePurchases();
    
    // Re-validate with backend
    const token = localStorage.getItem('carryon_token');
    await fetch(`${API_URL}/subscriptions/sync-apple`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    return { success: true };
  } catch (err) {
    throw err;
  }
}
