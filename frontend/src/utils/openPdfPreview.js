/**
 * openPdfPreview — universal PDF preview launcher.
 *
 * Fetches a PDF blob from the caller's `blobFetcher`, then pops a full-screen
 * MODAL OVERLAY (PdfPreviewModal) over the current route. The calling page
 * stays mounted in the background so "Back" instantly returns the user to
 * exactly where they were — no SPA route re-mount, no boot-splash flash on
 * iOS PWA where suspending the webview during a 30s xAI call can sometimes
 * trigger a re-launch.
 *
 * Usage (call-site):
 *
 *   await openPdfPreview({
 *     filename: 'CarryOn_IAC.pdf',
 *     title:    'IAC Checklist',
 *     subtitle: '2026-02-13',
 *     blobFetcher: async () => {
 *       const res = await axios.post(..., { responseType: 'blob' });
 *       return new Blob([res.data], { type: 'application/pdf' });
 *     },
 *   });
 *
 * The `navigate` parameter is accepted for backwards compatibility with
 * call-sites converted before this refactor — it is now ignored.
 */

/**
 * Fetch a PDF blob and pop the preview modal.
 *
 * @param {object} opts
 * @param {function} opts.blobFetcher  Async fn → Blob (application/pdf)
 * @param {string}   opts.filename     Used for share-sheet / download
 * @param {string}   opts.title        Shown in the preview header
 * @param {string=}  opts.subtitle     Optional sub-line under the title
 * @param {function=} opts.navigate    Ignored — kept for backwards compat
 * @returns {Promise<void>}
 */
export async function openPdfPreview({ blobFetcher, filename, title, subtitle }) {
  if (typeof blobFetcher !== 'function') {
    throw new Error('openPdfPreview: blobFetcher function is required');
  }
  const blob = await blobFetcher();
  if (!(blob instanceof Blob)) {
    throw new Error('openPdfPreview: blobFetcher must return a Blob');
  }
  if (blob.size < 50) {
    throw new Error('Generated PDF is empty');
  }
  const url = URL.createObjectURL(blob);
  const entry = {
    blob,
    url,
    filename: filename || 'document.pdf',
    title: title || 'Document',
    subtitle: subtitle || '',
  };
  window.dispatchEvent(new CustomEvent('carryon:open-pdf-preview', { detail: entry }));
}

// --- Legacy compatibility ----------------------------------------------------
// Old PdfPreviewPage stored entries in a module-level Map. Anything that still
// reaches `/pdf-preview/:key` after this refactor will land on a friendly
// "preview unavailable" page (see PdfPreviewModal.PdfPreviewLegacyExpired).
// The named exports below are no-ops kept around so prior imports don't break.
export function consumePreviewEntry() { return null; }
export function disposePreviewEntry() { /* no-op */ }
