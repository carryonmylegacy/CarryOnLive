import axios from 'axios';
import { API_URL } from '../config';

/* One request per public endpoint per page load, shared by every component that needs it
   (FounderCard, footers, LiveStats, homepage video IDs…). 60 s stale window; failures are
   not cached so a cold Render start retries on the next mount. */
const TTL_MS = 60_000;
const cache = new Map();

export const getPublic = (path) => {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = axios.get(`${API_URL}${path}`).then(r => r.data).catch(err => { cache.delete(path); throw err; });
  cache.set(path, { at: Date.now(), promise });
  return promise;
};
