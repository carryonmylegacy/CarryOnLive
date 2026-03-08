import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * CarryOn — Network Status Banner
 *
 * Shows a non-intrusive banner when the device goes offline.
 * Auto-hides shortly after reconnection with a "Back online" confirmation.
 * Uses standard browser online/offline events — no dependencies.
 */
const NetworkStatusBanner = () => {
  const [online, setOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const goOffline = () => {
      setOnline(false);
      setWasOffline(true);
      setShowReconnected(false);
    };

    const goOnline = () => {
      setOnline(true);
      if (wasOffline) {
        setShowReconnected(true);
        // Auto-hide after 3 seconds
        setTimeout(() => setShowReconnected(false), 3000);
      }
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [wasOffline]);

  // Nothing to show
  if (online && !showReconnected) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold transition-all"
      style={{
        background: online ? '#059669' : '#DC2626',
        color: '#fff',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        animation: 'slideDown 0.3s ease-out',
      }}
      data-testid="network-status-banner"
      role="alert"
    >
      {online ? (
        <>
          <Wifi className="w-3.5 h-3.5" />
          <span>Back online</span>
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          <span>No internet connection</span>
        </>
      )}
    </div>
  );
};

export default NetworkStatusBanner;
