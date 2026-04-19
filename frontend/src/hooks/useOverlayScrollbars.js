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
    visibility: 'auto',
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
          inst.__carryon_cleanup = () => {
            handles.forEach((h) => h.removeEventListener('pointerdown', onDown));
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            window.removeEventListener('blur', onUp);
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
