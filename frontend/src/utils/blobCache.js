/**
 * LRU blob cache for document thumbnails.
 * Limits memory by evicting oldest entries when cache exceeds maxSize.
 * Each blob URL is ~50-200KB in memory.
 */
const MAX_CACHE_SIZE = 30; // Max 30 thumbnails cached (~6MB worst case)
const cache = new Map();

export const getCachedBlob = (key) => {
  if (cache.has(key)) {
    // Move to end (most recently used)
    const val = cache.get(key);
    cache.delete(key);
    cache.set(key, val);
    return val;
  }
  return null;
};

export const setCachedBlob = (key, blobUrl) => {
  if (cache.size >= MAX_CACHE_SIZE) {
    // Evict oldest (first entry)
    const oldestKey = cache.keys().next().value;
    const oldUrl = cache.get(oldestKey);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    cache.delete(oldestKey);
  }
  cache.set(key, blobUrl);
};

export const clearBlobCache = () => {
  for (const url of cache.values()) {
    if (url) URL.revokeObjectURL(url);
  }
  cache.clear();
};
