/**
 * Simple in-memory API cache with TTL.
 * Prevents redundant API calls when navigating quickly between pages.
 */
const cache = new Map();

export const cachedGet = async (axios, url, config, ttlMs = 30000) => {
  const key = `${url}|${config?.headers?.Authorization || ''}`;
  const cached = cache.get(key);
  
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return { data: cached.data };
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
