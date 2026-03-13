/**
 * Resolve photo URLs for display.
 * The backend returns absolute S3 presigned URLs or data: URLs.
 * This function is a passthrough safety net — it ensures any URL
 * format renders correctly in <img> tags.
 */
export function resolvePhotoUrl(url) {
  if (!url) return '';
  // All valid formats pass through: data:, http(s)://, blob:
  return url;
}
