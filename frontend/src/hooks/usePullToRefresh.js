import { useState, useCallback, useRef } from 'react';
import { tapLight } from '../utils/haptics';

/**
 * Pull-to-refresh hook for native-feeling content refresh.
 *
 * Usage:
 *   const { pullProps, refreshing, PullIndicator } = usePullToRefresh(fetchData);
 *   return <div {...pullProps}><PullIndicator />{content}</div>;
 */
export function usePullToRefresh(onRefresh) {
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const pulling = useRef(false);
  const threshold = 80;

  const onTouchStart = useCallback((e) => {
    // Only pull if scrolled to top
    const el = e.currentTarget;
    if (el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!pulling.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, 120));
    }
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      tapLight();
      try {
        await onRefresh();
      } catch { /* handled by caller */ }
      setRefreshing(false);
    }
    setPullDistance(0);
  }, [pullDistance, refreshing, onRefresh]);

  const pullProps = {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };

  const PullIndicator = () => {
    if (pullDistance <= 0 && !refreshing) return null;
    const progress = Math.min(pullDistance / threshold, 1);
    return (
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
        style={{ height: refreshing ? 48 : pullDistance > 10 ? pullDistance * 0.5 : 0 }}
        aria-live="polite"
        data-testid="pull-to-refresh-indicator"
      >
        <div
          className="w-6 h-6 rounded-full border-2 border-[var(--gold)]"
          style={{
            borderTopColor: 'transparent',
            transform: `rotate(${progress * 360}deg)`,
            animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
            opacity: Math.max(progress, refreshing ? 1 : 0),
          }}
        />
      </div>
    );
  };

  return { pullProps, refreshing, PullIndicator };
}
