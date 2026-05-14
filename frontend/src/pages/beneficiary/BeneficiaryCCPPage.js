import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useBrand } from '../../contexts/AuthContext';
import { useLabelCleaner } from '../../utils/brandLabel';
import {
  Shield, ChevronLeft, MapPin, MessageSquare, Package, FileText,
  AlertTriangle, Loader2,
} from 'lucide-react';
import { API_URL } from '../../config';
import { saveList, readList } from '../../utils/localListCache';

const PLAN_TYPE_LABELS = {
  natural_disaster: 'Natural Disaster',
  national_emergency: 'National Emergency',
  medical_emergency: 'Medical Emergency',
  infrastructure_failure: 'Infrastructure Failure',
  custom: 'Custom Plan',
};

const BeneficiaryCCPPage = () => {
  const { getAuthHeaders } = useAuth();
  const brand = useBrand();
  const cleanLabel = useLabelCleaner();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);

  useEffect(() => {
    const fetchPlans = async () => {
      // Offline rescue — render the cached CCP plans so a beneficiary
      // can read every active contingency plan their benefactors built
      // even without a connection. The plans are pure JSON (steps,
      // checklists, rendezvous notes) so they fit easily in
      // localStorage; no binary blobs involved.
      const cacheKey = 'beneficiary:ccp_plans';
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const cached = readList(cacheKey);
        if (Array.isArray(cached)) setPlans(cached);
        setLoading(false);
        return;
      }
      try {
        const headers = getAuthHeaders()?.headers || {};
        const res = await fetch(`${API_URL}/ccp/my-plans`, { headers });
        if (res.ok) {
          const data = await res.json();
          setPlans(data);
          if (Array.isArray(data)) saveList(cacheKey, data);
        }
      } catch (err) {
        console.error('Failed to fetch CCP plans:', err);
        // Fall back to the cache on any network error.
        const cached = readList(cacheKey);
        if (Array.isArray(cached)) setPlans(cached);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 animate-fade-in flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold)' }} />
      </div>
    );
  }

  // Plan detail view
  if (selectedPlan) {
    return (
      <div className="p-4 lg:p-8 pt-4 lg:pt-8 pb-24 lg:pb-8 animate-fade-in max-w-2xl lg:max-w-5xl mx-auto" data-testid="ccp-plan-detail">
        <button
          onClick={() => setSelectedPlan(null)}
          className="flex items-center gap-1 text-sm font-semibold mb-5 px-3 py-1.5 rounded-lg transition-all"
          style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.35)', color: '#60A5FA' }}
          data-testid="ccp-detail-back"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Plans
        </button>

        {/* Plan Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.1)' }}>
            <Shield className="w-7 h-7" style={{ color: '#10B981' }} />
          </div>
          <h1 className="text-xl font-bold text-[var(--t)] mb-1" style={{ fontFamily: 'var(--sans)' }}>
            {selectedPlan.name}
          </h1>
          <p className="text-sm text-[var(--t4)]">
            {selectedPlan.estate_name} &middot; {PLAN_TYPE_LABELS[selectedPlan.plan_type] || selectedPlan.plan_type}
          </p>
          <p className="text-xs text-[var(--t5)] mt-1">Created by {selectedPlan.benefactor_name}</p>
        </div>

        <div className="space-y-4">
          {/* Rendezvous Points */}
          {selectedPlan.rendezvous_points?.length > 0 && (
            <div className="glass-card p-4" data-testid="ccp-detail-rendezvous">
              <h3 className="text-sm font-bold text-[var(--t)] mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[var(--gold)]" />
                Rendezvous Points
              </h3>
              <div className="space-y-2">
                {selectedPlan.rendezvous_points.map((rp, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                    <div className="font-semibold text-sm text-[var(--t)]">{rp.name || 'Unnamed Point'}</div>
                    {rp.address && <div className="text-xs text-[var(--t4)] mt-1">{rp.address}</div>}
                    {rp.notes && <div className="text-xs text-[var(--t5)] mt-1 italic">{rp.notes}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Communication Plan */}
          {selectedPlan.communication_plan && (
            <div className="glass-card p-4" data-testid="ccp-detail-communication">
              <h3 className="text-sm font-bold text-[var(--t)] mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[var(--gold)]" />
                Communication Plan
              </h3>
              <p className="text-sm text-[var(--t3)] leading-relaxed whitespace-pre-wrap">{selectedPlan.communication_plan}</p>
            </div>
          )}

          {/* Resource / Supply Locations */}
          {selectedPlan.resource_locations?.length > 0 && (
            <div className="glass-card p-4" data-testid="ccp-detail-resources">
              <h3 className="text-sm font-bold text-[var(--t)] mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-[var(--gold)]" />
                Resource / Supply Locations
              </h3>
              <div className="space-y-2">
                {selectedPlan.resource_locations.map((rl, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                    <div className="font-semibold text-sm text-[var(--t)]">{rl.name || 'Unnamed Resource'}</div>
                    {rl.location && <div className="text-xs text-[var(--t4)] mt-1">{rl.location}</div>}
                    {rl.notes && <div className="text-xs text-[var(--t5)] mt-1 italic">{rl.notes}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Instructions */}
          {selectedPlan.instructions && (
            <div className="glass-card p-4" data-testid="ccp-detail-instructions">
              <h3 className="text-sm font-bold text-[var(--t)] mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--gold)]" />
                Instructions
              </h3>
              <p className="text-sm text-[var(--t3)] leading-relaxed whitespace-pre-wrap">{selectedPlan.instructions}</p>
            </div>
          )}

          {/* Empty state if plan has no content */}
          {!selectedPlan.rendezvous_points?.length &&
           !selectedPlan.communication_plan &&
           !selectedPlan.resource_locations?.length &&
           !selectedPlan.instructions && (
            <div className="text-center py-8">
              <p className="text-sm text-[var(--t4)]">This plan has no details yet.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Plans list view
  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 lg:p-8 pt-4 lg:pt-8 pb-24 lg:pb-8 animate-fade-in" data-testid="beneficiary-ccp">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm font-semibold mb-5 px-3 py-1.5 rounded-lg transition-all"
        style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.35)', color: '#60A5FA' }}
        data-testid="ccp-back-btn"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
          style={{ background: 'rgba(16,185,129,0.1)' }}>
          <Shield className="w-7 h-7" style={{ color: '#10B981' }} />
        </div>
        <h1 className="text-2xl font-bold text-[var(--t)] mb-1" style={{ fontFamily: 'var(--sans)' }}>
          Emergency Plans
        </h1>
        <p className="text-sm text-[var(--t4)]">{brand} Contingency Protocols assigned to you</p>
      </div>

      {plans.length === 0 ? (
        <div className="glass-card p-8 text-center" data-testid="ccp-empty">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--t5)' }} />
          <h3 className="font-bold text-[var(--t)] mb-1">No Emergency Plans</h3>
          <p className="text-sm text-[var(--t4)]">
            None of your estate benefactors have created emergency plans that include you yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan)}
              className="w-full glass-card p-4 text-left transition-all hover:border-[var(--gold)]/30 active:scale-[0.98]"
              data-testid={`ccp-plan-${plan.id}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(16,185,129,0.1)' }}>
                  <Shield className="w-5 h-5" style={{ color: '#10B981' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[var(--t)] text-sm mb-0.5 truncate">{plan.name}</div>
                  <div className="text-xs text-[var(--t4)] mb-1">{plan.estate_name}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>
                      {PLAN_TYPE_LABELS[plan.plan_type] || plan.plan_type}
                    </span>
                    <span className="text-[11px] text-[var(--t5)]">by {plan.benefactor_name}</span>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-[var(--t5)] rotate-180 flex-shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default BeneficiaryCCPPage;
