import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../utils/apiClient';
import { Sliders, Globe, Loader2, AlertTriangle, Check, Shield } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

const TIER_LABELS = {
  premium: 'Premium',
  standard: 'Standard',
  base: 'Base',
  new_adult: 'N. Adult',
  military: 'Military',
  hospice: 'Hospice',
  veteran: 'Veteran',
  enterprise: 'Enterpr.',
  free_mode: 'Free Mode',
};

const TIER_COLORS = {
  premium: '#d4af37',
  standard: '#60A5FA',
  base: '#22C993',
  new_adult: '#B794F6',
  military: '#F59E0B',
  hospice: '#ec4899',
  veteran: '#F59E0B',
  enterprise: '#8B5CF6',
  free_mode: '#4ADE80',
};

export const FeatureGatesCard = ({ getAuthHeaders }) => {
  const [features, setFeatures] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [gates, setGates] = useState({});
  const [savedGates, setSavedGates] = useState({});
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const headers = getAuthHeaders()?.headers || {};

  const fetchGates = useCallback(async () => {
    try {
      const res = await apiClient.get(`${API_URL}/admin/feature-gates`, { headers });
      setFeatures(res.data.features || []);
      setTiers(res.data.tiers || []);
      setGates(JSON.parse(JSON.stringify(res.data.gates || {})));
      setSavedGates(JSON.parse(JSON.stringify(res.data.gates || {})));
      setHasChanges(false);
    } catch (_err) {
      toast.error('Failed to load feature gates');
    }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchGates(); }, [fetchGates]);

  // Track changes
  useEffect(() => {
    setHasChanges(JSON.stringify(gates) !== JSON.stringify(savedGates));
  }, [gates, savedGates]);

  const toggleFeatureTier = (featureKey, tierId) => {
    setGates(prev => ({
      ...prev,
      [featureKey]: {
        ...prev[featureKey],
        [tierId]: !prev[featureKey]?.[tierId],
      },
    }));
  };

  const toggleGlobal = (featureKey) => {
    const allOn = tiers.every(t => gates[featureKey]?.[t]);
    setGates(prev => ({
      ...prev,
      [featureKey]: Object.fromEntries(tiers.map(t => [t, !allOn])),
    }));
  };

  const handlePublish = async () => {
    if (!window.confirm(
      'Publish feature gate changes?\n\nThis will immediately affect which features are visible to users based on their subscription tier.'
    )) return;

    setPublishing(true);
    try {
      await apiClient.put(
        `${API_URL}/admin/feature-gates`,
        { gates },
        { headers: { ...headers, 'Content-Type': 'application/json' } }
      );
      setSavedGates(JSON.parse(JSON.stringify(gates)));
      setHasChanges(false);
      toast.success('Feature gates published');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to publish');
    }
    setPublishing(false);
  };

  const handleDiscard = () => {
    setGates(JSON.parse(JSON.stringify(savedGates)));
    setHasChanges(false);
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-5 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" />
        </CardContent>
      </Card>
    );
  }

  const isGlobalOn = (featureKey) => tiers.every(t => gates[featureKey]?.[t]);
  const isGlobalOff = (featureKey) => tiers.every(t => !gates[featureKey]?.[t]);
  const isGlobalMixed = (featureKey) => !isGlobalOn(featureKey) && !isGlobalOff(featureKey);

  // Count disabled features across all tiers
  const totalDisabled = features.reduce((acc, f) => {
    return acc + tiers.filter(t => !gates[f.key]?.[t]).length;
  }, 0);

  return (
    <Card className="glass-card" data-testid="feature-gates-card">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[var(--gold)]" />
            Feature Gates
          </h3>
          {totalDisabled > 0 && (
            <span className="text-xs px-2 py-1 rounded-lg font-bold"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
              {totalDisabled} gated
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--t5)] mb-4">
          Control which platform features are visible per subscription tier. Toggling a feature OFF
          hides it from navigation, dashboard, and blocks API access for users on that tier.
        </p>

        {/* Free Mode column explainer */}
        <div
          className="mb-4 p-3 rounded-xl flex items-start gap-2.5"
          style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)' }}
          data-testid="feature-gates-free-mode-note"
        >
          <span
            className="mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: '#4ADE80', boxShadow: '0 0 8px rgba(74,222,128,0.7)' }}
          />
          <p className="text-xs text-[var(--t4)]">
            The <span className="font-bold" style={{ color: '#4ADE80' }}>Free Mode</span> column is
            the source of truth when the platform-wide <span className="font-semibold">Free</span> toggle
            is ON: every (non-partner) user receives exactly the features enabled here, regardless of their
            normal tier. B2B partner members instead follow their own <span className="font-semibold">Free tier</span> in
            the Partners tab.
          </p>
        </div>

        {/* Matrix table */}
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm" style={{ minWidth: 680 }} data-testid="feature-gates-matrix">
            <thead>
              <tr>
                <th className="text-left py-2 px-2 text-xs font-bold text-[var(--t4)] uppercase tracking-wider" style={{ minWidth: 180 }}>
                  Feature
                </th>
                <th className="text-center py-2 px-1 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--t4)', minWidth: 56 }}>
                  <div className="flex flex-col items-center gap-0.5">
                    <Globe className="w-3.5 h-3.5" />
                    <span>All</span>
                  </div>
                </th>
                {tiers.map(tid => (
                  <th key={tid} className="text-center py-2 px-1 text-xs font-bold uppercase tracking-wider" style={{ minWidth: 56 }}>
                    <span style={{ color: TIER_COLORS[tid] || 'var(--t4)' }}>
                      {TIER_LABELS[tid] || tid}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((f, idx) => {
                const globalOn = isGlobalOn(f.key);
                const globalMixed = isGlobalMixed(f.key);
                return (
                  <tr key={f.key}
                    className="transition-colors"
                    style={{
                      background: idx % 2 === 0 ? 'transparent' : 'var(--s)',
                      borderRadius: 8,
                    }}
                    data-testid={`feature-gate-row-${f.key}`}
                  >
                    {/* Feature name + core badge */}
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--t)] text-sm">{f.label}</span>
                        {f.core && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5"
                            style={{ background: 'rgba(34,201,147,0.12)', color: '#22C993' }}
                            title="Core feature — defaults to ON for all tiers">
                            <Shield className="w-2.5 h-2.5" />
                            CORE
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Global toggle */}
                    <td className="text-center py-2.5 px-1">
                      <div className="flex justify-center">
                        <button
                          onClick={() => toggleGlobal(f.key)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                          style={{
                            background: globalOn
                              ? 'rgba(34,201,147,0.15)'
                              : globalMixed
                                ? 'rgba(245,158,11,0.15)'
                                : 'rgba(239,68,68,0.1)',
                            border: `1px solid ${globalOn
                              ? 'rgba(34,201,147,0.3)'
                              : globalMixed
                                ? 'rgba(245,158,11,0.3)'
                                : 'rgba(239,68,68,0.2)'}`,
                          }}
                          data-testid={`global-toggle-${f.key}`}
                          title={globalOn ? 'All tiers ON — click to turn all OFF' : globalMixed ? 'Mixed — click to turn all ON' : 'All tiers OFF — click to turn all ON'}
                        >
                          {globalOn ? (
                            <Check className="w-4 h-4" style={{ color: '#22C993' }} />
                          ) : globalMixed ? (
                            <div className="w-2 h-2 rounded-sm" style={{ background: '#F59E0B' }} />
                          ) : (
                            <div className="w-4 h-0.5 rounded" style={{ background: '#EF4444' }} />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Per-tier toggles */}
                    {tiers.map(tid => (
                      <td key={tid} className="text-center py-2.5 px-1">
                        <div className="flex justify-center">
                          <Switch
                            checked={gates[f.key]?.[tid] ?? true}
                            onCheckedChange={() => toggleFeatureTier(f.key, tid)}
                            data-testid={`gate-${f.key}-${tid}`}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Warning banner when changes exist */}
        {hasChanges && (
          <div className="mt-4 p-3 rounded-xl flex items-start gap-3"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
            data-testid="feature-gates-unsaved-banner"
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#F59E0B' }} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: '#F59E0B' }}>Unpublished changes</p>
              <p className="text-xs text-[var(--t4)] mt-0.5">
                Changes will not take effect until you publish. Users will continue to see the previous configuration.
              </p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3 mt-4">
          {hasChanges && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-[var(--b)] text-[var(--t4)]"
              onClick={handleDiscard}
              data-testid="feature-gates-discard-btn"
            >
              Discard
            </Button>
          )}
          <Button
            size="sm"
            className="gold-button text-xs"
            onClick={handlePublish}
            disabled={!hasChanges || publishing}
            data-testid="feature-gates-publish-btn"
          >
            {publishing ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                Publishing...
              </>
            ) : (
              'Save & Publish'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
