/**
 * CarryOn™ Passkey Service — WebAuthn / FIDO2
 *
 * Provides passkey registration and authentication using the Web Authentication API.
 * Works on both native iOS (via Safari WebView) and web browsers.
 * Backend endpoints: /api/auth/webauthn/{register-options,register,login-options,login}
 */

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function isPasskeySupported() {
  return !!(window.PublicKeyCredential && typeof window.PublicKeyCredential === 'function');
}

export async function hasRegisteredPasskey() {
  return localStorage.getItem('carryon_passkey_registered') === 'true';
}

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

export async function registerPasskey(token) {
  const optionsRes = await fetch(`${API_URL}/auth/webauthn/register-options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: '{}',
  });
  if (!optionsRes.ok) { const err = await optionsRes.json(); throw new Error(err.detail || 'Failed to get registration options'); }
  const options = await optionsRes.json();

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: base64urlToBuffer(options.challenge),
      rp: options.rp,
      user: { ...options.user, id: base64urlToBuffer(options.user.id) },
      pubKeyCredParams: options.pubKeyCredParams,
      timeout: options.timeout || 60000,
      authenticatorSelection: options.authenticatorSelection,
      attestation: options.attestation || 'none',
      excludeCredentials: (options.excludeCredentials || []).map(c => ({ ...c, id: base64urlToBuffer(c.id) })),
    },
  });

  const registerRes = await fetch(`${API_URL}/auth/webauthn/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      credential: {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          attestationObject: bufferToBase64url(credential.response.attestationObject),
          clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
        },
      },
    }),
  });
  if (!registerRes.ok) { const err = await registerRes.json(); throw new Error(err.detail || 'Registration failed'); }

  localStorage.setItem('carryon_passkey_registered', 'true');
  return await registerRes.json();
}

export async function authenticateWithPasskey(email = '') {
  const optionsRes = await fetch(`${API_URL}/auth/webauthn/login-options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!optionsRes.ok) { const err = await optionsRes.json(); throw new Error(err.detail || 'Failed to get login options'); }
  const options = await optionsRes.json();

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: base64urlToBuffer(options.challenge),
      rpId: options.rpId,
      timeout: options.timeout || 60000,
      userVerification: options.userVerification || 'required',
      allowCredentials: (options.allowCredentials || []).map(c => ({ ...c, id: base64urlToBuffer(c.id) })),
    },
  });

  const loginRes = await fetch(`${API_URL}/auth/webauthn/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credential: {
        id: assertion.id,
        rawId: bufferToBase64url(assertion.rawId),
        type: assertion.type,
        response: {
          authenticatorData: bufferToBase64url(assertion.response.authenticatorData),
          clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
          signature: bufferToBase64url(assertion.response.signature),
          userHandle: assertion.response.userHandle ? bufferToBase64url(assertion.response.userHandle) : null,
        },
      },
      email,
    }),
  });
  if (!loginRes.ok) { const err = await loginRes.json(); throw new Error(err.detail || 'Passkey login failed'); }
  return await loginRes.json();
}

export function clearPasskeyFlag() {
  localStorage.removeItem('carryon_passkey_registered');
}
