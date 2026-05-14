/**
 * ReferralCard — Settings/Dashboard tile for the user's personal referral link.
 *
 * Uses navigator.share when available (iOS PWA / Android), falls back to
 * Web Clipboard. Surfaces visits + signups stats with a quiet, on-brand
 * gold-on-navy presentation.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Copy, Share2, Check, Gift, Loader2 } from 'lucide-react';
import { API_URL } from '../config';
import { recordFunnelEvent } from '../utils/funnelTelemetry';
import { toast } from '../utils/toast';

const ReferralCard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('carryon_token');
    if (!token) { setLoading(false); return; }
    axios
      .get(`${API_URL}/api/referrals/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div
        className="rounded-xl p-6 flex items-center gap-3"
        style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
        data-testid="referral-card-loading"
      >
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--gold)' }} />
        <span className="text-sm" style={{ color: 'var(--t3)' }}>Loading your referral link…</span>
      </div>
    );
  }
  // Founder admin can globally disable the referral program. When OFF the
  // backend returns {enabled: false} and we render nothing.
  if (!data || data.enabled === false) return null;

  const { code, share_url, share_text, stats } = data;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(share_url);
      setCopied(true);
      toast.success('Referral link copied');
      recordFunnelEvent({ event: 'referral_share', meta: { method: 'copy', code } });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Long-press the link to share.');
    }
  };

  const handleShare = async () => {
    recordFunnelEvent({ event: 'referral_share', meta: { method: 'native', code } });
    if (navigator.share) {
      try {
        await navigator.share({ title: 'CarryOn', text: share_text, url: share_url });
      } catch { /* user cancelled */ }
    } else {
      handleCopy();
    }
  };

  return (
    <div
      className="rounded-xl p-6"
      style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
      data-testid="referral-card"
    >
      <div className="flex items-start gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.25)' }}
        >
          <Gift className="w-5 h-5" style={{ color: 'var(--gold)' }} />
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className="text-lg font-semibold mb-0.5 leading-tight"
            style={{ color: 'var(--t)', fontFamily: 'var(--serif)' }}
          >
            Give 7 days. Get 7 days.
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--t3)' }}>
            Share your code. When a friend signs up, you both get an extra week on your trial.
          </p>
        </div>
      </div>

      {/* Code box */}
      <div
        className="rounded-lg p-3 mb-4 flex items-center justify-between gap-2"
        style={{ background: 'var(--bg)', border: '1px dashed var(--b)' }}
      >
        <code
          className="text-base font-mono tracking-wider truncate"
          style={{ color: 'var(--gold)' }}
          data-testid="referral-code"
        >
          {code}
        </code>
        <button
          onClick={handleCopy}
          className="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 btn-outline-cta"
          data-testid="referral-copy-button"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      {/* Native share + stats */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={handleShare}
          className="px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 btn-gold-cta"
          data-testid="referral-share-button"
        >
          <Share2 className="w-3.5 h-3.5" />
          Share with a friend
        </button>
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--t4)' }}>
          <span data-testid="referral-stat-visits">
            <strong style={{ color: 'var(--t)' }}>{stats.visits}</strong> visits
          </span>
          <span data-testid="referral-stat-signups">
            <strong style={{ color: 'var(--t)' }}>{stats.signups}</strong> signups
          </span>
          <span data-testid="referral-stat-bonus">
            <strong style={{ color: 'var(--gold)' }}>+{stats.bonus_days_granted}d</strong> earned
          </span>
        </div>
      </div>
    </div>
  );
};

export default ReferralCard;
