// CarryOn™ — useOverlayScrollbars hook
// ============================================================================
// Attaches OverlayScrollbars to any React ref with the CarryOn gold theme
// and the "don't show bar unless content > 1.5× viewport" threshold.
//
// Usage:
//   const ref = useRef(null);
//   useOverlayScrollbars(ref);
//   return <div ref={ref} className="overflow-y-auto">...</div>;
//
// The hook gracefully no-ops if the ref is null or if OverlayScrollbars
// is already attached to the element.

import { useEffect } from 'react';
import { OverlayScrollbars } from 'overlayscrollbars';
import 'overlayscrollbars/overlayscrollbars.css';
import '../styles/overlay-scrollbars.css';
import attachDragMomentum from '../utils/scrollbarMomentum';

const RATIO_THRESHOLD = 1.5;

const DEFAULT_OPTIONS = {
  scrollbars: {
    theme: 'os-theme-carryon-gold',
    // `visible` = always considered "needed"; autoHide: 'scroll' controls
    // when it's actually rendered. With `auto` the library can override
    // our intent and force visibility:hidden on the element even when the
    // `os-scrollbar-visible` class is present, which manifested as a
    // permanently invisible bar on chat/nested scroll containers.
    visibility: 'visible',
    autoHide: 'scroll',
    autoHideDelay: 1200,
    autoHideSuspend: false,
    dragScroll: true,
    clickScroll: false,
    pointers: ['mouse', 'touch', 'pen'],
  },
  overflow: { x: 'hidden', y: 'scroll' },
};

/**
 * Attaches OverlayScrollbars to `ref.current` with the CarryOn gold theme.
 * Re-attaches when any value in `deps` changes (e.g. when a parent
 * conditionally renders the scroll container, pass a dependency that flips
 * when the ref is populated).
 */
export function useOverlayScrollbars(ref, deps = []) {
  useEffect(() => {
    const el = ref?.current;
    if (!el) return undefined;
    if (OverlayScrollbars(el)) return undefined; // already attached

    const instance = OverlayScrollbars(
      { target: el },
      DEFAULT_OPTIONS,
      {
        initialized: (inst) => {
          const handles = [
            inst.elements().scrollbarHorizontal?.handle,
            inst.elements().scrollbarVertical?.handle,
          ].filter(Boolean);
          const onDown = () => document.documentElement.classList.add('os-dragging');
          const onUp = () => document.documentElement.classList.remove('os-dragging');
          handles.forEach((h) => h.addEventListener('pointerdown', onDown));
          window.addEventListener('pointerup', onUp);
          window.addEventListener('pointercancel', onUp);
          window.addEventListener('blur', onUp);
          const disposeMomentum = attachDragMomentum(inst);

          // Safety net: OverlayScrollbars `updated` callback can miss some
          // async content-load cases (e.g., chat messages streamed in). Also
          // re-evaluate the ratio whenever the user scrolls, so the bar
          // becomes visible if content has grown past the threshold since
          // the last `updated` event.
          const viewport = inst.elements().viewport;
          const host = inst.elements().host;
          const recomputeRatio = () => {
            if (!host || !viewport) return;
            const visible = viewport.clientHeight || 1;
            const total = viewport.scrollHeight || 0;
            const ratio = total / visible;
            host.setAttribute('data-ratio-low', ratio < RATIO_THRESHOLD ? 'true' : 'false');
          };
          viewport?.addEventListener('scroll', recomputeRatio, { passive: true });
          // Also recheck once per second for 5s after init to catch late
          // content loads in chat / vault / any dynamic page.
          const checkTimers = [];
          [250, 750, 2000, 5000].forEach((ms) => {
            checkTimers.push(setTimeout(recomputeRatio, ms));
          });

          inst.__carryon_cleanup = () => {
            handles.forEach((h) => h.removeEventListener('pointerdown', onDown));
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            window.removeEventListener('blur', onUp);
            viewport?.removeEventListener('scroll', recomputeRatio);
            checkTimers.forEach((t) => clearTimeout(t));
            disposeMomentum?.();
          };
        },
        updated: (inst) => {
          const host = inst.elements().host;
          const viewport = inst.elements().viewport;
          if (!host || !viewport) return;
          const visible = viewport.clientHeight || 1;
          const total = viewport.scrollHeight || 0;
          const ratio = total / visible;
          host.setAttribute('data-ratio-low', ratio < RATIO_THRESHOLD ? 'true' : 'false');
        },
      }
    );

    return () => {
      try {
        instance?.__carryon_cleanup?.();
        instance?.destroy();
      } catch {
        /* element may already be unmounted */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default useOverlayScrollbars;
