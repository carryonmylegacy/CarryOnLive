/**
 * CarryOn™ — Force Update Gate
 *
 * Checks the backend for a minimum required app version.
 * If the running version is below minimum, shows a blocking "Please update" screen.
 * Only active on native Capacitor builds.
 */

import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Download } from 'lucide-react';

const APP_VERSION = '1.0.0';
const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
    if (!Capacitor.isNativePlatform()) return;

    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/health`);
        const data = await res.json();
        const minVersion = data.min_version;
        if (minVersion && compareVersions(APP_VERSION, minVersion) < 0) {
          setBlocked(true);
        }
      } catch {
        // Network error — don't block, let NetworkBanner handle it
      }
    };
    check();
  }, []);

  if (!blocked) return children;

  return (
    <div
      className="fixed inset-0 z-[999999] flex flex-col items-center justify-center px-8"
      style={{
        background: 'linear-gradient(168deg, #080e1a 0%, #0d1627 50%, #0a1122 100%)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
      data-testid="force-update-gate"
    >
      <img src="/carryon-logo.jpg" alt="CarryOn" className="w-32 h-auto mb-8 opacity-80" />
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
        style={{ background: 'rgba(212,175,55,0.12)' }}
      >
        <Download className="w-8 h-8 text-[#d4af37]" />
      </div>
      <h1
        className="text-white text-2xl font-bold text-center mb-3"
        style={{ fontFamily: 'Outfit, sans-serif' }}
      >
        Update Required
      </h1>
      <p className="text-[#7b879e] text-sm text-center max-w-xs leading-relaxed mb-8">
        A new version of CarryOn is available with important security and feature updates.
        Please update to continue.
      </p>
      <button
        onClick={() => {
          // Open App Store page
          window.open('https://apps.apple.com/app/carryon/id6740080498', '_system');
        }}
        className="px-8 py-3.5 rounded-xl font-bold text-sm"
        style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
        data-testid="force-update-button"
      >
        Update Now
      </button>
    </div>
  );
};

export default ForceUpdateGate;
