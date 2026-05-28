import React, { useState } from 'react';
import apiClient from '../utils/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { API_URL } from '../config';

export default function BetaWelcomeModal({ onAccepted }) {
  const { token } = useAuth();
  const [accepting, setAccepting] = useState(false);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await apiClient.post(`${API_URL}/beta/accept`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      onAccepted();
    } catch (err) {
      console.error('Failed to accept beta terms:', err);
      onAccepted(); // Still dismiss on error
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto" data-testid="beta-welcome-modal">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-[90%] max-w-md rounded-2xl p-6 sm:p-8 shadow-2xl"
        style={{
          background: 'var(--bg2, #1a1f36)',
          border: '1px solid var(--b, #2a2f4a)',
        }}
      >
        {/* Beta Badge */}
        <div className="flex justify-center mb-5">
          <span
            className="px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase"
            style={{ background: 'rgba(var(--gold-rgb), 0.15)', color: '#d4af37', border: '1px solid rgba(var(--gold-rgb), 0.3)' }}
          >
            Beta Program
          </span>
        </div>

        <h2
          className="text-xl sm:text-2xl font-bold text-center mb-3"
          style={{ color: 'var(--t, #fff)', fontFamily: 'var(--sans)' }}
        >
          Welcome to CarryOn Beta
        </h2>

        <div className="space-y-3 text-sm leading-relaxed" style={{ color: 'var(--t4, #9ca3af)' }}>
          <p>
            You have been selected to participate in CarryOn's <strong style={{ color: 'var(--t, #fff)' }}>Beta Testing Program</strong>.
          </p>
          <p>
            As a beta tester, you will enjoy <strong style={{ color: '#22C993' }}>no subscription fees</strong> for the
            duration of your participation. In return, we ask that you help us improve the platform by reporting any
            issues or suggestions using the feedback button available on every screen.
          </p>
          <p>
            By clicking <strong style={{ color: 'var(--t, #fff)' }}>I Agree</strong> below, you agree to participate
            in CarryOn's Beta Testing Program.
          </p>
        </div>

        <Button
          onClick={handleAccept}
          disabled={accepting}
          className="w-full mt-6 h-12 text-base font-bold rounded-xl"
          style={{
            background: 'linear-gradient(135deg, #d4af37, #b8942e)',
            color: 'var(--bg2)',
          }}
          data-testid="beta-accept-btn"
        >
          {accepting ? 'Please wait...' : 'I Agree'}
        </Button>
      </div>
    </div>
  );
}
