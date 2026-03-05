/**
 * Apple In-App Purchase service for the native iOS app.
 * Uses StoreKit 2 via @capgo/native-purchases.
 * Web/PWA continues using Stripe — this is iOS-only.
 */
import { isNative } from './native';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Product IDs must match exactly what's in App Store Connect
export const IAP_PRODUCTS = {
  premium_monthly: 'us.carryon.app.premium_monthly',
  premium_annual: 'us.carryon.app.premium_annual',
  standard_monthly: 'us.carryon.app.standard_monthly',
  standard_annual: 'us.carryon.app.standard_annual',
  base_monthly: 'us.carryon.app.base_monthly',
  base_annual: 'us.carryon.app.base_annual',
  new_adult_monthly: 'us.carryon.app.new_adult_monthly',
  military_monthly: 'us.carryon.app.military_monthly',
  veteran_monthly: 'us.carryon.app.veteran_monthly',
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
    
    // Send to backend for validation
    const token = localStorage.getItem('carryon_token');
    const res = await fetch(`${API_URL}/subscriptions/validate-apple-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        receipt: result.receipt,
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
