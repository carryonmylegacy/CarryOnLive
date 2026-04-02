/**
 * Cross-platform file download utility.
 *
 * iOS PWA Strategy:
 *   1. Fetch the file as a blob through the download proxy (which converts WebM→MP4, etc.)
 *   2. Use navigator.share() to present the native iOS share sheet from the bottom
 *      → "Save Video" for MP4, "Save to Files" for PDFs/documents
 *   3. Falls back to <a download> blob approach if share API unavailable
 *
 * Desktop:
 *   Uses standard blob + <a download> approach via the onFallback callback.
 *
 * Capacitor Native:
 *   Writes to filesystem + native Share sheet.
 */

import { API_URL } from '../config';

/**
 * Detect iOS (Safari, PWA, or WebView).
 */
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Platform-aware download — iOS gets the native share sheet, desktop gets blob download.
 */
export async function platformDownload({ action, params = {}, filename = 'download', onFallback }) {
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

  if (isIOS()) {
    const authToken = localStorage.getItem('carryon_token');

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
    if (!fileRes.ok) throw new Error('Download failed');
    const blob = await fileRes.blob();

    // Determine correct MIME type and filename
    const contentType = blob.type || fileRes.headers.get('content-type') || 'application/octet-stream';
    let finalFilename = filename;

    // Fix filename extension to match actual content type
    if (contentType.includes('mp4') && !finalFilename.endsWith('.mp4')) {
      finalFilename = finalFilename.replace(/\.\w+$/, '.mp4');
      if (!finalFilename.includes('.')) finalFilename += '.mp4';
    } else if (contentType.includes('pdf') && !finalFilename.endsWith('.pdf')) {
      finalFilename = finalFilename.replace(/\.\w+$/, '.pdf');
      if (!finalFilename.includes('.')) finalFilename += '.pdf';
    }

    // Step 3: Use Web Share API — this opens the native iOS share sheet
    const file = new File([blob], finalFilename, { type: contentType });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (shareErr) {
        // User cancelled share sheet — that's OK, not an error
        if (shareErr.name === 'AbortError') return;
        // Other share errors — fall through to blob download
      }
    }

    // Step 4: Fallback — blob URL + <a download>
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
