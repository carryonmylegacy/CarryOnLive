/**
 * Simple in-memory API cache with TTL and stale-while-revalidate.
 * Prevents redundant API calls when navigating quickly between pages.
 */
const cache = new Map();

export const cachedGet = async (axios, url, config, ttlMs = 60000) => {
  const key = `${url}|${config?.headers?.Authorization || ''}`;
  const cached = cache.get(key);
  
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age < ttlMs) {
      return { data: cached.data };
    }
    // Stale-while-revalidate: return stale data immediately, refresh in background
    if (age < ttlMs * 3) {
      axios.get(url, config).then(res => {
        cache.set(key, { data: res.data, timestamp: Date.now() });
      }).catch(() => {});
      return { data: cached.data };
    }
  }
  
  const response = await axios.get(url, config);
  cache.set(key, { data: response.data, timestamp: Date.now() });
  return response;
};

export const invalidateCache = (urlPattern) => {
  for (const key of cache.keys()) {
    if (key.includes(urlPattern)) {
      cache.delete(key);
    }
  }
};

export const clearCache = () => cache.clear();
