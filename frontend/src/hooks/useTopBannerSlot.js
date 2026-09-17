import { useLayoutEffect, useRef, useState } from 'react';

const GAP_BELOW = 6;

/**
 * useTopBannerSlot — reserve a fixed slot at the top of the screen for a
 * banner. Mirrors TrusteeBanner: snapshots whatever earlier banners already
 * published into `--cy-offline-banner-h`, stacks below them, absorbs the iOS
 * status-bar inset when it is the topmost banner, and adds its own measured
 * height so the mobile header / sidebar / main content step down.
 */
export default function useTopBannerSlot(active) {
  const ref = useRef(null);
  const [top, setTop] = useState(0);

  useLayoutEffect(() => {
    if (!active) return undefined;
    const root = document.documentElement;
    const priorOffline = root.style.getPropertyValue('--cy-offline-banner-h') || '0px';
    const priorPx = priorOffline.endsWith('px') ? parseFloat(priorOffline) : 0;
    const priorHeaderSafeTop = root.style.getPropertyValue('--cy-header-safe-top') || 'env(safe-area-inset-top, 0px)';
    setTop(priorPx);
    root.style.setProperty('--cy-header-safe-top', '0px');

    const measure = () => {
      const h = ref.current?.offsetHeight || 0;
      root.style.setProperty('--cy-offline-banner-h', `${priorPx + h + GAP_BELOW}px`);
    };
    measure();
    const t = setTimeout(measure, 60);
    let ro = null;
    try {
      if (typeof ResizeObserver !== 'undefined' && ref.current) {
        ro = new ResizeObserver(measure);
        ro.observe(ref.current);
      }
    } catch { /* measure-on-render fallback */ }
    return () => {
      clearTimeout(t);
      if (ro) ro.disconnect();
      root.style.setProperty('--cy-offline-banner-h', priorOffline);
      root.style.setProperty('--cy-header-safe-top', priorHeaderSafeTop);
    };
  }, [active]);

  // Topmost banner owns the status-bar inset; stacked banners sit below one that already did.
  const paddingTop = top > 0 ? '0px' : 'env(safe-area-inset-top, 0px)';
  return { ref, top, paddingTop };
}
