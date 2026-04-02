/**
 * Cross-platform file download utility.
 *
 * - Web: triggers a standard browser download (user configures folder in browser settings).
 * - iOS/Android (Capacitor): writes to the Documents directory and opens the
 *   native Share sheet so the user can save to Files, iCloud, etc.
 * - iOS PWA: uses token-based backend download to trigger native iOS download tile.
 */

import { API_URL } from '../config';

/**
 * Detect if running on iOS (Safari, PWA, or WebView).
 */
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Platform-aware download for iOS PWA.
 *
 * On iOS: Creates a download token, then navigates the browser to the backend
 * download URL — this triggers the native iOS "download" tile from the bottom.
 *
 * On non-iOS: Calls the provided fallback function (standard blob download).
 *
 * @param {Object} opts
 * @param {string} opts.action    - Download action type (e.g., 'document', 'message_pdf')
 * @param {Object} opts.params    - Action-specific parameters
 * @param {string} opts.filename  - Desired filename for the download
 * @param {Function} [opts.onFallback] - Optional callback for non-iOS platforms
 */
export async function platformDownload({ action, params = {}, filename = 'download', onFallback }) {
  // For native Capacitor apps, always use the fallback (native file system)
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      if (onFallback) await onFallback();
      return;
    }
  } catch {
    // Not a Capacitor app
  }

  if (isIOS()) {
    const token = localStorage.getItem('carryon_token');
    const res = await fetch(`${API_URL}/downloads/prepare`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, params, filename }),
    });
    if (!res.ok) {
      throw new Error('Failed to prepare download');
    }
    const data = await res.json();
    // Navigate to the download URL — triggers native iOS download tile
    window.location.href = `${API_URL}/downloads/${data.token}`;
    return;
  }

  // Non-iOS: use provided fallback (existing blob download logic)
  if (onFallback) {
    await onFallback();
  }
}

/**
 * Legacy blob-based download for non-iOS web browsers.
 */
export async function downloadFile(blob, filename) {
  // Try native path first
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');

      const reader = new FileReader();
      const base64Data = await new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const result = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Documents,
      });

      await Share.share({ title: filename, url: result.uri });
      return;
    }
  } catch {
    // Capacitor not available or native write failed — fall through to web download
  }

  // Web fallback
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
