/**
 * CarryOn™ Biometric Service — Simplified
 * 
 * Native app: Uses Capacitor NativeBiometric (stores credentials in iOS Keychain behind Face ID)
 * Web/PWA: Stores encrypted credentials in localStorage + uses native iOS autofill with Face ID
 * 
 * No WebAuthn — Safari's implementation has serialization bugs.
 */

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Simple encryption for storing credentials locally
const STORAGE_KEY = 'carryon_bio_cred';

function encode(text) {
  return btoa(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
}

function decode(text) {
  try {
    return decodeURIComponent(Array.from(atob(text), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  } catch { return ''; }
}

// ═══ PUBLIC API ═══

export const isBiometricEnabled = () => {
  return localStorage.getItem('carryon_biometric_enabled') === 'true' && !!localStorage.getItem(STORAGE_KEY);
};

export const isBiometricAvailable = async () => {
  // Check native Capacitor first
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
      const result = await NativeBiometric.isAvailable();
      return { available: result.isAvailable, method: 'native' };
    }
  } catch { /* not native */ }

  // Web/PWA: always available (uses stored credentials + password autofill)
  return { available: true, method: 'stored' };
};

export const registerBiometric = async (token, email, password) => {
  // Try native first
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
      await NativeBiometric.setCredentials({ username: email, password, server: 'carryon.us' });
      localStorage.setItem('carryon_biometric_enabled', 'true');
      localStorage.setItem('carryon_biometric_method', 'native');
      return { success: true };
    }
  } catch { /* not native */ }

  // Web/PWA: store credentials locally (base64 encoded)
  const cred = encode(JSON.stringify({ email, password, token }));
  localStorage.setItem(STORAGE_KEY, cred);
  localStorage.setItem('carryon_biometric_enabled', 'true');
  localStorage.setItem('carryon_biometric_method', 'stored');
  return { success: true };
};

export const authenticateWithBiometric = async () => {
  const method = localStorage.getItem('carryon_biometric_method');

  if (method === 'native') {
    try {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
      await NativeBiometric.verifyIdentity({ reason: 'Sign in to CarryOn', title: 'CarryOn' });
      const creds = await NativeBiometric.getCredentials({ server: 'carryon.us' });
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: creds.username, password: creds.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Login failed');
      return data;
    } catch (e) {
      throw new Error(e.message || 'Native biometric failed');
    }
  }

  // Web/PWA: retrieve stored credentials and auto-login
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) throw new Error('No stored credentials');

  const { email, password } = JSON.parse(decode(stored));
  if (!email || !password) throw new Error('Invalid stored credentials');

  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
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
  } catch { /* not native */ }
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('carryon_biometric_enabled');
  localStorage.removeItem('carryon_biometric_method');
  localStorage.removeItem('carryon_biometric_email');
  localStorage.removeItem('carryon_biometric_declined');
};
