/**
 * iOS-safe blob download helper.
 *
 * Why this exists: iOS Safari / WKWebView silently ignores the `<a download>`
 * attribute for `blob:` URLs. It opens the file inline in a viewer, and the
 * page has no way to know whether the user actually tapped Share → Save to
 * Files. The naive pattern (`a.click()` followed by `toast.success('X
 * downloaded')`) lies to iOS users every time.
 *
 * This helper does the right thing per platform and fires its own honest
 * toast so callers don't have to think about it.
 *
 *   await iosSafeDownload(blob, 'invoice.pdf', 'Invoice');
 *
 * Behaviour:
 *   • iOS with Web Share API + canShare(files): uses `navigator.share` so the
 *     user gets the native Share sheet → Save to Files / AirDrop / Mail. If
 *     they cancel, no toast fires (cancelled actions shouldn't celebrate).
 *   • iOS without Web Share for files: opens the blob inline in a new tab
 *     via `window.open` (with anchor fallback for popup blockers) and toasts
 *     "{Label} opened — tap Share to save it."
 *   • Non-iOS: standard `<a download>` flow + "{Label} downloaded." toast.
 *
 * For Capacitor native shells, callers should keep using the existing
 * platformDownload() utility which goes through Filesystem + Share plugins.
 * This helper is for plain web/PWA blob downloads only.
 */

import { toast } from './toast';
import { recordDownloadEvent } from './downloadTelemetry';

/** Detect iOS Safari/PWA, including iPadOS-on-Mac. */
export const isIOS = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as Macintosh — check for touch as a tiebreaker
  if (ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document) return true;
  return false;
};

/**
 * @param {Blob} blob - the binary content to deliver
 * @param {string} filename - desired filename (used on non-iOS download + as Share title)
 * @param {string} label - human label for the toast, e.g. "IAC Report", "Hand-off PDF"
 * @param {string} [action] - stable telemetry key, e.g. 'cfp_handoff'. Defaults to a slug of label.
 * @returns {Promise<'saved'|'opened'|'downloaded'|'cancelled'>}
 */
export async function iosSafeDownload(blob, filename, label, action) {
  if (!blob || !(blob instanceof Blob)) {
    toast.error(`Failed to prepare ${label}`);
    recordDownloadEvent({ action: action || _slug(label), outcome: 'failed', filename, errorMessage: 'invalid_blob' });
    return 'cancelled';
  }

  const safeLabel = label || 'File';
  const tAction = action || _slug(label);
  const bytes = blob.size;

  if (isIOS()) {
    // Try Web Share API first — gives the user the proper Save to Files action.
    try {
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        toast.success(`${safeLabel} ready — saved via Share.`);
        recordDownloadEvent({ action: tAction, outcome: 'saved', filename, bytes });
        return 'saved';
      }
    } catch (err) {
      // User cancelled the share sheet — don't lie about saving, just bail quietly.
      if (err && err.name === 'AbortError') {
        recordDownloadEvent({ action: tAction, outcome: 'cancelled', filename, bytes });
        return 'cancelled';
      }
      // Other share failures fall through to inline viewer.
    }

    // Fallback: open the blob inline. User taps Share manually from the viewer.
    const url = URL.createObjectURL(blob);
    const w = typeof window !== 'undefined' ? window.open(url, '_blank') : null;
    if (!w) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    // iOS viewers need the URL alive for a while.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast.success(`${safeLabel} opened — tap Share to save it.`);
    recordDownloadEvent({ action: tAction, outcome: 'opened', filename, bytes });
    return 'opened';
  }

  // Non-iOS: standard download path.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success(`${safeLabel} downloaded.`);
  recordDownloadEvent({ action: tAction, outcome: 'downloaded', filename, bytes });
  return 'downloaded';
}

const _slug = (s) => (s || 'download').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

export default iosSafeDownload;
