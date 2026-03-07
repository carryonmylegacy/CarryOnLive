/**
 * CarryOn™ Passkey Service — WebAuthn / FIDO2
 *
 * Provides passkey registration and authentication using the Web Authentication API.
 * Works on both native iOS (via Safari WebView) and web browsers.
 * Backend endpoints: /api/auth/webauthn/{register-options,register,login-options,login}
 */

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Check if the browser/webview supports WebAuthn passkeys.
 */
export function isPasskeySupported() {
  return !!(
    window.PublicKeyCredential &&
    typeof window.PublicKeyCredential === 'function'
  );
}

/**
 * Check if this user has any registered passkeys.
 */
export async function hasRegisteredPasskey(token) {
  try {
    const res = await fetch(`${API_URL}/auth/webauthn/login-options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '' }),
    });
    // We can't check without email; use a lightweight backend check instead
    // For now, rely on localStorage flag set after registration
    return localStorage.getItem('carryon_passkey_registered') === 'true';
  } catch {
    return false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

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

// ── Registration ────────────────────────────────────────────────────

/**
 * Register a new passkey for the authenticated user.
 * @param {string} token - JWT auth token
 * @returns {{ success: boolean, message: string }}
 */
export async function registerPasskey(token) {
  // 1. Get registration options from server
  const optionsRes = await fetch(`${API_URL}/auth/webauthn/register-options`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: '{}',
  });
  if (!optionsRes.ok) {
    const err = await optionsRes.json();
    throw new Error(err.detail || 'Failed to get registration options');
  }
  const options = await optionsRes.json();

  // 2. Convert server options to Web API format
  const publicKeyOptions = {
    challenge: base64urlToBuffer(options.challenge),
    rp: options.rp,
    user: {
      ...options.user,
      id: base64urlToBuffer(options.user.id),
    },
    pubKeyCredParams: options.pubKeyCredParams,
    timeout: options.timeout || 60000,
    authenticatorSelection: options.authenticatorSelection,
    attestation: options.attestation || 'none',
    excludeCredentials: (options.excludeCredentials || []).map(c => ({
      ...c,
      id: base64urlToBuffer(c.id),
    })),
  };

  // 3. Create credential via browser API (triggers Face ID / Touch ID)
  const credential = await navigator.credentials.create({ publicKey: publicKeyOptions });

  // 4. Serialize and send to server
  const credentialData = {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64url(credential.response.attestationObject),
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
    },
  };

  const registerRes = await fetch(`${API_URL}/auth/webauthn/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ credential: credentialData }),
  });
  if (!registerRes.ok) {
    const err = await registerRes.json();
    throw new Error(err.detail || 'Registration failed');
  }

  localStorage.setItem('carryon_passkey_registered', 'true');
  return await registerRes.json();
}

// ── Authentication ──────────────────────────────────────────────────

/**
 * Sign in with a passkey. No email/password needed.
 * @param {string} [email] - Optional email to narrow credential list
 * @returns {{ access_token: string, user: object }}
 */
export async function authenticateWithPasskey(email = '') {
  // 1. Get authentication options
  const optionsRes = await fetch(`${API_URL}/auth/webauthn/login-options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!optionsRes.ok) {
    const err = await optionsRes.json();
    throw new Error(err.detail || 'Failed to get login options');
  }
  const options = await optionsRes.json();

  // 2. Convert to Web API format
  const publicKeyOptions = {
    challenge: base64urlToBuffer(options.challenge),
    rpId: options.rpId,
    timeout: options.timeout || 60000,
    userVerification: options.userVerification || 'required',
    allowCredentials: (options.allowCredentials || []).map(c => ({
      ...c,
      id: base64urlToBuffer(c.id),
    })),
  };

  // 3. Get credential via browser API (triggers Face ID / Touch ID)
  const assertion = await navigator.credentials.get({ publicKey: publicKeyOptions });

  // 4. Serialize and send to server
  const credentialData = {
    id: assertion.id,
    rawId: bufferToBase64url(assertion.rawId),
    type: assertion.type,
    response: {
      authenticatorData: bufferToBase64url(assertion.response.authenticatorData),
      clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
      signature: bufferToBase64url(assertion.response.signature),
      userHandle: assertion.response.userHandle
        ? bufferToBase64url(assertion.response.userHandle)
        : null,
    },
  };

  const loginRes = await fetch(`${API_URL}/auth/webauthn/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: credentialData, email }),
  });
  if (!loginRes.ok) {
    const err = await loginRes.json();
    throw new Error(err.detail || 'Passkey login failed');
  }

  return await loginRes.json();
}

/**
 * Remove the passkey registration flag (for UI state management).
 * Actual credential deletion happens on the server.
 */
export function clearPasskeyFlag() {
  localStorage.removeItem('carryon_passkey_registered');
}
