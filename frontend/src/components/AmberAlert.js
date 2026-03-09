import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { AlertTriangle, Shield, X, Volume2 } from 'lucide-react';
import { Button } from './ui/button';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Generate a repeating alert tone using Web Audio API.
 * Mimics an emergency broadcast tone — two alternating frequencies.
 */
const createAlertSound = () => {
  let ctx = null;
  let oscillatorA = null;
  let oscillatorB = null;
  let gainNode = null;
  let isPlaying = false;
  let lfoInterval = null;

  const start = () => {
    if (isPlaying) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = ctx.createGain();
      gainNode.gain.value = 0.3;
      gainNode.connect(ctx.destination);

      // Primary tone — 853 Hz (Emergency Alert System tone A)
      oscillatorA = ctx.createOscillator();
      oscillatorA.type = 'sine';
      oscillatorA.frequency.value = 853;
      oscillatorA.connect(gainNode);
      oscillatorA.start();

      // Secondary tone — 960 Hz (Emergency Alert System tone B)
      oscillatorB = ctx.createOscillator();
      oscillatorB.type = 'sine';
      oscillatorB.frequency.value = 960;
      oscillatorB.connect(gainNode);
      oscillatorB.start();

      // Pulse the volume to create the warbling effect
      let loud = true;
      lfoInterval = setInterval(() => {
        if (!gainNode || !ctx) return;
        const now = ctx.currentTime;
        gainNode.gain.setValueAtTime(loud ? 0.3 : 0.08, now);
        loud = !loud;
      }, 500);

      isPlaying = true;
    } catch (e) {
      console.warn('Alert sound failed:', e);
    }
  };

  const stop = () => {
    isPlaying = false;
    if (lfoInterval) clearInterval(lfoInterval);
    lfoInterval = null;
    try {
      if (oscillatorA) { oscillatorA.stop(); oscillatorA.disconnect(); }
      if (oscillatorB) { oscillatorB.stop(); oscillatorB.disconnect(); }
      if (gainNode) gainNode.disconnect();
      if (ctx) ctx.close();
    } catch {}
    oscillatorA = null;
    oscillatorB = null;
    gainNode = null;
    ctx = null;
  };

  return { start, stop };
};

/**
 * Continuous vibration pattern — mimics emergency alert.
 * Pattern: vibrate 300ms, pause 200ms, repeat.
 */
const startVibration = () => {
  if (!navigator.vibrate) return null;
  const pattern = [300, 200, 300, 200, 600, 400];
  // Repeat by re-triggering every cycle
  const intervalId = setInterval(() => {
    try { navigator.vibrate(pattern); } catch {}
  }, 2000);
  // Start immediately
  try { navigator.vibrate(pattern); } catch {}
  return intervalId;
};

const stopVibration = (intervalId) => {
  if (intervalId) clearInterval(intervalId);
  try { navigator.vibrate(0); } catch {}
};

/**
 * AmberAlert — Full-screen emergency overlay.
 * Repeating alert sound + vibration until user acknowledges.
 */
const AmberAlert = ({ alert, onAcknowledge }) => {
  const soundRef = useRef(null);
  const vibrationRef = useRef(null);
  const [pulsing, setPulsing] = useState(true);

  // Start sound + vibration on mount
  useEffect(() => {
    soundRef.current = createAlertSound();
    soundRef.current.start();
    vibrationRef.current = startVibration();

    // Pulse animation
    const pulseInterval = setInterval(() => setPulsing(p => !p), 800);

    return () => {
      if (soundRef.current) soundRef.current.stop();
      stopVibration(vibrationRef.current);
      clearInterval(pulseInterval);
    };
  }, []);

  const handleAcknowledge = async () => {
    // Stop sound + vibration immediately
    if (soundRef.current) soundRef.current.stop();
    stopVibration(vibrationRef.current);

    // Mark notification as read
    const token = localStorage.getItem('carryon_token');
    if (token && alert?.id) {
      try {
        await axios.post(`${API_URL}/notifications/${alert.id}/read`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }

    onAcknowledge(alert.id);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.92)' }}
      data-testid="amber-alert-overlay"
    >
      {/* Pulsing red border effect */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-700"
        style={{
          opacity: pulsing ? 1 : 0.3,
          boxShadow: 'inset 0 0 120px rgba(239, 68, 68, 0.4), inset 0 0 60px rgba(239, 68, 68, 0.2)',
          border: '4px solid rgba(239, 68, 68, 0.6)',
        }}
      />

      {/* Scanning line effect */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ opacity: 0.08 }}
      >
        <div
          className="w-full h-1 absolute"
          style={{
            background: 'linear-gradient(90deg, transparent, #EF4444, transparent)',
            animation: 'amberScan 2s linear infinite',
          }}
        />
      </div>

      {/* Alert Card */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #1a0a0a 0%, #0d0505 100%)',
          border: `2px solid ${pulsing ? 'rgba(239, 68, 68, 0.8)' : 'rgba(239, 68, 68, 0.3)'}`,
          boxShadow: pulsing
            ? '0 0 60px rgba(239, 68, 68, 0.3), 0 0 120px rgba(239, 68, 68, 0.1)'
            : '0 0 30px rgba(239, 68, 68, 0.15)',
          transition: 'border-color 0.7s, box-shadow 0.7s',
        }}
        data-testid="amber-alert-card"
      >
        {/* Header bar */}
        <div
          className="px-4 py-2 flex items-center gap-2"
          style={{
            background: pulsing ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
            transition: 'background 0.7s',
          }}
        >
          <AlertTriangle className="w-4 h-4 text-[#EF4444]" />
          <span className="text-[11px] font-bold text-[#EF4444] uppercase tracking-[0.15em]">
            Priority 1 — Security Alert
          </span>
          <Volume2
            className="w-3.5 h-3.5 text-[#EF4444] ml-auto"
            style={{ opacity: pulsing ? 1 : 0.4, transition: 'opacity 0.7s' }}
          />
        </div>

        {/* Content */}
        <div className="p-6 text-center">
          {/* Shield icon with pulse */}
          <div
            className="mx-auto mb-5 w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              background: pulsing ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
              border: `2px solid ${pulsing ? 'rgba(239, 68, 68, 0.5)' : 'rgba(239, 68, 68, 0.2)'}`,
              boxShadow: pulsing ? '0 0 40px rgba(239, 68, 68, 0.2)' : 'none',
              transition: 'all 0.7s',
            }}
          >
            <Shield className="w-10 h-10 text-[#EF4444]" />
          </div>

          <h1
            className="text-xl font-bold text-white mb-3"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            {alert?.title || 'Security Alert'}
          </h1>

          <p className="text-sm text-[#94A3B8] leading-relaxed mb-6 max-w-sm mx-auto">
            {alert?.body || 'A critical security event requires your immediate attention.'}
          </p>

          {/* Metadata */}
          {alert?.metadata?.estate_id && (
            <div
              className="inline-block rounded-lg px-3 py-1.5 mb-5 text-[11px] text-[#94A3B8]"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              Estate: {alert.metadata.estate_name || alert.metadata.estate_id}
            </div>
          )}

          <div className="text-[10px] text-[#475569] mb-5">
            {alert?.created_at && new Date(alert.created_at).toLocaleString()}
          </div>

          {/* Acknowledge Button */}
          <Button
            onClick={handleAcknowledge}
            className="w-full py-3 text-sm font-bold"
            style={{
              background: 'linear-gradient(135deg, #DC2626, #B91C1C)',
              color: 'white',
              border: '1px solid rgba(239, 68, 68, 0.5)',
            }}
            data-testid="amber-alert-acknowledge"
          >
            <Shield className="w-4 h-4 mr-2" />
            Acknowledge Alert
          </Button>

          {alert?.url && (
            <a
              href={alert.url}
              className="block mt-3 text-xs text-[#60A5FA] hover:underline"
              onClick={handleAcknowledge}
              data-testid="amber-alert-view-details"
            >
              View Details
            </a>
          )}
        </div>
      </div>

      {/* CSS animation for scanning line */}
      <style>{`
        @keyframes amberScan {
          0% { top: -4px; }
          100% { top: 100%; }
        }
      `}</style>
    </div>
  );
};

/**
 * AmberAlertProvider — Polls for unacknowledged critical alerts.
 * Wraps the app and shows AmberAlert overlay when critical notifications arrive.
 */
export const AmberAlertProvider = () => {
  const [activeAlert, setActiveAlert] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('amber_dismissed') || '[]');
    } catch { return []; }
  });

  const checkForAlerts = useCallback(async () => {
    const token = localStorage.getItem('carryon_token');
    if (!token) return;

    try {
      const res = await axios.get(`${API_URL}/notifications?unread_only=true&limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      const criticalAlerts = (res.data.notifications || []).filter(n => {
        if (n.priority !== 'critical' || n.type !== 'security_alert') return false;
        if (dismissed.includes(n.id)) return false;
        // Skip alerts older than 24 hours — auto-mark as read
        const age = now - new Date(n.created_at).getTime();
        if (age > maxAge) {
          axios.post(`${API_URL}/notifications/${n.id}/read`, {}, {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
          return false;
        }
        return true;
      });
      if (criticalAlerts.length > 0 && !activeAlert) {
        setActiveAlert(criticalAlerts[0]);
      }
    } catch {}
  }, [dismissed, activeAlert]);

  useEffect(() => {
    checkForAlerts();
    const interval = setInterval(checkForAlerts, 10000);
    return () => clearInterval(interval);
  }, [checkForAlerts]);

  const handleAcknowledge = (alertId) => {
    const updated = [...dismissed, alertId];
    setDismissed(updated);
    sessionStorage.setItem('amber_dismissed', JSON.stringify(updated));
    setActiveAlert(null);
  };

  if (!activeAlert) return null;

  return <AmberAlert alert={activeAlert} onAcknowledge={handleAcknowledge} />;
};

export default AmberAlert;
