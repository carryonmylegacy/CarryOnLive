/**
 * EmailHealthCard — small admin diagnostic card showing SPF / DKIM / DMARC
 * status for the configured sender domain. Auto-refreshes from the
 * server's 1-hour cache; "Re-check now" forces a live DNS lookup.
 *
 * Surfaces silent deliverability regressions (DNS edits, registrar
 * migrations) before users complain that emails aren't arriving.
 */
import React, { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Loader2, Mail, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';

const STATUS_META = {
  PASS: { color: '#10b981', Icon: CheckCircle2, label: 'PASS' },
  WARN: { color: '#f59e0b', Icon: AlertTriangle, label: 'WARN' },
  FAIL: { color: '#ef4444', Icon: XCircle, label: 'FAIL' },
};

const Row = ({ label, status, detail, raw }) => {
  const meta = STATUS_META[status] || STATUS_META.FAIL;
  const Icon = meta.Icon;
  return (
    <div
      className="flex items-start gap-3 py-3"
      style={{ borderTop: '1px solid var(--b)' }}
      data-testid={`email-health-row-${label.toLowerCase()}`}
    >
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: meta.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold" style={{ color: 'var(--t)' }}>{label}</span>
          <span
            className="text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: `${meta.color}1a`, color: meta.color, border: `1px solid ${meta.color}33` }}
          >
            {meta.label}
          </span>
        </div>
        <div className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>{detail}</div>
        {raw && (
          <code className="text-[11px] block mt-1 break-all" style={{ color: 'var(--t5)' }}>
            {raw}
          </code>
        )}
      </div>
    </div>
  );
};

export const EmailHealthCard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recheck, setRecheck] = useState(false);

  const load = async (force = false) => {
    const token = localStorage.getItem('carryon_token');
    if (!token) return;
    if (force) setRecheck(true);
    else setLoading(true);
    try {
      const r = await apiClient.get(`${API_URL}/admin/email-health${force ? '?force=true' : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data);
      if (force) toast.success(`Re-checked ${r.data.domain}: ${r.data.overall}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load email health');
    } finally {
      setLoading(false);
      setRecheck(false);
    }
  };

  useEffect(() => { load(false); }, []);

  if (loading) {
    return (
      <div
        className="rounded-xl p-6 flex items-center gap-3"
        style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
        data-testid="email-health-loading"
      >
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--gold)' }} />
        <span className="text-sm" style={{ color: 'var(--t3)' }}>Checking email DNS records…</span>
      </div>
    );
  }
  if (!data || data.error) {
    return (
      <div className="rounded-xl p-6" style={{ background: 'var(--card)', border: '1px solid var(--b)' }}>
        <div className="text-sm" style={{ color: 'var(--err, #ef4444)' }}>
          {data?.error || 'No data'}
        </div>
      </div>
    );
  }

  const overallMeta = STATUS_META[data.overall] || STATUS_META.FAIL;

  return (
    <div
      className="rounded-xl"
      style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
      data-testid="email-health-card"
    >
      <div className="p-5 flex items-start gap-3" style={{ borderBottom: '1px solid var(--b)' }}>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(var(--gold-rgb), 0.10)', border: '1px solid rgba(var(--gold-rgb), 0.25)' }}
        >
          <Mail className="w-5 h-5" style={{ color: 'var(--gold)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold" style={{ color: 'var(--t)' }}>Email Deliverability</h3>
            <span
              className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold"
              style={{
                background: `${overallMeta.color}1a`,
                color: overallMeta.color,
                border: `1px solid ${overallMeta.color}33`,
              }}
              data-testid="email-health-overall"
            >
              {overallMeta.label}
            </span>
          </div>
          <div className="text-xs" style={{ color: 'var(--t3)' }}>
            Sender domain: <code style={{ color: 'var(--gold)' }}>{data.domain}</code>
            {data.cached && data.cache_age_seconds != null && (
              <span style={{ color: 'var(--t5)' }}> · cached {data.cache_age_seconds}s ago</span>
            )}
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={recheck}
          className="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 btn-outline-cta"
          data-testid="email-health-recheck"
        >
          {recheck ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Re-check
        </button>
      </div>
      <div className="px-5 pb-2">
        <Row label="SPF" status={data.spf?.status} detail={data.spf?.detail} raw={data.spf?.raw} />
        <Row
          label={`DKIM (${data.dkim?.selector || 'resend'}._domainkey)`}
          status={data.dkim?.status}
          detail={data.dkim?.detail}
          raw={data.dkim?.raw}
        />
        <Row label="DMARC" status={data.dmarc?.status} detail={data.dmarc?.detail} raw={data.dmarc?.raw} />
      </div>
      <div className="px-5 pb-4 text-xs" style={{ color: 'var(--t5)' }}>
        Background scheduler re-checks daily and logs any regression. If
        any of the three rows above shows <strong>FAIL</strong>, your
        outbound mail will land in spam (or bounce) at major receivers.
      </div>
    </div>
  );
};

export default EmailHealthCard;
