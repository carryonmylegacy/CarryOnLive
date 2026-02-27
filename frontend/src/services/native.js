/**
 * CarryOn Native Features
 *
 * Provides biometric auth, camera, and push notifications
 * when running as a native app (Capacitor).
 * Falls back gracefully to web alternatives when in browser.
 */

import { Capacitor } from '@capacitor/core';

// ── Platform Detection ──────────────────────────────────────────────
export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

// ── Biometric Authentication ────────────────────────────────────────
export const BiometricAuth = {
  /**
   * Check if biometric auth is available on this device
   */
  async isAvailable() {
    if (!isNative) return { available: false, type: 'none' };
    try {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
      const result = await NativeBiometric.isAvailable();
      return {
        available: result.isAvailable,
        type: result.biometryType, // 1=fingerprint, 2=face, 3=iris
      };
    } catch {
      return { available: false, type: 'none' };
    }
  },

  /**
   * Prompt user for biometric verification
   */
  async authenticate(reason = 'Verify your identity to access CarryOn') {
    if (!isNative) return false;
    try {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
      await NativeBiometric.verifyIdentity({ reason });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Store credentials securely behind biometrics
   */
  async storeCredentials(server, username, password) {
    if (!isNative) return false;
    try {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
      await NativeBiometric.setCredentials({ server, username, password });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Retrieve stored credentials (requires biometric verification)
   */
  async getCredentials(server) {
    if (!isNative) return null;
    try {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
      const creds = await NativeBiometric.getCredentials({ server });
      return creds;
    } catch {
      return null;
    }
  },
};

// ── Camera ──────────────────────────────────────────────────────────
export const CameraService = {
  /**
   * Take a photo or pick from gallery for document scanning
   */
  async takePhoto(source = 'camera') {
    if (!isNative) {
      // Web fallback: use file input
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        if (source === 'camera') input.capture = 'environment';
        input.onchange = (e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => resolve({ dataUrl: reader.result, file });
            reader.readAsDataURL(file);
          } else {
            resolve(null);
          }
        };
        input.click();
      });
    }
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      });
      return { dataUrl: image.dataUrl, file: null };
    } catch {
      return null;
    }
  },
};

// ── Push Notifications ──────────────────────────────────────────────
export const PushService = {
  /**
   * Register for push notifications (native only)
   */
  async register() {
    if (!isNative) return { granted: false, token: null };
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== 'granted') {
        return { granted: false, token: null };
      }

      await PushNotifications.register();

      return new Promise((resolve) => {
        PushNotifications.addListener('registration', (token) => {
          resolve({ granted: true, token: token.value });
        });
        PushNotifications.addListener('registrationError', () => {
          resolve({ granted: false, token: null });
        });
        // Timeout after 10 seconds
        setTimeout(() => resolve({ granted: false, token: null }), 10000);
      });
    } catch {
      return { granted: false, token: null };
    }
  },

  /**
   * Listen for incoming notifications
   */
  async onNotificationReceived(callback) {
    if (!isNative) return;
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      PushNotifications.addListener('pushNotificationReceived', callback);
    } catch {
      // Not available
    }
  },

  /**
   * Listen for notification tap actions
   */
  async onNotificationTapped(callback) {
    if (!isNative) return;
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        callback(action.notification);
      });
    } catch {
      // Not available
    }
  },
};
