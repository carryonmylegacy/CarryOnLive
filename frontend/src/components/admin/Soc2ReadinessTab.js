import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import {
  ShieldCheck, CheckCircle2, AlertTriangle, Loader2, RefreshCw, Server,
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from '../../utils/toast';

const CONTROL_LABELS = {
  REDACT_PII: 'PII redaction (REDACT_PII=1)',
  LOG_FORMAT: 'Structured logging (LOG_FORMAT=json)',
};

export const Soc2ReadinessTab = ({ getAuthHeaders }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API_URL}/admin/soc2-readiness`, getAuthHeaders());
      setReport(res.data);
    } catch (err) {
      toast.error('Could not load SOC2 readiness');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { load(); }, [load]);

  const ok = report?.ok;
  const violations = report?.violations || [];
  const controls = report?.required_controls || {};

  return (
    <div className="space-y-6" data-testid="soc2-readiness-tab">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck size={20} style={{ color: '#3B82F6' }} /> SOC2 Readiness
          </h2>
          <p className="text-sm text-white/60 mt-1">
            Live hard gate — pages when a required production control is inactive.
          </p>
        </div>
        <Button
          onClick={load}
          disabled={loading}
          variant="outline"
          className="border-white/15 text-white/80"
          data-testid="soc2-readiness-refresh"
        >
          {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : <RefreshCw size={16} className="mr-2" />}
          Refresh
        </Button>
      </div>

      {loading && !report ? (
        <div className="flex items-center justify-center py-16 text-white/50" data-testid="soc2-readiness-loading">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : report ? (
        <>
          {/* Overall status banner */}
          <Card
            data-testid="soc2-readiness-status"
            style={{
              background: ok ? 'rgba(34,201,147,0.08)' : 'rgba(240,82,82,0.08)',
              borderColor: ok ? 'rgba(34,201,147,0.3)' : 'rgba(240,82,82,0.3)',
            }}
          >
            <CardContent className="p-5 flex items-center gap-4">
              {ok
                ? <CheckCircle2 size={32} style={{ color: '#22C993' }} />
                : <AlertTriangle size={32} style={{ color: '#F05252' }} />}
              <div>
                <div className="text-base font-bold" style={{ color: ok ? '#22C993' : '#F05252' }}>
                  {ok ? 'All required controls active' : `${violations.length} control${violations.length === 1 ? '' : 's'} inactive`}
                </div>
                <div className="text-sm text-white/60 mt-0.5 flex items-center gap-1.5">
                  <Server size={13} />
                  Environment:{' '}
                  <span className="font-semibold text-white/80" data-testid="soc2-readiness-env">
                    {report.production ? 'production' : 'preview / dev (gate inert)'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Violations */}
          {violations.length > 0 && (
            <div className="space-y-2" data-testid="soc2-readiness-violations">
              {violations.map((v, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 p-3 rounded-lg text-sm text-white/85"
                  style={{ background: 'rgba(240,82,82,0.06)', border: '1px solid rgba(240,82,82,0.2)' }}
                  data-testid={`soc2-violation-${i}`}
                >
                  <AlertTriangle size={15} style={{ color: '#F05252', marginTop: 1, flexShrink: 0 }} />
                  <span>{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Required controls reference */}
          <Card className="bg-white/[0.02] border-white/10">
            <CardContent className="p-5">
              <div className="text-sm font-semibold text-white/70 mb-3">Required production controls</div>
              <ul className="space-y-1.5 text-sm text-white/70">
                {Object.entries(CONTROL_LABELS).map(([k, label]) => (
                  <li key={k} className="flex items-center gap-2">
                    <span className="text-white/40">•</span> {label}
                  </li>
                ))}
                <li className="flex items-center gap-2">
                  <span className="text-white/40">•</span>
                  Security middleware ({(controls.middleware || []).length} required)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-white/40">•</span>
                  Background schedulers: {(controls.schedulers || []).join(', ') || '—'}
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-white/40">•</span>
                  Staff session policies: {(controls.session_policy_roles || []).join(', ') || '—'}
                </li>
              </ul>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="text-center py-16 text-white/50" data-testid="soc2-readiness-error">
          Unable to load readiness report.
        </div>
      )}
    </div>
  );
};
