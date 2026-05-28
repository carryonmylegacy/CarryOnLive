import React, { useState, useEffect } from 'react';
import apiClient from '../utils/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { AlertTriangle, CreditCard, ChevronRight, X } from 'lucide-react';
import { API_URL } from '../config';

export default function BillingStatusBanner({ onUpdatePayment }) {
  const { token } = useAuth();
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!token) return;
    const fetchStatus = async () => {
      try {
        const res = await apiClient.get(`${API_URL}/subscriptions/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.data;
        if (data.is_grace_period) {
          let daysRemaining = null;
          if (data.grace_period_end) {
            const end = new Date(data.grace_period_end);
            daysRemaining = Math.max(0, Math.ceil((end - Date.now()) / 86400000));
          }
          setStatus({ type: 'grace', daysRemaining });
        } else if (data.is_dormant) {
          setStatus({ type: 'dormant', since: data.dormant_since });
        }
      } catch { /* silent */ }
    };
    fetchStatus();
  }, [token]);

  if (!status || dismissed) return null;

  const handleAction = () => {
    if (onUpdatePayment) {
      onUpdatePayment();
    } else {
      window.location.href = '/settings';
    }
  };

  if (status.type === 'grace') {
    const urgent = status.daysRemaining != null && status.daysRemaining <= 5;
    return (
      <div
        className="rounded-xl p-3 flex items-center justify-between gap-3 animate-fade-in"
        style={{
          background: urgent ? 'rgba(239,68,68,0.08)' : 'rgba(245,166,35,0.08)',
          border: `1px solid ${urgent ? 'rgba(239,68,68,0.25)' : 'rgba(245,166,35,0.25)'}`,
        }}
        data-testid="billing-grace-banner"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <CreditCard className="w-4 h-4 flex-shrink-0" style={{ color: urgent ? '#EF4444' : '#F5A623' }} />
          <span className="text-sm font-medium" style={{ color: urgent ? '#EF4444' : '#F5A623' }}>
            {status.daysRemaining != null
              ? status.daysRemaining <= 1
                ? 'Payment update required today to keep full access!'
                : `${status.daysRemaining} days to update your payment method`
              : 'Please update your payment method'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleAction}
            className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"
            style={{ background: urgent ? '#EF4444' : '#F5A623', color: '#0F1629' }}
            data-testid="billing-update-payment-btn"
          >
            Update <ChevronRight className="w-3 h-3" />
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[var(--t4)]"
            data-testid="billing-dismiss-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Dormant — persistent, cannot be dismissed
  return (
    <div
      className="rounded-xl p-4 animate-fade-in"
      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
      data-testid="billing-dormant-banner"
    >
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: '#EF4444' }} />
        <span className="text-sm font-bold" style={{ color: '#EF4444' }}>Account Dormant</span>
      </div>
      <p className="text-xs text-[var(--t4)] mb-3 leading-relaxed">
        Your account is in a dormant state due to an expired payment. You can still view your existing data, but uploads, edits, DTS services, and beneficiary transitions are suspended.
      </p>
      <button
        onClick={handleAction}
        className="text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-1.5"
        style={{ background: '#d4af37', color: '#0F1629' }}
        data-testid="billing-reactivate-btn"
      >
        <CreditCard className="w-4 h-4" /> Reactivate My Account
      </button>
    </div>
  );
}
