import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Renders a slim banner at the top of the viewport when the device goes offline.
 * Automatically hides when connectivity is restored.
 */
const NetworkBanner = () => {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const goOffline = () => { setOffline(true); setWasOffline(true); };
    const goOnline = () => setOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Auto-dismiss "Back online" after 3 seconds
  useEffect(() => {
    if (!offline && wasOffline) {
      const t = setTimeout(() => setWasOffline(false), 3000);
      return () => clearTimeout(t);
    }
  }, [offline, wasOffline]);

  if (!offline && !wasOffline) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100000] flex items-center justify-center gap-2 py-2 text-xs font-semibold transition-all duration-300"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        background: offline ? '#991b1b' : '#166534',
        color: '#ffffff',
      }}
      role="alert"
      aria-live="assertive"
      data-testid="network-banner"
    >
      {offline ? (
        <>
          <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
          No internet connection
        </>
      ) : (
        'Back online'
      )}
    </div>
  );
};

export default NetworkBanner;
