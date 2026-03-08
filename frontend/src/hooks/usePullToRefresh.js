import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * CarryOn — Pull-to-Refresh Hook
 *
 * Adds native-feeling pull-to-refresh on mobile touch devices.
 * Attaches to the window scroll — works on any page without per-component setup.
 *
 * Usage:
 *   const { pullProgress, refreshing } = usePullToRefresh(onRefresh);
 *
 * CSS indicator is rendered by the PullToRefreshIndicator component.
 */
export function usePullToRefresh(onRefresh) {
  const [pullProgress, setPullProgress] = useState(0);    // 0–1 during drag
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);

  const THRESHOLD = 80; // px to pull before triggering refresh

  const handleTouchStart = useCallback((e) => {
    // Only activate when scrolled to top
    if (window.scrollY > 5 || refreshing) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, [refreshing]);

  const handleTouchMove = useCallback((e) => {
    if (!pulling.current || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta < 0) {
      pulling.current = false;
      setPullProgress(0);
      return;
    }
    // Diminishing returns after threshold
    const progress = Math.min(delta / THRESHOLD, 1.5);
    setPullProgress(progress);
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    if (pullProgress >= 1 && onRefresh) {
      setRefreshing(true);
      setPullProgress(1);
      try {
        await onRefresh();
      } catch {
        // swallow
      }
      setRefreshing(false);
    }
    setPullProgress(0);
  }, [pullProgress, onRefresh]);

  useEffect(() => {
    // Only enable on touch devices
    const isTouchDevice = 'ontouchstart' in window;
    if (!isTouchDevice) return;

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pullProgress, refreshing };
}
