/**
 * openPdfPreview — universal PDF preview launcher.
 *
 * Replaces the "download immediately" flow with a "preview-then-print" flow
 * that mirrors the EntitiesPrintPage pattern: a clean page with sticky
 * Back + Print toolbar (safe-area aware, hidden during @media print).
 *
 * Usage (call-site):
 *
 *   await openPdfPreview({
 *     navigate,                       // react-router navigate fn
 *     filename: 'CarryOn_IAC.pdf',    // for share-sheet / download fallback
 *     title:    'IAC Checklist',      // shown in the preview header
 *     blobFetcher: async () => {      // returns a Blob (application/pdf)
 *       const res = await axios.post(...,  { responseType: 'blob' });
 *       return new Blob([res.data], { type: 'application/pdf' });
 *     },
 *   });
 *
 * Behaviour:
 *   - blobFetcher runs in the calling page (so existing spinner/toast logic
 *     keeps working). On success the blob is registered in a module-level
 *     map keyed by a UUID and the user is navigated to /pdf-preview/:key.
 *   - PdfPreviewPage consumes the entry, renders the PDF inline, and offers
 *     Back / Print. Print = navigator.share() on iOS, iframe.print() on
 *     desktop, with a "download" fallback.
 *   - Stale entries are GC'd after 30 min so blob URLs don't leak.
 */

const previewBlobMap = new Map();
const TTL_MS = 30 * 60 * 1000;

function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'pdf-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

function gc() {
  const now = Date.now();
  for (const [key, entry] of previewBlobMap.entries()) {
    if (now - entry.createdAt > TTL_MS) {
      try { URL.revokeObjectURL(entry.url); } catch { /* ignore */ }
      previewBlobMap.delete(key);
    }
  }
}

export function consumePreviewEntry(key) {
  gc();
  return previewBlobMap.get(key) || null;
}

export function disposePreviewEntry(key) {
  const entry = previewBlobMap.get(key);
  if (entry) {
    try { URL.revokeObjectURL(entry.url); } catch { /* ignore */ }
    previewBlobMap.delete(key);
  }
}

/**
 * Fetch a PDF blob and route the user to the preview page.
 *
 * @param {object} opts
 * @param {function} opts.navigate     React-router navigate function
 * @param {function} opts.blobFetcher  Async fn → Blob (application/pdf)
 * @param {string}   opts.filename     Used for share-sheet / download
 * @param {string}   opts.title        Shown in the preview header
 * @param {string=}  opts.subtitle     Optional sub-line under the title
 * @returns {Promise<{ key: string }>} Resolves once the navigation is queued.
 */
export async function openPdfPreview({ navigate, blobFetcher, filename, title, subtitle }) {
  if (typeof navigate !== 'function') {
    throw new Error('openPdfPreview: navigate function is required');
  }
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
  const key = uuid();
  const url = URL.createObjectURL(blob);
  previewBlobMap.set(key, {
    blob,
    url,
    filename: filename || 'document.pdf',
    title: title || 'Document',
    subtitle: subtitle || '',
    createdAt: Date.now(),
  });
  navigate(`/pdf-preview/${key}`);
  return { key };
}
