import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

/**
 * OfflineSavedBadge — a TRUTHFUL "Saved offline" indicator.
 *
 * The green check renders ONLY when `check()` resolves truthy — i.e. the
 * bytes genuinely exist in the local store (IndexedDB). It must NEVER be
 * driven by a "supposed to be saved" server flag (e.g. `pinned_offline`):
 * the caller passes a check that reads the ACTUAL cache, such as
 * `isPinnedLocally(docId)` (full pinned-doc blob) or
 * `getImageBlob('mm:<id>:video')` (cached milestone video).
 *
 * Re-checks on mount and whenever a relevant cache-change event fires:
 *   - `carryon:pins-changed`        a document was pinned/unpinned
 *   - `carryon:sync:finish`         post-login warm-up finished persisting
 *   - `carryon:offline:blob-saved`  any blob persisted via putImageBlob
 * so the badge appears the instant the thing is really on the device, and
 * disappears the instant it's evicted/unpinned.
 */
const DEFAULT_EVENTS = ['carryon:pins-changed', 'carryon:sync:finish', 'carryon:offline:blob-saved'];

export default function OfflineSavedBadge({
  check,
  events = DEFAULT_EVENTS,
  label = 'Saved offline',
  testId,
  className = '',
}) {
  const [saved, setSaved] = useState(false);
  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    let alive = true;
    const run = () => {
      Promise.resolve()
        .then(() => (checkRef.current ? checkRef.current() : false))
        .then((v) => { if (alive) setSaved(!!v); })
        .catch(() => { if (alive) setSaved(false); });
    };
    run();
    const handler = () => run();
    events.forEach((e) => window.addEventListener(e, handler));
    return () => {
      alive = false;
      events.forEach((e) => window.removeEventListener(e, handler));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!saved) return null;

  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${className}`}
      style={{
        background: 'rgba(16,185,129,0.12)',
        border: '1px solid rgba(16,185,129,0.35)',
        color: '#34d399',
      }}
      title="This is saved on your device and will open without an internet connection"
    >
      <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
      {label}
    </span>
  );
}
