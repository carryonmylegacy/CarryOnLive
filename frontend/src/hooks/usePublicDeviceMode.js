import { useEffect, useRef } from 'react';
import { wipePublicDeviceSession, wipePublicDeviceSessionSync } from '../utils/wipePublicDeviceSession';

/**
 * usePublicDeviceMode — activates the Public Device Mode wipe handlers
 * when the user's effective `public_device_mode` flag (computed on the
 * server as the OR across all estates they're a member of) is true.
 *
 * Two independent triggers:
 *   1. `pagehide` fires reliably on tab close, browser close, hard reload,
 *      and (on iOS Safari) when the page is moved to bfcache. We use the
 *      synchronous `wipePublicDeviceSessionSync` here because async work
 *      isn't guaranteed to complete after `pagehide`.
 *   2. Idle-timeout: after `idleSeconds` of no user input (mouse, key,
 *      touch, scroll), we fire the full async wipe and redirect to /login.
 *      This catches the "borrowed phone left on a table" case.
 *
 * Off by default. Activates only when `enabled` is true (i.e. the
 * benefactor has flipped it on for at least one of the user's estates).
 *
 * Hook owns no UI; mount once at the App root.
 */
export default function usePublicDeviceMode({ enabled, idleSeconds = 90, token, onWipe }) {
  const idleTimerRef = useRef(null);

  useEffect(() => {
    if (!enabled || !token) return undefined;

    const triggerIdleWipe = async () => {
      await wipePublicDeviceSession({ token });
      onWipe?.();
      // Force a clean reload so React state is also gone.
      window.location.href = '/login?pdm=1';
    };

    const resetIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(triggerIdleWipe, idleSeconds * 1000);
    };

    const onPageHide = () => {
      // Synchronous, beacon-based — survives browser close.
      wipePublicDeviceSessionSync({ token });
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(e => document.addEventListener(e, resetIdle, { passive: true }));
    window.addEventListener('pagehide', onPageHide);
    resetIdle();

    return () => {
      events.forEach(e => document.removeEventListener(e, resetIdle));
      window.removeEventListener('pagehide', onPageHide);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [enabled, idleSeconds, token, onWipe]);
}
