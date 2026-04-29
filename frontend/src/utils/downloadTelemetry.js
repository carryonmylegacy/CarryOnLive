/**
 * Fire-and-forget download telemetry. Called by `iosSafeDownload` and
 * `platformDownload` after every download attempt to record per-action +
 * per-platform success / cancel rates.
 *
 * Errors are intentionally swallowed: we'd rather lose a telemetry beacon
 * than break a download flow.
 */

import axios from 'axios';
import { API_URL } from '../config';

const detectPlatform = () => {
  if (typeof navigator === 'undefined') return 'unknown';
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) return 'capacitor';
  const ua = navigator.userAgent || '';
  const standalone =
    (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document);
  if (isIOS) return standalone ? 'ios-pwa' : 'ios';
  if (/Android/.test(ua)) return standalone ? 'android-pwa' : 'android';
  return 'web';
};

/**
 * @param {Object} args
 * @param {string} args.action  - short identifier, e.g. 'cfp_handoff', 'ega_iac', 'soc2', 'audit_csv'
 * @param {string} args.outcome - one of: saved | opened | downloaded | shared | cancelled | failed
 * @param {string} [args.filename]
 * @param {number} [args.bytes]
 * @param {string} [args.errorMessage]
 */
export const recordDownloadEvent = ({ action, outcome, filename, bytes, errorMessage }) => {
  if (!action || !outcome) return;
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('carryon_token') : null;
    if (!token) return; // anonymous downloads don't telemetry
    const payload = {
      action: String(action).slice(0, 64),
      outcome: String(outcome).slice(0, 24),
      platform: detectPlatform(),
      filename: filename ? String(filename).slice(0, 160) : null,
      bytes: typeof bytes === 'number' ? bytes : null,
      ua_snippet: typeof navigator !== 'undefined' ? (navigator.userAgent || '').slice(0, 160) : null,
      error_message: errorMessage ? String(errorMessage).slice(0, 200) : null,
    };
    // Fire-and-forget — no await, no .catch chained beyond a swallow.
    axios.post(`${API_URL}/diagnostics/download-event`, payload, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
    }).catch(() => {});
  } catch {
    // ignore
  }
};

export default recordDownloadEvent;
