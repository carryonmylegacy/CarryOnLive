// Drop-in replacement for useState that mirrors the value into
// sessionStorage so an in-progress "+ create new" form survives the
// user navigating away and coming back. Identical signature to
// useState; one extra return slot for clearing the draft on
// successful save / explicit cancel.
//
// Used by the CCP wizard, SDV upload modal, MM create modal,
// IAC form, DAV add modal, and FFN form so every "+" surface in
// the app behaves the same way: navigate-off, navigate-back,
// you're back where you were.
//
// Why sessionStorage (not localStorage):
//  - Drafts are scoped to the current tab/session. Closing the tab
//    or the iOS app's webview discards them, which is the right
//    default for half-finished work the user might have abandoned.
//  - localStorage would persist across reboots and could resurrect
//    months-old drafts in a way the user wouldn't expect.
//
// Why per-estate scoping:
//  - The hash-key always includes the active estate id so a benefactor
//    who manages multiple estates (or an admin previewing a benefactor
//    portal) doesn't bleed drafts across estates.
//
// Storage shape:
//   sessionStorage[`carryon_draft:${storageKey}`] = JSON.stringify(value)
//
// Failure mode: if sessionStorage is full or disabled (private mode
// on some browsers), reads return null and writes silently no-op —
// the form simply behaves like the old non-persisted version. We do
// NOT throw; a draft is a luxury, not load-bearing.

import { useState, useEffect, useCallback, useRef } from 'react';

const PREFIX = 'carryon_draft:';

const safeRead = (key) => {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const safeWrite = (key, value) => {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota / disabled — non-fatal */
  }
};

const safeRemove = (key) => {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* non-fatal */
  }
};

/**
 * useDraftState — useState that mirrors to sessionStorage.
 *
 * @param {string|null} storageKey — unique per (page, estate). Pass
 *   null to disable persistence (e.g. while estate is still resolving)
 *   — the hook then behaves like vanilla useState.
 * @param {*} initial — initial value used when no draft exists.
 * @param {object} [options]
 * @param {(value: any) => any} [options.sanitize] — optional pre-write
 *   transformer. Called with the current value; should return a copy
 *   safe to persist (e.g. with sensitive fields stripped). Useful for
 *   forms that contain passwords or other PII we don't want sitting in
 *   sessionStorage. The in-memory state is unchanged; only the
 *   persisted snapshot is filtered.
 * @returns {[value, setValue, clearDraft]}
 */
export function useDraftState(storageKey, initial, options) {
  const sanitize = options?.sanitize;
  // Resolve the seed value once, on first render. If the storageKey
  // is null we skip the read entirely so the hook stays cheap when
  // disabled.
  const [value, setValue] = useState(() => {
    if (!storageKey) return typeof initial === 'function' ? initial() : initial;
    const stored = safeRead(storageKey);
    if (stored !== undefined) return stored;
    return typeof initial === 'function' ? initial() : initial;
  });

  // Keep a ref to the active key so the autosave effect can react to
  // key changes (e.g. estate switch) without losing the current value.
  const keyRef = useRef(storageKey);
  useEffect(() => { keyRef.current = storageKey; }, [storageKey]);

  // After clearDraft is called, suppress the next autosave writeback so
  // a synchronous setState chain in a Cancel handler (clearDraft();
  // setTitle(''); setContent('')) doesn't immediately recreate the
  // key with default values. The flag is consumed by the next [value]
  // effect run, then restored to false so subsequent edits autosave
  // normally.
  const skipNextWriteRef = useRef(false);
  // Skip the very first autosave too: useEffect always fires once on
  // mount, and we don't want that initial run to overwrite a freshly-
  // read draft with the same value (harmless) OR to write a default
  // before the user has actually typed anything (chatty noise).
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (!keyRef.current) return;
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    const valueToWrite = sanitize ? sanitize(value) : value;
    safeWrite(keyRef.current, valueToWrite);
  }, [value, sanitize]);

  const clearDraft = useCallback(() => {
    if (keyRef.current) safeRemove(keyRef.current);
    skipNextWriteRef.current = true;
  }, []);

  return [value, setValue, clearDraft];
}

/**
 * clearDraftFor — escape hatch for clearing a draft from outside the
 * component (e.g. an "abandon all drafts on logout" sweep). Most
 * callers should use the third return slot of useDraftState instead.
 */
export function clearDraftFor(storageKey) {
  if (storageKey) safeRemove(storageKey);
}
