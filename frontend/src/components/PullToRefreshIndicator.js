import React from 'react';
import { Loader2, ArrowDown } from 'lucide-react';

/**
 * CarryOn — Pull-to-Refresh Indicator
 *
 * Visual indicator rendered at top of viewport during pull gesture.
 * Controlled by usePullToRefresh hook.
 */
const PullToRefreshIndicator = ({ pullProgress, refreshing }) => {
  if (pullProgress <= 0 && !refreshing) return null;

  const translateY = refreshing ? 0 : Math.min(pullProgress * 50, 50) - 50;
  const opacity = refreshing ? 1 : Math.min(pullProgress, 1);
  const rotation = pullProgress * 180;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9998] flex justify-center pointer-events-none"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        transform: `translateY(${translateY}px)`,
        opacity,
        transition: refreshing ? 'none' : 'transform 0.1s ease-out',
      }}
      data-testid="pull-to-refresh-indicator"
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{
          background: 'var(--bg2, #1a2340)',
          border: '1px solid var(--b, rgba(255,255,255,0.1))',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        {refreshing ? (
          <Loader2 className="w-4 h-4 text-[#d4af37] animate-spin" />
        ) : (
          <ArrowDown
            className="w-4 h-4 text-[#d4af37] transition-transform"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        )}
      </div>
    </div>
  );
};

export default PullToRefreshIndicator;
