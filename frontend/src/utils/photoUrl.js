/**
 * Resolve photo URLs for display.
 * Handles:
 * - Legacy base64 data: URLs (pass through)
 * - http/https URLs (pass through)
 * - blob: URLs from camera preview (pass through)
 * - Storage keys like "photos/users/..." → full API URL
 * - Relative API paths like "/api/photos/..." → full API URL
 */
const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

export function resolvePhotoUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('blob:')) {
    return url;
  }
  // Relative API path
  if (url.startsWith('/api/')) {
    return `${API_BASE}${url}`;
  }
  // Raw storage key (e.g., "photos/users/...")
  if (url.startsWith('photos/')) {
    return `${API_BASE}/api/photos/${url}`;
  }
  return url;
}
