/**
 * CarryOn — Haptic Feedback Utility
 *
 * Provides tactile feedback on supported devices.
 * Uses navigator.vibrate() for web/PWA compatibility.
 * Falls back silently when unavailable.
 */

const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

export const haptics = {
  /** Light tap — button press, list item select */
  light() {
    if (canVibrate) navigator.vibrate(10);
  },

  /** Medium tap — successful action, toggle */
  medium() {
    if (canVibrate) navigator.vibrate(25);
  },

  /** Success — task completed, form submitted */
  success() {
    if (canVibrate) navigator.vibrate([15, 50, 15]);
  },

  /** Warning — destructive action, important notice */
  warning() {
    if (canVibrate) navigator.vibrate([30, 30, 30]);
  },

  /** Error — failed action, validation error */
  error() {
    if (canVibrate) navigator.vibrate([50, 30, 50]);
  },
};
