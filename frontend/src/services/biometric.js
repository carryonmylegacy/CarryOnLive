/**
 * CarryOn™ Biometric Service
 * Handles Face ID / Touch ID for both native (Capacitor) and PWA (WebAuthn)
 */

import { isNative } from './native';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ═══ NATIVE (Capacitor) ═══

let NativeBiometric = null;
const loadNativeBiometric = async () => {
  if (!NativeBiometric && isNative) {
    try {
      const mod = await import('@capgo/capacitor-native-biometric');
      NativeBiometric = mod.NativeBiometric;
    } catch (e) { /* not available */ }
  }
  return NativeBiometric;
};

export const isBiometricAvailable = async () => {
  // Check native first
  const bio = await loadNativeBiometric();
  if (bio) {
    try {
      const result = await bio.isAvailable();
      return { available: result.isAvailable, type: result.biometryType === 1 ? 'face' : 'fingerprint', method: 'native' };
    } catch { return { available: false }; }
  }

  // iOS standalone PWA — Face ID is always available
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isStandalone && isIOS) {
    return { available: true, type: 'face', method: 'webauthn' };
  }

  // Check WebAuthn
  if (window.PublicKeyCredential) {
    try {
      const available = await Promise.race([
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(),
        new Promise(resolve => setTimeout(() => resolve(false), 2000)),
      ]);
      return { available, type: 'face', method: 'webauthn' };
    } catch { return { available: false }; }
  }

  return { available: false };
};

export const isBiometricEnabled = () => {
  const enabled = localStorage.getItem('carryon_biometric_enabled') === 'true';
  const method = localStorage.getItem('carryon_biometric_method');
  // Must have both the flag AND a method configured
  return enabled && !!method;
};

// ═══ REGISTRATION (after login) ═══

export const registerBiometric = async (token, email, password) => {
  // Try native first (Capacitor app)
  const bio = await loadNativeBiometric();
  if (bio) {
    return registerNativeBiometric(email, password);
  }
  // Fall back to WebAuthn (PWA)
  if (window.PublicKeyCredential) {
    return registerWebAuthn(token);
  }
  throw new Error('Biometric authentication is not supported on this device');
};

const registerNativeBiometric = async (email, password) => {
  const bio = await loadNativeBiometric();
  await bio.setCredentials({
    username: email,
    password: password,
    server: 'carryon.us',
  });
  localStorage.setItem('carryon_biometric_enabled', 'true');
  localStorage.setItem('carryon_biometric_method', 'native');
  localStorage.setItem('carryon_biometric_email', email);
  return { success: true };
};

const registerWebAuthn = async (token) => {
  if (!navigator.credentials || typeof navigator.credentials.create !== 'function') {
    throw new Error('WebAuthn is not supported in this browser');
  }

  const optionsRes = await fetch(`${API_URL}/auth/webauthn/register-options`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!optionsRes.ok) {
    const err = await optionsRes.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to get registration options');
  }

  const options = await optionsRes.json();

  // Build the publicKey options with proper ArrayBuffer types
  const publicKeyOptions = {
    challenge: base64urlToBuffer(options.challenge),
    rp: options.rp,
    user: {
      ...options.user,
      id: base64urlToBuffer(options.user.id),
    },
    pubKeyCredParams: options.pubKeyCredParams,
    authenticatorSelection: options.authenticatorSelection,
    timeout: options.timeout || 60000,
    attestation: options.attestation || 'none',
  };

  if (options.excludeCredentials) {
    publicKeyOptions.excludeCredentials = options.excludeCredentials.map(c => ({
      ...c, id: base64urlToBuffer(c.id),
    }));
  }

  // Create credential (triggers Face ID)
  let rawCredential;
  try {
    rawCredential = await navigator.credentials.create({ publicKey: publicKeyOptions });
  } catch (e) {
    if (e.name === 'NotAllowedError') throw new Error('Face ID was cancelled');
    throw new Error('Passkey creation failed: ' + e.message);
  }

  if (!rawCredential) throw new Error('Face ID was cancelled');

  // IMMEDIATELY extract all binary data into plain strings
  // This must happen synchronously before any async operations
  const credentialData = {
    id: rawCredential.id,
    rawId: arrayBufferToBase64url(rawCredential.rawId),
    type: rawCredential.type,
    response: {
      attestationObject: arrayBufferToBase64url(rawCredential.response.attestationObject),
      clientDataJSON: arrayBufferToBase64url(rawCredential.response.clientDataJSON),
    },
  };

  // Now send the plain JSON to server (no ArrayBuffers left)
  const response = await fetch(`${API_URL}/auth/webauthn/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: credentialData }),
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || 'Server rejected the passkey');

  localStorage.setItem('carryon_biometric_enabled', 'true');
  localStorage.setItem('carryon_biometric_method', 'webauthn');
  localStorage.setItem('carryon_biometric_email', '');
  return result;
};

// Safari-safe ArrayBuffer to base64url — reads bytes synchronously
function arrayBufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  const len = bytes.length;
  let binary = '';
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || 'Server rejected the passkey');

  localStorage.setItem('carryon_biometric_enabled', 'true');
  localStorage.setItem('carryon_biometric_method', 'webauthn');
  return result;
};

// ═══ AUTHENTICATION (on app launch) ═══

export const authenticateWithBiometric = async () => {
  const method = localStorage.getItem('carryon_biometric_method');

  if (method === 'native') {
    return authenticateNative();
  }
  return authenticateWebAuthn();
};

const authenticateNative = async () => {
  const bio = await loadNativeBiometric();

  // Verify identity (triggers Face ID)
  await bio.verifyIdentity({ reason: 'Sign in to CarryOn', title: 'CarryOn' });

  // Get stored credentials
  const creds = await bio.getCredentials({ server: 'carryon.us' });

  // Login with stored credentials
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.username, password: creds.password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Login failed');
  return data;
};

const authenticateWebAuthn = async () => {
  const email = localStorage.getItem('carryon_biometric_email') || '';

  // Get authentication options
  const optionsRes = await fetch(`${API_URL}/auth/webauthn/login-options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const options = await optionsRes.json();

  // Convert
  options.challenge = base64urlToBuffer(options.challenge);
  if (options.allowCredentials) {
    options.allowCredentials = options.allowCredentials.map(c => ({
      ...c, id: base64urlToBuffer(c.id),
    }));
  }

  // Get credential (triggers Face ID)
  const credential = await navigator.credentials.get({ publicKey: options });

  // Send to server
  const res = await fetch(`${API_URL}/auth/webauthn/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credential: {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          authenticatorData: bufferToBase64url(credential.response.authenticatorData),
          clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
          signature: bufferToBase64url(credential.response.signature),
          userHandle: credential.response.userHandle ? bufferToBase64url(credential.response.userHandle) : null,
        },
      },
      email,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Biometric login failed');
  return data;
};

// ═══ DISABLE ═══

export const disableBiometric = async () => {
  const bio = await loadNativeBiometric();
  if (bio) {
    try { await bio.deleteCredentials({ server: 'carryon.us' }); } catch {}
  }
  localStorage.removeItem('carryon_biometric_enabled');
  localStorage.removeItem('carryon_biometric_method');
  localStorage.removeItem('carryon_biometric_email');
};

// ═══ HELPERS ═══

function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
