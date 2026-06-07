/**
 * CarryOn — clear every in-progress draft namespace (audit d5a54f5e P1).
 * ============================================================================
 * Drafts (Entity Wizard, useDraftState mirrors, DAV onboarding popup flag)
 * can hold PII / partially-entered sensitive data. On logout and on
 * AUTHZ_REVOKED they MUST be wiped so a shared device never resurfaces a
 * prior user's in-progress form.
 *
 * Namespaces cleared:
 *   localStorage   `cfp:entityWizard:draft:*`   — Entity Wizard drafts
 *   sessionStorage `carryon_draft:*`            — useDraftState snapshots
 *   sessionStorage `carryon_dav_popup_shown`    — DAV onboarding popup flag
 */
export function clearLocalDrafts() {
  try {
    if (typeof localStorage !== 'undefined') {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith('cfp:entityWizard:draft:')) toRemove.push(k);
      }
      toRemove.forEach((k) => { try { localStorage.removeItem(k); } catch { /* noop */ } });
    }
  } catch { /* private mode */ }
  try {
    if (typeof sessionStorage !== 'undefined') {
      const toRemove = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const k = sessionStorage.key(i);
        // carryon_draft:* (useDraftState) and cfp:smartcat:* (smart-categorize
        // session cache, audit #1798 P3) — both can hold a prior user's data.
        if (k && (k.startsWith('carryon_draft:') || k.startsWith('cfp:smartcat'))) toRemove.push(k);
      }
      toRemove.forEach((k) => { try { sessionStorage.removeItem(k); } catch { /* noop */ } });
      try { sessionStorage.removeItem('carryon_dav_popup_shown'); } catch { /* noop */ }
    }
  } catch { /* private mode */ }
}

export default clearLocalDrafts;

/**
 * Boot-time purge of legacy DAV notes drafts (audit #d0c48d7 P2).
 * Older builds persisted the DAV "notes" field via useDraftState into
 * sessionStorage (`carryon_draft:dav_form:<estate>:notes`). Notes are
 * secret-like, so existing users may have one sitting in storage right now —
 * scrub it on boot, independent of logout. Runs once per session, cheap.
 */
export function purgeLegacyDavNoteDrafts() {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const toRemove = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('carryon_draft:dav_form:') && k.endsWith(':notes')) toRemove.push(k);
    }
    toRemove.forEach((k) => { try { sessionStorage.removeItem(k); } catch { /* noop */ } });
  } catch { /* private mode */ }
}
