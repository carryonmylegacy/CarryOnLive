import React, { useState, useEffect } from 'react';
import apiClient from '../../utils/apiClient';
import { KeyRound, Loader2, CheckCircle2, XCircle, RefreshCw, Activity, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

/**
 * SecretsInventoryCard
 * --------------------
 * Surfaces a REDACTED list of every backend secret env var (name + presence
 * + length only — never the value). Lets the founder confirm at a glance
 * that a Render env update actually landed after a credential rotation.
 *
 * Backend: GET /api/admin/secrets-inventory (admin-only).
 * Hard guarantee: the response NEVER includes secret values.
 *
 * For services with a live self-test (Mongo, Resend, Stripe, S3, Twilio,
 * xAI), a "Test" button hits POST /api/admin/secrets-self-test/{service}
 * to confirm the loaded key actually authenticates against the provider.
 * Read-only — no charges, no email sends, no SMS.
 */

const TIER_STYLE = {
  critical: { color: '#EF4444', label: 'CRITICAL' },
  high:     { color: '#F59E0B', label: 'HIGH' },
  low:      { color: '#3B82F6', label: 'LOW' },
};

/* Map env-var NAME → backend self-test service id. Anything not listed
   simply won't render a Test button (e.g. JWT_SECRET, ENCRYPTION_KEY,
   APPLE_SHARED_SECRET — no read-only endpoint exists to validate those
   without doing real work). Keep in sync with `_SELF_TESTS` in
   /app/backend/routes/admin/security_scan.py. */
const TESTABLE_BY_NAME = {
  MONGO_URL: 'mongo',
  RESEND_API_KEY: 'resend',
  STRIPE_API_KEY: 'stripe',
  AWS_ACCESS_KEY_ID: 'aws_s3',
  TWILIO_AUTH_TOKEN: 'twilio',
  XAI_API_KEY: 'xai',
};

export const SecretsInventoryCard = ({ getAuthHeaders }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // serviceId -> { running, ok, detail, error, latency_ms, tested_at }
  const [tests, setTests] = useState({});

  const fetchInventory = async (showRefresh) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await apiClient.get(`${API_URL}/admin/secrets-inventory`, getAuthHeaders());
      setData(res.data);
    } catch {
      toast.error('Failed to load secrets inventory');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const runSelfTest = async (serviceId, secretName) => {
    setTests((prev) => ({ ...prev, [serviceId]: { ...(prev[serviceId] || {}), running: true } }));
    try {
      const res = await apiClient.post(
        `${API_URL}/admin/secrets-self-test/${serviceId}`,
        {},
        getAuthHeaders(),
      );
      const r = res.data || {};
      setTests((prev) => ({ ...prev, [serviceId]: { ...r, running: false } }));
      if (r.ok) {
        toast.success(`${secretName} ✓ ${r.detail || 'ok'} (${r.latency_ms}ms)`);
      } else {
        toast.error(`${secretName} ✗ ${(r.error || 'failed').slice(0, 120)}`);
      }
    } catch (e) {
      setTests((prev) => ({
        ...prev,
        [serviceId]: { ok: false, error: e?.message || 'request failed', running: false },
      }));
      toast.error(`${secretName} self-test request failed`);
    }
  };

  useEffect(() => { fetchInventory(false); }, []); // eslint-disable-line

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--t4)]" />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const { counts, items } = data;
  const criticalMissing = counts.critical_missing || 0;
  const borderColor = criticalMissing > 0 ? '#EF4444' : counts.missing > 0 ? '#F59E0B' : '#22C55E';

  // Sort: tier (critical -> high -> low), then name alphabetical.
  const tierOrder = { critical: 0, high: 1, low: 2 };
  const sorted = [...items].sort((a, b) => {
    const t = (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9);
    return t !== 0 ? t : a.name.localeCompare(b.name);
  });

  return (
    <Card
      className="glass-card"
      style={{ borderLeft: `3px solid ${borderColor}` }}
      data-testid="secrets-inventory-card"
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-[var(--t)] flex items-center gap-2">
            <KeyRound className="w-4 h-4" style={{ color: borderColor }} />
            Secrets Inventory
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${borderColor}15`, color: borderColor }}
              data-testid="secrets-inventory-summary"
            >
              {counts.present}/{counts.total} loaded
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                // Test all in parallel for speed (5-6 calls, ~1s total).
                const tasks = Object.entries(TESTABLE_BY_NAME)
                  .filter(([name]) => (data?.items || []).some((it) => it.name === name && it.present))
                  .map(([name, sid]) => runSelfTest(sid, name));
                await Promise.all(tasks);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--s)] text-[var(--t4)] border border-[var(--b)] hover:text-[var(--t)] transition-colors"
              data-testid="secrets-test-all-btn"
              aria-label="Test all live connections"
              title="Run live read-only auth checks against every testable provider"
            >
              <Activity className="w-3.5 h-3.5" />
              Test all
            </button>
            <button
              onClick={() => fetchInventory(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--s)] text-[var(--t4)] border border-[var(--b)] hover:text-[var(--t)] transition-colors"
              data-testid="refresh-secrets-inventory-btn"
              aria-label="Refresh secrets inventory"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {criticalMissing > 0 && (
          <div
            className="mb-3 p-2 rounded-lg text-xs font-bold"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}
            data-testid="secrets-inventory-critical-banner"
          >
            ⚠ {criticalMissing} critical credential{criticalMissing === 1 ? ' is' : 's are'} missing — the app will not function until restored on Render.
          </div>
        )}
        <div className="space-y-1" data-testid="secrets-inventory-list">
          {sorted.map((item) => {
            const tier = TIER_STYLE[item.tier] || TIER_STYLE.low;
            const serviceId = TESTABLE_BY_NAME[item.name];
            const testState = serviceId ? tests[serviceId] : null;
            return (
              <div
                key={item.name}
                className="flex items-center justify-between gap-3 p-2 rounded text-xs"
                style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                data-testid={`secret-row-${item.name}`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {item.present
                    ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#22C55E' }} />
                    : <XCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#EF4444' }} />
                  }
                  <span className="font-mono font-bold text-[var(--t)] truncate" title={item.notes}>
                    {item.name}
                  </span>
                  <span
                    className="text-[11px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: `${tier.color}15`, color: tier.color }}
                  >
                    {tier.label}
                  </span>
                  {testState && !testState.running && (
                    <span
                      className="text-[11px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1"
                      style={{
                        background: testState.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                        color: testState.ok ? '#16A34A' : '#EF4444',
                      }}
                      title={testState.ok ? (testState.detail || 'ok') : (testState.error || 'failed')}
                      data-testid={`secret-test-result-${item.name}`}
                    >
                      {testState.ok
                        ? <><CheckCircle2 className="w-3 h-3" /> {testState.latency_ms}ms</>
                        : <><AlertCircle className="w-3 h-3" /> failed</>
                      }
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[var(--t5)] tabular-nums" data-testid={`secret-length-${item.name}`}>
                    {item.present ? `${item.length} chars` : 'MISSING'}
                  </span>
                  {serviceId && item.present && (
                    <button
                      onClick={() => runSelfTest(serviceId, item.name)}
                      disabled={testState?.running}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold bg-[var(--bg2)] text-[var(--t4)] border border-[var(--b)] hover:text-[var(--t)] hover:border-[var(--t4)] transition-colors disabled:opacity-50"
                      data-testid={`secret-test-btn-${item.name}`}
                      aria-label={`Test ${item.name} live connection`}
                      title="Run a live, read-only auth check against the provider"
                    >
                      {testState?.running
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Activity className="w-3 h-3" />
                      }
                      Test
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--t5)] italic mt-3" data-testid="secrets-inventory-disclaimer">
          Values are never exposed — only name, presence, and character length.
          Use this to confirm a Render env update landed after rotating a credential.
          The "Test" buttons run read-only auth checks against each provider (no
          charges, email sends, or SMS).
        </p>
      </CardContent>
    </Card>
  );
};

export default SecretsInventoryCard;
