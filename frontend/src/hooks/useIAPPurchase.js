import { useState, useEffect } from 'react';
import { isNative, platform } from '../services/native';
import { isIAPAvailable, purchaseIAP, restoreIAPPurchases, IAP_PRODUCTS } from '../services/iap';
import { toast } from '../utils/toast';

/**
 * Consolidated hook for Apple In-App Purchase logic.
 * Used by both SubscriptionPaywall and SubscriptionManagement.
 *
 * Returns:
 *  - useAppleIAP: boolean — whether IAP is available on this device
 *  - restoringPurchases: boolean — restore in progress
 *  - purchaseWithIAP(planId, billing): resolves product ID, executes purchase, returns result
 *  - restoreWithIAP(): restores purchases, returns { success }
 */
export function useIAPPurchase() {
  const [useAppleIAP, setUseAppleIAP] = useState(false);
  const [restoringPurchases, setRestoringPurchases] = useState(false);

  useEffect(() => {
    if (isNative && platform === 'ios') {
      isIAPAvailable().then(available => setUseAppleIAP(available));
    }
  }, []);

  /**
   * Execute an IAP purchase for a given plan + billing cycle.
   * @param {string} planId - e.g. 'premium', 'base', 'ben_standard'
   * @param {string} billing - 'monthly' | 'quarterly' | 'annual'
   * @returns {{ cancelled?: boolean, success?: boolean, result?: object }}
   * @throws on purchase error (non-cancellation)
   */
  const purchaseWithIAP = async (planId, billing) => {
    const available = useAppleIAP || await isIAPAvailable();
    if (!available) {
      toast.error('In-App Purchase is not available. Please restart the app and try again.');
      return { cancelled: true };
    }

    const productKey = `${planId}_${billing}`;
    const productId = IAP_PRODUCTS[productKey];
    if (!productId) {
      toast.error(`No IAP product configured for ${planId} (${billing})`);
      return { cancelled: true };
    }

    const result = await purchaseIAP(productId);
    if (result.cancelled) {
      return { cancelled: true };
    }

    return { success: true, result };
  };

  /**
   * Restore previous IAP purchases.
   * @returns {{ success: boolean }}
   */
  const restoreWithIAP = async () => {
    setRestoringPurchases(true);
    try {
      const result = await restoreIAPPurchases();
      if (result.success) {
        toast.success('Purchases restored successfully');
      }
      return { success: true };
    } catch (err) {
      toast.error('Failed to restore purchases');
      return { success: false };
    } finally {
      setRestoringPurchases(false);
    }
  };

  return {
    useAppleIAP,
    restoringPurchases,
    purchaseWithIAP,
    restoreWithIAP,
  };
}
