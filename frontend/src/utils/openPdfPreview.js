/**
 * openPdfPreview — universal PDF preview launcher.
 *
 * Fetches a PDF blob from the caller's `blobFetcher`, then pops a
 * full-screen MODAL OVERLAY (PdfPreviewModal) over the current route.
 * The calling page stays mounted in the background so "Back" instantly
 * returns the user to exactly where they were — no SPA route re-mount,
 * no boot-splash flash on iOS PWA where suspending the webview during
 * a 30s xAI call can sometimes trigger a re-launch.
 *
 * Usage:
 *
 *   await openPdfPreview({
 *     pdfType: 'ega_todo',                 // optional; enables caching
 *     filename: 'CarryOn_ToDo.pdf',
 *     title:    'EGA To-Do List',
 *     subtitle: '2026-02-13',
 *     blobFetcher: async () => {
 *       const res = await apiClient.post(..., { responseType: 'blob' });
 *       return new Blob([res.data], { type: 'application/pdf' });
 *     },
 *   });
 *
 * When `pdfType` is supplied (one of the allowed types in
 * backend/routes/pdfs.py::PDF_TYPE_REGISTRY), the freshly rendered
 * blob is also FIRE-AND-FORGET uploaded to the per-user latest-PDF
 * cache. That cache backs the inline `<CachedPdfIcon pdfType="..." />`
 * affordance on each section page, so the most recent PDF per section
 * stays viewable across navigation, reloads, PWA cold starts, and
 * device switches — replacing the prior "single global pill" behavior.
 *
 * The `navigate` parameter is accepted for backwards compatibility
 * with call-sites converted before this refactor — it is now ignored.
 */
import apiClient from './apiClient';
import { API_URL } from '../config';

let _jobCounter = 0;

/**
 * Fire-and-forget upload of the freshly-rendered blob to the backend
 * latest-PDF cache. Wrapped in try/catch so any failure (network
 * blip, S3 hiccup, expired token) doesn't bubble up to the user —
 * the preview has already opened and that's what matters for UX.
 */
async function _writeToCache({ blob, pdfType, title, subtitle, filename }) {
  if (!pdfType) return; // opt-in
  try {
    const token = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem('carryon_token')
      : null;
    if (!token) return;
    const fd = new FormData();
    fd.append('file', blob, filename || `${pdfType}.pdf`);
    fd.append('pdf_type', pdfType);
    if (title) fd.append('title', title);
    if (subtitle) fd.append('subtitle', subtitle);
    if (filename) fd.append('filename', filename);
    await apiClient.post(`${API_URL}/pdfs/cache`, fd, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    });
  } catch (err) {
    // Eat. Failure here is recoverable — the user still has their
    // open preview; the next regeneration will retry the cache write.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[openPdfPreview] cache write failed:', err?.message);
    }
  }
}

export async function openPdfPreview({ blobFetcher, filename, title, subtitle, pdfType }) {
  if (typeof blobFetcher !== 'function') {
    throw new Error('openPdfPreview: blobFetcher function is required');
  }
  const jobId = ++_jobCounter;
  window.dispatchEvent(new CustomEvent('carryon:pdf-job-start', {
    detail: { jobId, pdfType: pdfType || null, title: title || 'Document', subtitle: subtitle || '' },
  }));
  try {
    const blob = await blobFetcher();
    if (!(blob instanceof Blob)) {
      throw new Error('blobFetcher must return a Blob');
    }
    if (blob.size < 50) {
      throw new Error('Generated PDF is empty');
    }
    const url = URL.createObjectURL(blob);
    const entry = {
      jobId,
      pdfType: pdfType || null,
      blob,
      url,
      filename: filename || 'document.pdf',
      title: title || 'Document',
      subtitle: subtitle || '',
    };
    window.dispatchEvent(new CustomEvent('carryon:open-pdf-preview', { detail: entry }));
    window.dispatchEvent(new CustomEvent('carryon:pdf-job-complete', { detail: entry }));
    // Fire-and-forget cache write so the inline icon picks it up
    // next mount. Doesn't block the preview, doesn't propagate errors.
    _writeToCache({ blob, pdfType, title, subtitle, filename });
  } catch (err) {
    window.dispatchEvent(new CustomEvent('carryon:pdf-job-error', {
      detail: { jobId, pdfType: pdfType || null, title: title || 'Document', error: err?.message || 'unknown' },
    }));
    throw err;
  }
}

// --- Legacy compatibility ---------------------------------------------------
// Old PdfPreviewPage stored entries in a module-level Map. Anything that still
// reaches `/pdf-preview/:key` after this refactor will land on a friendly
// "preview unavailable" page (see PdfPreviewModal.PdfPreviewLegacyExpired).
// The named exports below are no-ops kept around so prior imports don't break.
export function consumePreviewEntry() { return null; }
export function disposePreviewEntry() { /* no-op */ }
