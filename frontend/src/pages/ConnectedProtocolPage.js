import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import { formatPhoneUS } from '../utils/phoneFormat';
import CCPPlanEditor from '../components/ccp/CCPPlanEditor';
import CCPActiveView from '../components/ccp/CCPActiveView';
import {
  Shield,
  AlertTriangle,
  Plus,
  MapPin,
  Phone,
  FileText,
  Users,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Play,
  Square,
  Clock,
  Radio,
  Navigation,
  Home,
  HelpCircle,
  UserCheck,
  Zap,
  Edit,
  Trash2,
  Download,
  Printer,
} from 'lucide-react';
import { platformDownload } from '../utils/downloadFile';

const STATUS_CONFIG = {
  safe: { label: 'SAFE', color: '#22C993', bg: 'rgba(34,201,147,0.15)', border: 'rgba(34,201,147,0.4)', icon: Check },
  evacuating: { label: 'EVACUATING', color: '#F5A623', bg: 'rgba(245,166,35,0.15)', border: 'rgba(245,166,35,0.4)', icon: Navigation },
  at_rendezvous: { label: 'AT RENDEZVOUS', color: '#3B7BF7', bg: 'rgba(59,123,247,0.15)', border: 'rgba(59,123,247,0.4)', icon: MapPin },
  need_help: { label: 'NEED HELP', color: '#F05252', bg: 'rgba(240,82,82,0.15)', border: 'rgba(240,82,82,0.4)', icon: HelpCircle },
  sheltering: { label: 'SHELTERING', color: '#B794F6', bg: 'rgba(183,148,246,0.15)', border: 'rgba(183,148,246,0.4)', icon: Home },
  other: { label: 'OTHER', color: 'var(--t4)', bg: 'rgba(160,170,191,0.15)', border: 'rgba(160,170,191,0.4)', icon: Radio },
  not_checked_in: { label: 'NOT CHECKED IN', color: 'var(--t5)', bg: 'rgba(82,92,114,0.1)', border: 'rgba(82,92,114,0.3)', icon: Clock },
};

const PLAN_TYPE_LABELS = {
  natural_disaster: 'Natural Disaster',
  national_emergency: 'National Emergency',
  medical_emergency: 'Medical Emergency',
  infrastructure_failure: 'Infrastructure Failure',
  custom: 'Custom Plan',
};

const CCP_POLL_INTERVAL = 5000;

export default function ConnectedProtocolPage() {
  const { user } = useAuth();
  const token = localStorage.getItem('carryon_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const estateId = localStorage.getItem('selected_estate_id');

  const [view, setView] = useState('home'); // home, plans, plan-edit, active, checkin, history
  const [plans, setPlans] = useState([]);
  const [activeEmergency, setActiveEmergency] = useState(null);
  const [statusBoard, setStatusBoard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editPlan, setEditPlan] = useState(null);
  const [history, setHistory] = useState([]);
  const [checkinStatus, setCheckinStatus] = useState('');
  const [checkinNote, setCheckinNote] = useState('');
  const [checkinLocation, setCheckinLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [linkedResources, setLinkedResources] = useState({ documents: [], ffn_contacts: [], dav_entries: [] });
  const [availableResources, setAvailableResources] = useState({ documents: [], ffn_contacts: [], dav_entries: [] });
  const [estateMembers, setEstateMembers] = useState([]);
  // First-visit welcome intro
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('carryon_ccp_intro_seen'));
  const [welcomeStep, setWelcomeStep] = useState(1);

  const isBenefactor = user?.role === 'benefactor' || user?.is_also_benefactor;

  const fetchPlans = useCallback(async () => {
    if (!estateId) return;
    try {
      const res = await fetch(`${API_URL}/ccp/plans/${estateId}`, { headers });
      if (res.ok) setPlans(await res.json());
    } catch {}
  }, [estateId]);

  const fetchActive = useCallback(async () => {
    if (!estateId) return;
    try {
      const res = await fetch(`${API_URL}/ccp/active/${estateId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.active) {
          setActiveEmergency(data.activation);
          setStatusBoard(data.status_board || []);
        } else {
          setActiveEmergency(null);
          setStatusBoard([]);
        }
      }
    } catch {}
  }, [estateId]);

  const fetchLinkedResources = useCallback(async () => {
    if (!estateId) return;
    try {
      const res = await fetch(`${API_URL}/ccp/active/${estateId}/linked-resources`, { headers });
      if (res.ok) setLinkedResources(await res.json());
    } catch {}
  }, [estateId]);

  const fetchAvailableResources = useCallback(async () => {
    if (!estateId) return;
    try {
      const [docsRes, ffnRes, davRes, membersRes] = await Promise.all([
        fetch(`${API_URL}/documents/${estateId}`, { headers }),
        fetch(`${API_URL}/ffn/${estateId}`, { headers }),
        fetch(`${API_URL}/digital-wallet/${estateId}`, { headers }),
        fetch(`${API_URL}/ccp/members/${estateId}`, { headers }),
      ]);
      const docs = docsRes.ok ? await docsRes.json() : [];
      const ffn = ffnRes.ok ? await ffnRes.json() : [];
      const dav = davRes.ok ? await davRes.json() : [];
      const members = membersRes.ok ? await membersRes.json() : [];
      setAvailableResources({ documents: Array.isArray(docs) ? docs : docs.documents || [], ffn_contacts: ffn, dav_entries: dav });
      setEstateMembers(members);
    } catch {}
  }, [estateId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchPlans(), fetchActive()]);
      setLoading(false);
    })();
  }, []);

  // Poll when emergency is active
  useEffect(() => {
    if (!activeEmergency) return;
    const interval = setInterval(fetchActive, CCP_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [activeEmergency?.id]);

  // Auto-navigate to active emergency on load
  useEffect(() => {
    if (!loading && activeEmergency && view === 'home') {
      setView('active');
      fetchLinkedResources();
    }
  }, [loading, activeEmergency]);

  const activatePlan = async (planId, isDrill = false) => {
    const label = isDrill ? 'drill' : 'EMERGENCY';
    if (!isDrill && !window.confirm(`ACTIVATE EMERGENCY PROTOCOL?\n\nAll estate members will be notified immediately.`)) return;
    if (isDrill && !window.confirm(`Start a DRILL for this plan?\n\nMembers will see it marked as a drill.`)) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/ccp/activate`, {
        method: 'POST', headers, body: JSON.stringify({ plan_id: planId, is_drill: isDrill }),
      });
      if (res.ok) {
        await fetchActive();
        await fetchLinkedResources();
        setView('active');
      } else {
        const err = await res.json();
        alert(err.detail || 'Activation failed');
      }
    } catch {} finally { setSubmitting(false); }
  };

  const deactivate = async () => {
    if (!activeEmergency) return;
    if (!window.confirm('Deactivate this emergency? A summary report will be generated.')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/ccp/deactivate/${activeEmergency.id}`, {
        method: 'POST', headers, body: JSON.stringify({ notes: '' }),
      });
      if (res.ok) {
        setActiveEmergency(null);
        setStatusBoard([]);
        setView('home');
        await fetchPlans();
      }
    } catch {} finally { setSubmitting(false); }
  };

  const submitCheckin = async () => {
    if (!checkinStatus || !activeEmergency) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/ccp/checkin`, {
        method: 'POST', headers,
        body: JSON.stringify({
          activation_id: activeEmergency.id,
          status: checkinStatus,
          status_note: checkinNote,
          location_description: checkinLocation,
        }),
      });
      if (res.ok) {
        setCheckinStatus('');
        setCheckinNote('');
        setCheckinLocation('');
        await fetchActive();
        setView('active');
      }
    } catch {} finally { setSubmitting(false); }
  };

  const savePlan = async () => {
    if (!editPlan || !editPlan.name?.trim()) return;
    setSubmitting(true);
    try {
      const isNew = !editPlan.id;
      const url = isNew ? `${API_URL}/ccp/plans` : `${API_URL}/ccp/plans/${editPlan.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const body = isNew
        ? { estate_id: estateId, ...editPlan }
        : editPlan;
      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      if (res.ok) {
        setEditPlan(null);
        setView('plans');
        await fetchPlans();
      }
    } catch {} finally { setSubmitting(false); }
  };

  const deletePlan = async (planId) => {
    if (!window.confirm('Delete this emergency plan?')) return;
    try {
      await fetch(`${API_URL}/ccp/plans/${planId}`, { method: 'DELETE', headers });
      await fetchPlans();
    } catch {}
  };

  const downloadPlan = async (plan) => {
    try {
      const safeName = (plan.name || 'plan').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'plan';
      await platformDownload({
        action: 'ccp_plan',
        params: { plan_id: plan.id },
        filename: `CCP_${safeName}.pdf`,
        onFallback: async () => {
          const token = localStorage.getItem('carryon_token');
          // Use the download proxy even on desktop for simplicity
          const res = await fetch(`${API_URL}/downloads/prepare`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ccp_plan', params: { plan_id: plan.id }, filename: `CCP_${safeName}.pdf` }),
          });
          if (!res.ok) throw new Error('Failed to prepare download');
          const data = await res.json();
          window.location.href = `${API_URL}/downloads/${data.token}`;
        },
      });
    } catch {
      alert('Failed to download plan');
    }
  };

  const fetchHistory = async () => {
    if (!estateId) return;
    try {
      const res = await fetch(`${API_URL}/ccp/history/${estateId}`, { headers });
      if (res.ok) setHistory(await res.json());
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#d4af37' }} />
      </div>
    );
  }

  if (!estateId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <div className="text-center">
          <Shield className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--t5)' }} />
          <p className="text-base font-semibold" style={{ color: 'var(--t4)' }}>No estate selected</p>
          <p className="text-sm mt-1" style={{ color: 'var(--t5)' }}>Open your dashboard first to connect to your estate.</p>
        </div>
      </div>
    );
  }

  // ===================== ACTIVE EMERGENCY VIEW =====================
  if (view === 'active' && activeEmergency) {
    return (
      <CCPActiveView
        activeEmergency={activeEmergency}
        setView={setView}
        statusBoard={statusBoard}
        STATUS_CONFIG={STATUS_CONFIG}
        isBenefactor={isBenefactor}
        deactivate={deactivate}
        submitting={submitting}
        linkedResources={linkedResources}
      />
    );
  }

  // ===================== CHECK-IN VIEW =====================
  if (view === 'checkin' && activeEmergency) {
    return (
      <div data-testid="ccp-checkin-view" className="max-w-lg mx-auto px-4 py-6 pb-28 sm:pb-6 space-y-4">
        <button onClick={() => setView('active')} className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--t4)' }}>
          <ArrowLeft className="w-4 h-4" />Back to Status Board
        </button>
        <h2 className="text-xl font-bold text-center" style={{ color: 'var(--t)' }}>How are you?</h2>
        <p className="text-sm text-center" style={{ color: 'var(--t4)' }}>Tap your current status</p>

        {/* Big Status Buttons */}
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'not_checked_in').map(([key, cfg]) => {
            const Icon = cfg.icon;
            const selected = checkinStatus === key;
            return (
              <button
                key={key}
                onClick={() => setCheckinStatus(key)}
                className="flex flex-col items-center justify-center py-5 px-3 rounded-2xl transition-all active:scale-[0.95]"
                data-testid={`ccp-status-btn-${key}`}
                style={{
                  background: selected ? cfg.bg : 'rgba(255,255,255,0.03)',
                  border: `2px solid ${selected ? cfg.border : 'rgba(255,255,255,0.06)'}`,
                  minHeight: 100,
                }}
              >
                <Icon className="w-8 h-8 mb-2" style={{ color: cfg.color }} />
                <span className="text-sm font-bold" style={{ color: selected ? cfg.color : 'var(--t4)' }}>{cfg.label}</span>
              </button>
            );
          })}
        </div>

        {/* Optional note and location */}
        {checkinStatus && (
          <div className="space-y-3 mt-4">
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--t4)' }}>Status Note (optional)</label>
              <input
                value={checkinNote}
                onChange={(e) => setCheckinNote(e.target.value)}
                placeholder="e.g., Phone battery at 20%"
                className="w-full rounded-xl px-3 py-3 text-base"
                data-testid="ccp-checkin-note"
                style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }}
              />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--t4)' }}>Current Location (optional)</label>
              <input
                value={checkinLocation}
                onChange={(e) => setCheckinLocation(e.target.value)}
                placeholder="e.g., Holiday Inn, Dallas TX"
                className="w-full rounded-xl px-3 py-3 text-base"
                data-testid="ccp-checkin-location"
                style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }}
              />
            </div>
            <button
              onClick={submitCheckin}
              disabled={submitting}
              className="w-full py-5 rounded-2xl text-lg font-bold transition-all active:scale-[0.97]"
              data-testid="ccp-submit-checkin"
              style={{
                background: 'linear-gradient(135deg, #d4af37, #F0C95C)',
                color: '#080e1a',
                minHeight: 64,
              }}
            >
              {submitting ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'SUBMIT CHECK-IN'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ===================== PLAN EDITOR VIEW =====================
  if (view === 'plan-edit' && editPlan) {
    return (
      <CCPPlanEditor
        editPlan={editPlan}
        setEditPlan={setEditPlan}
        setView={setView}
        savePlan={savePlan}
        submitting={submitting}
        PLAN_TYPE_LABELS={PLAN_TYPE_LABELS}
        estateMembers={estateMembers}
        availableResources={availableResources}
      />
    );
  }

  // ===================== PLANS LIST VIEW =====================
  if (view === 'plans') {
    return (
      <div data-testid="ccp-plans-list" className="max-w-2xl mx-auto px-4 py-6 pb-28 sm:pb-6 space-y-4">
        <button onClick={() => setView('home')} className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--t4)' }}>
          <ArrowLeft className="w-4 h-4" />Back
        </button>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: 'var(--t)', fontFamily: 'Outfit, sans-serif' }}>Emergency Plans</h2>
          {isBenefactor && (
            <button onClick={() => { setEditPlan({ name: '', plan_type: 'custom', rendezvous_points: [], communication_plan: '', resource_locations: [], instructions: '', linked_document_ids: [], linked_ffn_contact_ids: [], linked_dav_entry_ids: [], assigned_beneficiary_ids: null }); fetchAvailableResources(); setView('plan-edit'); }}
              className="w-10 h-10 rounded-full flex items-center justify-center" data-testid="ccp-new-plan-btn"
              style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)' }}>
              <Plus className="w-5 h-5" style={{ color: '#080e1a' }} />
            </button>
          )}
        </div>
        {plans.length === 0 && (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--t5)' }} />
            <p className="text-sm" style={{ color: 'var(--t4)' }}>No plans created yet</p>
          </div>
        )}
        {plans.map(p => (
          <div key={p.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--t)' }}>{p.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,123,247,0.1)', color: '#3B7BF7' }}>{PLAN_TYPE_LABELS[p.plan_type] || p.plan_type}</span>
              </div>
              {isBenefactor && (
                <div className="flex gap-1.5">
                  <button onClick={() => downloadPlan(p)} className="w-8 h-8 rounded-lg flex items-center justify-center" data-testid={`ccp-print-${p.id}`}
                    title="Download / Print"
                    style={{ background: 'rgba(34,201,147,0.1)' }}><Printer className="w-4 h-4" style={{ color: '#22C993' }} /></button>
                  <button onClick={() => { setEditPlan(p); fetchAvailableResources(); setView('plan-edit'); }} className="w-8 h-8 rounded-lg flex items-center justify-center" data-testid={`ccp-edit-${p.id}`}
                    style={{ background: 'rgba(255,255,255,0.05)' }}><Edit className="w-4 h-4" style={{ color: 'var(--t4)' }} /></button>
                  <button onClick={() => deletePlan(p.id)} className="w-8 h-8 rounded-lg flex items-center justify-center" data-testid={`ccp-delete-${p.id}`}
                    style={{ background: 'rgba(240,82,82,0.1)' }}><Trash2 className="w-4 h-4" style={{ color: '#F05252' }} /></button>
                </div>
              )}
              {!isBenefactor && (
                <button onClick={() => downloadPlan(p)} className="w-8 h-8 rounded-lg flex items-center justify-center" data-testid={`ccp-print-${p.id}`}
                  title="Download / Print"
                  style={{ background: 'rgba(34,201,147,0.1)' }}><Printer className="w-4 h-4" style={{ color: '#22C993' }} /></button>
              )}
            </div>
            {/* Action buttons */}
            {isBenefactor && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => activatePlan(p.id, false)} disabled={submitting}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                  data-testid={`ccp-activate-${p.id}`}
                  style={{ background: 'rgba(240,82,82,0.15)', border: '1px solid rgba(240,82,82,0.3)', color: '#F05252' }}>
                  <Zap className="w-4 h-4 inline mr-1" />ACTIVATE
                </button>
                <button onClick={() => activatePlan(p.id, true)} disabled={submitting}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                  data-testid={`ccp-drill-${p.id}`}
                  style={{ background: 'rgba(59,123,247,0.15)', border: '1px solid rgba(59,123,247,0.3)', color: '#3B7BF7' }}>
                  <Play className="w-4 h-4 inline mr-1" />DRILL
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ===================== HISTORY VIEW =====================
  if (view === 'history') {
    return (
      <div data-testid="ccp-history" className="max-w-2xl mx-auto px-4 py-6 pb-28 sm:pb-6 space-y-4">
        <button onClick={() => setView('home')} className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--t4)' }}>
          <ArrowLeft className="w-4 h-4" />Back
        </button>
        <h2 className="text-lg font-bold" style={{ color: 'var(--t)' }}>Past Activations</h2>
        {history.length === 0 && (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--t5)' }} />
            <p className="text-sm" style={{ color: 'var(--t4)' }}>No past activations</p>
          </div>
        )}
        {history.map(h => (
          <div key={h.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 mb-1">
              {h.is_drill && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,123,247,0.15)', color: '#3B7BF7' }}>DRILL</span>}
              <span className="text-sm font-bold" style={{ color: 'var(--t)' }}>{h.plan_name}</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--t4)' }}>
              {new Date(h.activated_at).toLocaleDateString()} — {h.status === 'resolved' ? 'Resolved' : h.status}
            </p>
          </div>
        ))}
      </div>
    );
  }

  // ===================== HOME VIEW — Big Bubble Buttons =====================
  return (
    <>
    <div data-testid="ccp-home" className="max-w-lg mx-auto px-4 py-6 pb-28 sm:pb-6 space-y-4">
      <div className="text-center mb-4">
        <Shield className="w-10 h-10 mx-auto mb-2" style={{ color: '#d4af37' }} />
        <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--t)', fontFamily: 'Outfit, sans-serif' }}>Contingency Protocols</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--t4)' }}>Family disaster preparedness</p>
      </div>

      {/* Emergency Alert Banner */}
      {activeEmergency && (
        <button onClick={() => setView('active')}
          className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97] flex items-center gap-3 px-5 animate-pulse"
          data-testid="ccp-active-alert"
          style={{ background: activeEmergency.is_drill ? 'rgba(59,123,247,0.12)' : 'rgba(240,82,82,0.12)', border: `1px solid ${activeEmergency.is_drill ? 'rgba(59,123,247,0.3)' : 'rgba(240,82,82,0.3)'}`, color: activeEmergency.is_drill ? '#3B7BF7' : '#F05252' }}>
          <AlertTriangle className="w-6 h-6 flex-shrink-0" />
          <span className="flex-1 text-left" style={{ fontFamily: 'Outfit, sans-serif' }}>{activeEmergency.is_drill ? 'Drill Active' : 'Emergency Active'} — Tap to View</span>
          <ChevronRight className="w-5 h-5 flex-shrink-0" />
        </button>
      )}

      {/* Big Navigation Buttons */}
      <button onClick={() => setView('plans')}
        className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97] flex items-center gap-3 px-5"
        data-testid="ccp-plans-btn"
        style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#d4af37' }}>
        <FileText className="w-6 h-6 flex-shrink-0" />
        <div className="text-left flex-1">
          <div style={{ fontFamily: 'Outfit, sans-serif' }}>Emergency Plans</div>
          <div className="text-xs font-normal" style={{ color: 'var(--t4)' }}>{plans.length} plan{plans.length !== 1 ? 's' : ''} created</div>
        </div>
        <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--t4)' }} />
      </button>

      <button onClick={() => { fetchHistory(); setView('history'); }}
        className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97] flex items-center gap-3 px-5"
        data-testid="ccp-history-btn"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--b)', color: 'var(--t4)' }}>
        <Clock className="w-6 h-6 flex-shrink-0" />
        <span className="flex-1 text-left" style={{ fontFamily: 'Outfit, sans-serif' }}>Past Activations</span>
        <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--t4)' }} />
      </button>
    </div>

    {/* ===== CCP First-Visit Welcome Walkthrough ===== */}
    {showWelcome && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto" data-testid="ccp-welcome-overlay"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)', padding: '16px', paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--bg2)', border: '1px solid rgba(212,175,55,0.3)', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-3 mb-5">
            {[1, 2, 3].map(s => (
              <div key={s} className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                welcomeStep === s ? 'bg-[#d4af37] scale-125' : welcomeStep > s ? 'bg-[#22C993]' : 'bg-white/10'
              }`} />
            ))}
          </div>

          {/* Step 1: What is CCP? */}
          {welcomeStep === 1 && (
            <div className="text-center" data-testid="ccp-welcome-step-1">
              <Shield className="w-14 h-14 mx-auto mb-4" style={{ color: '#d4af37' }} />
              <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--t)', fontFamily: 'Outfit, sans-serif' }}>
                Welcome to Contingency Protocols
              </h2>
              <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--t4)' }}>
                This is where your family creates emergency plans — for hurricanes, medical emergencies, power outages, or any situation where everyone needs to know what to do.
              </p>
              <div className="space-y-2.5 mb-6 text-left">
                {[
                  { icon: FileText, title: 'Create Emergency Plans', desc: 'Set up rendezvous points, communication steps, and supply locations.' },
                  { icon: UserCheck, title: 'Check In During Emergencies', desc: 'Everyone marks themselves safe so the family knows who needs help.' },
                  { icon: Play, title: 'Practice with Drills', desc: 'Run practice drills so everyone knows what to do before a real emergency.' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--b)' }}>
                    <item.icon className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#d4af37' }} />
                    <div>
                      <div className="text-sm font-bold" style={{ color: 'var(--t)' }}>{item.title}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setWelcomeStep(2)}
                className="w-full py-3.5 rounded-xl text-base font-bold transition-all active:scale-[0.97]"
                data-testid="ccp-welcome-next-1"
                style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}>
                Next — How to Create a Plan <ArrowRight className="w-5 h-5 inline ml-1" />
              </button>
            </div>
          )}

          {/* Step 2: How to create a plan */}
          {welcomeStep === 2 && (
            <div className="text-center" data-testid="ccp-welcome-step-2">
              <FileText className="w-14 h-14 mx-auto mb-4" style={{ color: '#d4af37' }} />
              <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--t)', fontFamily: 'Outfit, sans-serif' }}>
                Creating Your First Plan
              </h2>
              <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--t4)' }}>
                It only takes a few minutes. Here's what you'll do:
              </p>
              <div className="space-y-3 mb-6 text-left">
                {[
                  { num: '1', title: 'Give it a name', desc: 'Something like "Hurricane Plan" or "Fire Evacuation"' },
                  { num: '2', title: 'Add meeting points', desc: 'Where should the family meet? (e.g., Grandma\'s house, the park)' },
                  { num: '3', title: 'Write a communication plan', desc: 'How will everyone stay in touch? (e.g., text first, then call)' },
                  { num: '4', title: 'Add instructions', desc: 'Any special steps like grabbing the go-bag or turning off the gas' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--b)' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>
                      {item.num}
                    </div>
                    <div>
                      <div className="text-sm font-bold" style={{ color: 'var(--t)' }}>{item.title}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setWelcomeStep(1)}
                  className="px-5 py-3.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                  data-testid="ccp-welcome-back-2"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}>
                  <ArrowLeft className="w-4 h-4 inline mr-1" /> Back
                </button>
                <button onClick={() => setWelcomeStep(3)}
                  className="flex-1 py-3.5 rounded-xl text-base font-bold transition-all active:scale-[0.97]"
                  data-testid="ccp-welcome-next-2"
                  style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}>
                  Next — During Emergencies <ArrowRight className="w-5 h-5 inline ml-1" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: During an emergency */}
          {welcomeStep === 3 && (
            <div className="text-center" data-testid="ccp-welcome-step-3">
              <AlertTriangle className="w-14 h-14 mx-auto mb-4" style={{ color: '#F05252' }} />
              <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--t)', fontFamily: 'Outfit, sans-serif' }}>
                When an Emergency Happens
              </h2>
              <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--t4)' }}>
                When something happens, the estate owner activates the plan. Then everyone in the family does this:
              </p>
              <div className="space-y-3 mb-6 text-left">
                {[
                  { icon: Zap, color: '#F05252', title: 'Plan Gets Activated', desc: 'Everyone gets notified immediately with the plan details.' },
                  { icon: UserCheck, color: '#22C993', title: 'Check In as Safe', desc: 'Tap the big green CHECK IN button and pick your status.' },
                  { icon: MapPin, color: '#3B7BF7', title: 'Share Your Location', desc: 'Optionally share where you are so family can find you.' },
                  { icon: Clock, color: 'var(--t4)', title: 'Stand Down', desc: 'When it\'s over, the owner deactivates the plan and a report is saved.' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--b)' }}>
                    <item.icon className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: item.color }} />
                    <div>
                      <div className="text-sm font-bold" style={{ color: 'var(--t)' }}>{item.title}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setWelcomeStep(2)}
                  className="px-5 py-3.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                  data-testid="ccp-welcome-back-3"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}>
                  <ArrowLeft className="w-4 h-4 inline mr-1" /> Back
                </button>
                <button onClick={() => { setShowWelcome(false); localStorage.setItem('carryon_ccp_intro_seen', '1'); }}
                  className="flex-1 py-3.5 rounded-xl text-base font-bold transition-all active:scale-[0.97]"
                  data-testid="ccp-welcome-dismiss"
                  style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}>
                  <Check className="w-5 h-5 inline mr-1" /> Got It — Let's Start
                </button>
              </div>
            </div>
          )}

          {/* Skip link */}
          <button onClick={() => { setShowWelcome(false); localStorage.setItem('carryon_ccp_intro_seen', '1'); }}
            className="w-full py-2 mt-3 text-xs font-medium transition-all active:scale-[0.97]"
            data-testid="ccp-welcome-skip"
            style={{ color: 'var(--t5)', background: 'transparent' }}>
            Skip — I'll figure it out on my own
          </button>
        </div>
      </div>
    )}
    </>
  );
}

