/**
 * Cross-platform file download utility.
 *
 * iOS PWA Strategy:
 *   1. Fetch the file as a blob through the download proxy (converts WebM→MP4)
 *   2. Use navigator.share() to present the native iOS share sheet
 *      → "Save Video" for MP4, "Save to Files" for PDFs/documents
 *   3. If share fails (user activation expired after long fetch),
 *      show a "Tap to Save" overlay to re-establish activation
 *
 * Desktop: Standard blob + <a download> via onFallback callback.
 * Capacitor Native: Filesystem write + native Share sheet.
 */

import { API_URL } from '../config';
import { recordDownloadEvent } from './downloadTelemetry';

/** Detect iOS (Safari, PWA, or WebView). */
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Guard against concurrent downloads
let _downloadInProgress = false;

/**
 * Show a native DOM overlay prompting the user to tap "Save".
 * This re-establishes user activation so navigator.share() can work
 * even after a long fetch (e.g., 30s video conversion).
 */
function promptToSave(file) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-testid', 'save-prompt-overlay');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(8,14,26,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);';

    const icon = '\u2193'; // ↓ download arrow for all file types
    const label = 'File Ready';
    const size = file.size > 1048576
      ? `${(file.size / 1048576).toFixed(1)} MB`
      : `${(file.size / 1024).toFixed(0)} KB`;

    overlay.innerHTML = `
      <div style="text-align:center;padding:32px 24px;max-width:320px;">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(212,175,55,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px;color:#d4af37;">${icon}</div>
        <p style="font-size:20px;font-weight:700;color:#F1F3F8;margin:0 0 6px;">${label}</p>
        <p style="font-size:14px;color:#7B879E;margin:0 0 28px;">${file.name} (${size})</p>
        <button id="__co_save_btn" data-testid="save-prompt-save-btn" style="width:100%;padding:16px;border:none;border-radius:14px;background:linear-gradient(135deg,#d4af37,#F0C95C);color:#080e1a;font-size:17px;font-weight:700;cursor:pointer;margin-bottom:12px;-webkit-tap-highlight-color:transparent;">Tap to Save</button>
        <button id="__co_cancel_btn" data-testid="save-prompt-cancel-btn" style="width:100%;padding:14px;border:1px solid rgba(255,255,255,0.12);border-radius:14px;background:transparent;color:#7B879E;font-size:15px;cursor:pointer;-webkit-tap-highlight-color:transparent;">Cancel</button>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanup = () => { if (overlay.parentNode) overlay.remove(); };

    document.getElementById('__co_save_btn').addEventListener('click', async () => {
      try {
        await navigator.share({ files: [file] });
        cleanup();
        resolve(true);
      } catch {
        // Any error from share (including user cancelling via AbortError) = not saved
        cleanup();
        resolve(false);
      }
    });

    document.getElementById('__co_cancel_btn').addEventListener('click', () => {
      cleanup();
      resolve(false); // user cancelled — don't show success toast
    });
  });
}

/**
 * Platform-aware download — iOS gets native share sheet, desktop gets blob download.
 * Returns 'shared' | 'saved' | 'cancelled' so the caller can show appropriate toast.
 */
export async function platformDownload({ action, params = {}, filename = 'download', onFallback, onProgress }) {
  // Prevent double-tap issues
  if (_downloadInProgress) return 'busy';
  _downloadInProgress = true;

  try {
    // Native Capacitor app → use native fallback
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        if (onFallback) await onFallback();
        recordDownloadEvent({ action, outcome: 'shared', filename });
        return 'shared';
      }
    } catch {
      // Not a Capacitor app
    }

    if (!isIOS()) {
      // Non-iOS: use provided fallback (existing blob download logic)
      if (onFallback) await onFallback();
      recordDownloadEvent({ action, outcome: 'downloaded', filename });
      return 'shared';
    }

    // ── iOS PWA path ──
    const authToken = localStorage.getItem('carryon_token');
    if (!authToken) throw new Error('Not authenticated');

    // Step 1: Create a download token
    if (onProgress) onProgress('preparing');
    const prepRes = await fetch(`${API_URL}/downloads/prepare`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, params, filename }),
    });
    if (!prepRes.ok) {
      const errBody = await prepRes.text().catch(() => '');
      throw new Error(`Prepare failed (${prepRes.status}): ${errBody}`);
    }
    const { token: dt } = await prepRes.json();

    // Step 2: Fetch the actual file blob with progress tracking
    if (onProgress) onProgress('downloading', 0);
    const fileRes = await fetch(`${API_URL}/downloads/${dt}`);
    if (!fileRes.ok) {
      const errBody = await fileRes.text().catch(() => '');
      throw new Error(`Download failed (${fileRes.status}): ${errBody}`);
    }

    let blob;
    const contentLength = parseInt(fileRes.headers.get('content-length') || '0', 10);
    if (contentLength > 0 && fileRes.body && typeof fileRes.body.getReader === 'function') {
      // Stream the response to track progress
      const reader = fileRes.body.getReader();
      const chunks = [];
      let received = 0;
      while (true) { // eslint-disable-line no-constant-condition
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (onProgress) onProgress('downloading', Math.min(99, Math.round((received / contentLength) * 100)));
      }
      blob = new Blob(chunks);
    } else {
      blob = await fileRes.blob();
    }
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

    // Step 3: Present file to user via promptToSave overlay.
    // On iOS PWA, navigator.share() requires a fresh user gesture. Since the
    // async fetch above always burns the original gesture, we skip the initial
    // share attempt entirely and go straight to the "Tap to Save" overlay.
    // This eliminates the "double-tap" problem where the first tap appeared
    // to do nothing because the share call failed silently.
    if (onProgress) onProgress('ready', 100);
    const file = new File([blob], finalFilename, { type: contentType });

    const handled = await promptToSave(file);
    recordDownloadEvent({
      action,
      outcome: handled ? 'saved' : 'cancelled',
      filename: finalFilename,
      bytes: blob.size,
    });
    return handled ? 'saved' : 'cancelled';

  } catch (err) {
    recordDownloadEvent({ action, outcome: 'failed', filename, errorMessage: err?.message });
    throw err;
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
