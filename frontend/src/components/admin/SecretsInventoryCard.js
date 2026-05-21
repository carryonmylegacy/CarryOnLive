import React, { useState, useEffect } from 'react';
import apiClient from '../../utils/apiClient';
import { KeyRound, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
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
 */

const TIER_STYLE = {
  critical: { color: '#EF4444', label: 'CRITICAL' },
  high:     { color: '#F59E0B', label: 'HIGH' },
  low:      { color: '#3B82F6', label: 'LOW' },
};

export const SecretsInventoryCard = ({ getAuthHeaders }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[var(--t5)] tabular-nums" data-testid={`secret-length-${item.name}`}>
                    {item.present ? `${item.length} chars` : 'MISSING'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--t5)] italic mt-3" data-testid="secrets-inventory-disclaimer">
          Values are never exposed — only name, presence, and character length.
          Use this to confirm a Render env update landed after rotating a credential.
        </p>
      </CardContent>
    </Card>
  );
};

export default SecretsInventoryCard;
