import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * CarryOn — Force Update Gate
 *
 * Checks the backend /api/health endpoint for min_version.
 * If the running frontend version is below min_version, blocks the UI
 * and prompts the user to update. Checks every 5 minutes while active.
 *
 * The current app version is stored in REACT_APP_VERSION (defaults to "1.0.0").
 */

const APP_VERSION = process.env.REACT_APP_VERSION || '1.0.0';
const API_URL = process.env.REACT_APP_BACKEND_URL;
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

const ForceUpdateGate = ({ children }) => {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!API_URL) return;

    async function checkVersion() {
      try {
        const res = await fetch(`${API_URL}/api/health`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const minVersion = data.min_version;
        if (minVersion && compareVersions(APP_VERSION, minVersion) < 0) {
          setBlocked(true);
        }
      } catch {
        // Network error — don't block, just skip check
      }
    }

    checkVersion();
    const interval = setInterval(checkVersion, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  if (blocked) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'var(--bg, #0F1629)' }}
        data-testid="force-update-gate"
      >
        <div className="text-center max-w-sm">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(212,175,55,0.12)' }}
          >
            <AlertTriangle className="w-8 h-8 text-[#d4af37]" />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--t, #fff)' }}>
            Update Required
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--t2, #94a3b8)' }}>
            A new version of CarryOn is available. Please update to continue using the app.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-full text-sm font-bold transition-opacity hover:opacity-90"
            style={{ background: '#d4af37', color: '#080e1a' }}
            data-testid="force-update-reload-btn"
          >
            Reload App
          </button>
          <p className="text-xs mt-4" style={{ color: 'var(--t3, #64748b)' }}>
            Current: v{APP_VERSION}
          </p>
        </div>
      </div>
    );
  }

  return children;
};

export default ForceUpdateGate;
