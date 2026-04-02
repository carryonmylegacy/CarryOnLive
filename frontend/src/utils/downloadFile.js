/**
 * Cross-platform file download utility.
 *
 * iOS PWA Strategy:
 *   1. Fetch the file as a blob through the download proxy (converts WebM→MP4)
 *   2. Use navigator.share() to present the native iOS share sheet
 *      → "Save Video" for MP4, "Save to Files" for PDFs/documents
 *   3. Graceful fallback if share API fails
 *
 * Desktop: Standard blob + <a download> via onFallback callback.
 * Capacitor Native: Filesystem write + native Share sheet.
 */

import { API_URL } from '../config';

/** Detect iOS (Safari, PWA, or WebView). */
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Guard against concurrent downloads
let _downloadInProgress = false;

/**
 * Platform-aware download — iOS gets native share sheet, desktop gets blob download.
 */
export async function platformDownload({ action, params = {}, filename = 'download', onFallback }) {
  // Prevent double-tap issues
  if (_downloadInProgress) return;
  _downloadInProgress = true;

  try {
    // Native Capacitor app → use native fallback
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        if (onFallback) await onFallback();
        return;
      }
    } catch {
      // Not a Capacitor app
    }

    if (!isIOS()) {
      // Non-iOS: use provided fallback (existing blob download logic)
      if (onFallback) await onFallback();
      return;
    }

    // ── iOS PWA path ──
    const authToken = localStorage.getItem('carryon_token');
    if (!authToken) throw new Error('Not authenticated');

    // Step 1: Create a download token
    const prepRes = await fetch(`${API_URL}/downloads/prepare`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, params, filename }),
    });
    if (!prepRes.ok) throw new Error('Failed to prepare download');
    const { token: dt } = await prepRes.json();

    // Step 2: Fetch the actual file blob (backend converts WebM→MP4 etc.)
    const fileRes = await fetch(`${API_URL}/downloads/${dt}`);
    if (!fileRes.ok) throw new Error(`Download failed (${fileRes.status})`);

    const blob = await fileRes.blob();
    if (blob.size < 50) throw new Error('Downloaded file is too small — server error');

    // Verify the response is the expected type (not an error JSON)
    const contentType = fileRes.headers.get('content-type') || blob.type || 'application/octet-stream';
    if (contentType.includes('application/json')) {
      throw new Error('Server returned an error instead of a file');
    }

    // Fix filename extension to match actual content type
    let finalFilename = filename;
    if (contentType.includes('mp4') && !finalFilename.endsWith('.mp4')) {
      finalFilename = finalFilename.replace(/\.[^.]+$/, '.mp4') || finalFilename + '.mp4';
    } else if (contentType.includes('pdf') && !finalFilename.endsWith('.pdf')) {
      finalFilename = finalFilename.replace(/\.[^.]+$/, '.pdf') || finalFilename + '.pdf';
    }

    // Step 3: Use Web Share API — native iOS share sheet
    const file = new File([blob], finalFilename, { type: contentType });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (shareErr) {
        if (shareErr.name === 'AbortError') return; // User cancelled — OK
        console.warn('Share failed, trying fallback:', shareErr);
      }
    }

    // Step 4: Fallback — open blob in new window (iOS will show its own viewer)
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

  } finally {
    _downloadInProgress = false;
  }
}

/** Legacy blob-based download for non-iOS web browsers. */
export async function downloadFile(blob, filename) {
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
    // Capacitor not available — fall through
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
