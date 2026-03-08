/**
 * CarryOn — Toast Utility
 *
 * Drop-in replacement that routes all toast calls to the new
 * iOS-style notification system. Same API surface so existing
 * toast.error('msg') calls keep working with zero changes.
 */

import { notify } from '../components/AppNotification';

export const toast = {
  error: (message) => notify.error(message),
  success: (message) => notify.success(message),
  info: (message) => notify.info(message),
  warning: (message) => notify.warning(message),
};
