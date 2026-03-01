/**
 * CarryOn™ Biometric Service — Secure Implementation
 * 
 * Native app (Capacitor): Uses iOS Keychain via NativeBiometric (Face ID protected)
 * Web/PWA: Relies on iOS/browser native autofill (Face ID handled by OS — no credentials stored by us)
 */

// ═══ NATIVE ONLY (Capacitor) ═══

export const isBiometricAvailable = async () => {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
      const result = await NativeBiometric.isAvailable();
      return { available: result.isAvailable, method: 'native' };
    }
  } catch { /* not native */ }
  return { available: false, method: 'none' };
};

export const isBiometricEnabled = () => {
  return localStorage.getItem('carryon_biometric_enabled') === 'true' &&
    localStorage.getItem('carryon_biometric_method') === 'native';
};

export const registerBiometric = async (token, email, password) => {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Biometric login is available in the CarryOn native app');
  }
  const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
  await NativeBiometric.setCredentials({ username: email, password, server: 'carryon.us' });
  localStorage.setItem('carryon_biometric_enabled', 'true');
  localStorage.setItem('carryon_biometric_method', 'native');
  return { success: true };
};

export const authenticateWithBiometric = async () => {
  const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
  await NativeBiometric.verifyIdentity({ reason: 'Sign in to CarryOn', title: 'CarryOn' });
  const creds = await NativeBiometric.getCredentials({ server: 'carryon.us' });
  const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.username, password: creds.password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Login failed');
  return data;
};

export const disableBiometric = async () => {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
      await NativeBiometric.deleteCredentials({ server: 'carryon.us' });
    }
  } catch { /* ignore */ }
  localStorage.removeItem('carryon_biometric_enabled');
  localStorage.removeItem('carryon_biometric_method');
  localStorage.removeItem('carryon_biometric_email');
  localStorage.removeItem('carryon_biometric_declined');
  // Clean up any old insecure stored credentials
  localStorage.removeItem('carryon_bio_cred');
};
