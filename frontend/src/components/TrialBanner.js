import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Clock, ChevronRight, X } from 'lucide-react';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function TrialBanner({ onUpgrade }) {
  const { token } = useAuth();
  const [trial, setTrial] = useState(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('trial_banner_dismissed') === 'true');

  useEffect(() => {
    if (!token) return;
    const fetchStatus = async () => {
      try {
        const res = await axios.get(`${API_URL}/subscriptions/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.data;
        // Only show if on trial and not beta mode and no active subscription
        if (data.trial?.trial_active && !data.beta_mode && !data.subscription) {
          setTrial(data.trial);
        }
      } catch (err) { /* silent */ }
    };
    fetchStatus();
  }, [token]);

  if (!trial || dismissed) return null;

  const urgency = trial.days_remaining <= 5 ? 'urgent' : trial.days_remaining <= 10 ? 'warning' : 'info';

  const colors = {
    urgent: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', text: '#ef4444', icon: '#ef4444' },
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', text: '#F59E0B', icon: '#F59E0B' },
    info: { bg: 'rgba(212,175,55,0.06)', border: 'rgba(212,175,55,0.15)', text: '#1B4F72', icon: '#2563EB' },
  };

  const c = colors[urgency];

  return (
    <div
      className="rounded-xl p-3 flex items-center justify-between gap-3 animate-fade-in"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}
      data-testid="trial-banner"
    >
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 flex-shrink-0" style={{ color: c.icon }} />
        <span className="text-sm font-medium" style={{ color: c.text }}>
          {trial.days_remaining <= 1
            ? 'Your free trial ends today!'
            : `${trial.days_remaining} days left in your free trial`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {onUpgrade && (
          <button
            onClick={onUpgrade}
            className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            style={{ background: c.icon, color: '#0F1629' }}
            data-testid="trial-upgrade-btn"
          >
            Choose Plan <ChevronRight className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={() => { setDismissed(true); sessionStorage.setItem('trial_banner_dismissed', 'true'); }}
          className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[var(--t4)] active:scale-90 transition-transform"
          data-testid="trial-dismiss-btn"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
