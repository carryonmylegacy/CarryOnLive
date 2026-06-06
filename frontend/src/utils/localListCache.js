/**
 * Tiny localStorage-based list cache.
 *
 * Used as an airplane-mode rescue for pages that don't have a full
 * Dexie repository (FFN, Financial Portal, Digital Wallet). When a
 * page successfully loads data from the server it calls `saveList`;
 * on re-mount while offline the page calls `readList` to rehydrate
 * the exact last-known-good list instead of showing a blank
 * "first-time" empty state.
 *
 * Keys are namespaced by the caller — pass a unique prefix per page +
 * entity (e.g. `ffn:<estate_id>`, `financial:bills:<estate_id>`).
 * Values are plain JSON; no schema assumptions are made here.
 *
 * localStorage cap on modern browsers is ~5 MB which is plenty for
 * the kind of list this helper is meant to rescue (contacts, bills,
 * accounts). If serialization fails (e.g. quota exceeded) we silently
 * drop the write — the feature degrades gracefully to its pre-cache
 * behaviour.
 */

const PREFIX = 'carryon_list_cache:';

export function saveList(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ v: value, ts: Date.now() }));
  } catch {
    /* quota or serialization failure — non-fatal */
  }
}

export function readList(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.v) ? parsed.v : (parsed?.v ?? null);
  } catch {
    return null;
  }
}

export function clearList(key) {
  try { localStorage.removeItem(PREFIX + key); } catch {}
}

/**
 * Remove EVERY `carryon_list_cache:*` entry. Called on logout so a shared
 * device retains no prior user's financial / DAV / FFN / checklist / list
 * payloads in localStorage (audit fa1ad83 #2).
 */
export function clearAllLists() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
    });
  } catch {}
}
