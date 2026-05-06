import { useEffect, useRef } from 'react';

/**
 * useDebouncedRefetch — coalesces bursts of platform "data may have
 * changed" events into a single network roundtrip.
 *
 * Several pages on the platform listen to the same family of global
 * events (`online` / `offline` / `carryon:outbox:drained` /
 * `carryon:upload:complete` / `carryon:upload:swapped`) and refetch
 * their list when any of them fires. During offline-sync recovery —
 * or in Safari's flapping private-mode network state — these events
 * routinely fire 5–10 times within a second, queueing up that many
 * concurrent /api/* requests. Safari's 6-connection-per-origin cap
 * then starves the page's other resources (thumbnails, previews,
 * fonts) for a minute or more.
 *
 * This hook wraps `refetch` in a 400 ms trailing-edge debounce and
 * binds it to the supplied event names. Use it instead of attaching
 * raw `addEventListener` calls.
 *
 * @param {() => void} refetch       fired ONCE per quiet 400 ms window
 * @param {string[]}    events       event names to listen on
 * @param {number}      [delay=400]  trailing-edge debounce in ms
 */
export function useDebouncedRefetch(refetch, events, delay = 400) {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    let timer = null;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        refetchRef.current?.();
      }, delay);
    };
    for (const name of events) window.addEventListener(name, handler);
    return () => {
      if (timer) clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.join('|'), delay]);
}
