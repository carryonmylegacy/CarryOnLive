import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Clock, ChevronRight } from 'lucide-react';
import { API_URL } from '../config';

export default function TrialBanner({ onUpgrade }) {
  const { token } = useAuth();
  const [trial, setTrial] = useState(null);

  useEffect(() => {
    if (!token) return;
    const fetchStatus = async () => {
      try {
        const res = await axios.get(`${API_URL}/subscriptions/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.data;
        if (data.trial?.trial_active && !data.beta_mode && !data.subscription) {
          setTrial(data.trial);
        }
      } catch { /* silent */ }
    };
    fetchStatus();
  }, [token]);

  if (!trial) return null;

  const urgency = trial.days_remaining <= 5 ? 'urgent' : trial.days_remaining <= 10 ? 'warning' : 'info';

  const colors = {
    urgent: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', text: '#ef4444', icon: '#ef4444' },
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', text: '#F59E0B', icon: '#F59E0B' },
    info: { bg: 'var(--trial-info-bg)', border: 'var(--trial-info-border)', text: 'var(--trial-info-text)', icon: 'var(--trial-info-icon)' },
  };

  const c = colors[urgency];

  return (
    <div
      className="rounded-xl p-3 flex items-center justify-between gap-3"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}
      data-testid="trial-banner"
    >
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 flex-shrink-0" style={{ color: c.icon }} />
        <span className="text-sm font-medium" style={{ color: c.text }}>
          {trial.days_remaining <= 1
            ? 'Your exploration period ends today!'
            : `${trial.days_remaining} days left in your exploration period`}
        </span>
      </div>
      {onUpgrade && (
        <button
          onClick={onUpgrade}
          className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 flex-shrink-0"
          style={{
            background: urgency === 'info' ? 'var(--trial-btn-bg)' : c.icon,
            color: urgency === 'info' ? 'var(--trial-btn-text)' : '#0F1629',
          }}
          data-testid="trial-upgrade-btn"
        >
          Choose Plan <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
