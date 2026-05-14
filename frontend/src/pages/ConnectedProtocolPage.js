import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useBrand } from '../contexts/AuthContext';
import { useLabelCleaner } from '../utils/brandLabel';
import { API_URL } from '../config';
import { useDebouncedRefetch } from '../hooks/useDebouncedRefetch';
import { formatPhoneUS } from '../utils/phoneFormat';
import { saveList, readList } from '../utils/localListCache';
import { useDraftState } from '../hooks/useDraftState';
import CCPPlanEditor from '../components/ccp/CCPPlanEditor';
import CCPActiveView from '../components/ccp/CCPActiveView';
import CCPWizard from '../components/ccp/CCPWizard';
import CCPDebriefView from '../components/ccp/CCPDebriefView';
import CCPWelcomeWalkthrough from '../components/ccp/CCPWelcomeWalkthrough';
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
  Sparkles,
  Star,
  TrendingUp,
  MessageCircle,
  Share2,
  Copy,
  Link,
  CreditCard,
  Info,
} from 'lucide-react';
import { openPdfPreview } from '../utils/openPdfPreview';
import CachedPdfIcon from '../components/CachedPdfIcon';

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
  const brand = useBrand();
  const cleanLabel = useLabelCleaner();
  const navigate = useNavigate();
  const token = localStorage.getItem('carryon_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Pitch-killer fix (Feb 2026): the page used to read selected_estate_id
  // exactly once at mount as a const. If the user navigated here before
  // the dashboard had a chance to seed that key (or after a sidebar
  // action cleared it), CCP rendered a dead "No estate selected" panel
  // until the user force-quit and relaunched. Now we keep estateId in
  // state and self-heal: if localStorage has it, use it immediately;
  // otherwise pull /api/estates and adopt the first owned estate, the
  // same fallback Beneficiaries / MM / SDV / Vault all use.
  const [estateId, setEstateId] = useState(() => localStorage.getItem('selected_estate_id') || '');
  const [estateResolving, setEstateResolving] = useState(!estateId);

  useEffect(() => {
    if (estateId) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Offline: don't flash empty. Try the local estates mirror; if it
      // has anything owned, adopt it. Otherwise stay in resolving state
      // until reconnect (an `online` listener below retriggers).
      (async () => {
        try {
          const m = await import('../offline/repos/estatesRepo');
          const localEstates = await m.getLocalEstates().catch(() => []);
          const owned = (localEstates || []).filter(e => e.user_role_in_estate === 'owner' || (!e.user_role_in_estate && !e.is_beneficiary_estate));
          if (owned[0]?.id) {
            try { localStorage.setItem('selected_estate_id', owned[0].id); } catch {}
            setEstateId(owned[0].id);
          }
        } catch { /* non-fatal */ }
        setEstateResolving(false);
      })();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/estates`, { headers });
        if (!res.ok) throw new Error('estates fetch failed');
        const all = await res.json();
        if (cancelled) return;
        const owned = (all || []).filter(e => e.user_role_in_estate === 'owner' || (!e.user_role_in_estate && !e.is_beneficiary_estate));
        if (owned[0]?.id) {
          try { localStorage.setItem('selected_estate_id', owned[0].id); } catch {}
          setEstateId(owned[0].id);
        }
      } catch { /* show no-estate panel below */ }
      finally {
        if (!cancelled) setEstateResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [estateId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draft persistence for the parent view state — when a benefactor
  // is mid-wizard and taps Dashboard / another sidebar item, returning
  // to /connected-protocol must drop them back into the wizard at the
  // same step rather than the home tile grid. The wizard's internal
  // step/inputs are already persisted via its own sessionStorage key
  // (see CCPWizard.js); this hook just keeps the parent route aware
  // that the wizard is open.
  const ccpViewKey = estateId ? `ccp_view:${estateId}` : null;
  const [view, setView, clearViewDraft] = useDraftState(ccpViewKey, 'home'); // home, plans, plan-edit, active, checkin, history, wizard, debrief
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
  const [debriefActivationId, setDebriefActivationId] = useState(null);
  const [debriefPlanName, setDebriefPlanName] = useState('');
  const [debriefStats, setDebriefStats] = useState(null);
  const [shareModal, setShareModal] = useState(null); // { planId, planName, token }
  const [shareCopied, setShareCopied] = useState(false);
  // First-visit welcome intro. Auto-skipped if EITHER the local
  // "intro seen" flag is set OR the user already has plans on this
  // estate (returning user signal that survives a fresh browser /
  // cleared cache, since plans live server-side). The flag is also
  // persisted when plans are detected, so the next visit on the same
  // device skips even if the plans list is briefly empty during
  // refetch.
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('carryon_ccp_intro_seen'));
  const [welcomeStep, setWelcomeStep] = useState(1);
  useEffect(() => {
    if (showWelcome && plans.length > 0) {
      try { localStorage.setItem('carryon_ccp_intro_seen', '1'); } catch { /* private mode */ }
      setShowWelcome(false);
    }
  }, [plans.length, showWelcome]);

  const isBenefactor = user?.role === 'benefactor' || user?.is_also_benefactor;

  const fetchPlans = useCallback(async () => {
    if (!estateId) return;
    // Airplane-mode rescue — rehydrate from the last-known-good
    // localStorage cache so the user keeps seeing their Emergency
    // Plans instead of a blank list. Populated by the online branch
    // below on every successful fetch.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const cached = readList(`ccp:plans:${estateId}`);
      if (Array.isArray(cached) && cached.length > 0) setPlans(cached);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/ccp/plans/${estateId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && (data.length > 0 || plans.length === 0)) {
          setPlans(data);
        }
        if (Array.isArray(data)) saveList(`ccp:plans:${estateId}`, data);
      }
    } catch {}
  }, [estateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchActive = useCallback(async () => {
    if (!estateId) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
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
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
      const res = await fetch(`${API_URL}/ccp/active/${estateId}/linked-resources`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && (data.length > 0 || linkedResources.length === 0)) {
          setLinkedResources(data);
        }
      }
    } catch {}
  }, [estateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAvailableResources = useCallback(async () => {
    if (!estateId) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
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
    if (!estateId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      await Promise.all([fetchPlans(), fetchActive()]);
      setLoading(false);
    })();
  }, [estateId, fetchPlans, fetchActive]);

  // Auto-refresh when the offline outbox drains on reconnect — swaps
  // optimistic `_local_pending` CCP plans for the server-authoritative ones.
  // Also refetch on airplane-mode transitions so the plan list doesn't
  // require manual navigate-off-and-back to refresh. Debounced to
  // coalesce bursts during sync recovery.
  useDebouncedRefetch(
    () => fetchPlans(),
    ['online', 'offline', 'carryon:outbox:drained'],
  );

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
    const wasDrill = activeEmergency.is_drill;
    const emergencyId = activeEmergency.id;
    const planName = activeEmergency.plan_name || 'Drill';
    try {
      const res = await fetch(`${API_URL}/ccp/deactivate/${activeEmergency.id}`, {
        method: 'POST', headers, body: JSON.stringify({ notes: '' }),
      });
      if (res.ok) {
        setActiveEmergency(null);
        setStatusBoard([]);
        await fetchPlans();
        // After drill deactivation, show debrief prompt
        if (wasDrill) {
          setDebriefActivationId(emergencyId);
          setDebriefPlanName(planName);
          setView('debrief');
        } else {
          setView('home');
        }
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
      const relUrl = isNew ? `/ccp/plans` : `/ccp/plans/${editPlan.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const body = isNew ? { estate_id: estateId, ...editPlan } : editPlan;
      const { mutateWithOutbox } = await import('../utils/offlineMutation');
      const r = await mutateWithOutbox({
        entity_type: 'ccp_plan',
        entity_id: editPlan.id || `local-ccp-${Date.now()}`,
        method,
        url: relUrl,
        body,
        authHeaders: { headers },
      });
      if (!r.ok) throw r.error || new Error('ccp save failed');
      if (r.queued) {
        // Optimistically reflect the queued change in the local plans list.
        if (isNew) {
          const tempId = `local-ccp-${Date.now()}`;
          setPlans(prev => [...prev, { ...body, id: tempId, _local_pending: true }]);
        } else {
          setPlans(prev => prev.map(p => p.id === editPlan.id ? { ...p, ...body, _local_pending: true } : p));
        }
        try {
          const { toast } = await import('../utils/toast');
          toast.success(isNew ? 'Plan saved offline — will sync when you reconnect.' : 'Plan changes queued — will sync when you reconnect.');
        } catch {}
        setEditPlan(null);
        setView('plans');
      } else {
        setEditPlan(null);
        setView('plans');
        await fetchPlans();
      }
    } catch {} finally { setSubmitting(false); }
  };

  const deletePlan = async (planId) => {
    if (!window.confirm('Delete this emergency plan?')) return;
    try {
      const { mutateWithOutbox } = await import('../utils/offlineMutation');
      const r = await mutateWithOutbox({
        entity_type: 'ccp_plan',
        entity_id: planId,
        method: 'DELETE',
        url: `/ccp/plans/${planId}`,
        body: null,
        authHeaders: { headers },
      });
      if (!r.ok) throw r.error || new Error('ccp delete failed');
      if (r.queued) {
        setPlans(prev => prev.filter(p => p.id !== planId));
        try {
          const { toast } = await import('../utils/toast');
          toast.success('Plan deletion queued — will sync when you reconnect.');
        } catch {}
      } else {
        await fetchPlans();
      }
    } catch {}
  };

  const downloadPlan = async (plan) => {
    try {
      const safeName = (plan.name || 'plan').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'plan';
      const filename = `CCP_${safeName}.pdf`;
      await openPdfPreview({
        navigate,
        pdfType: 'ccp_plan',
        filename,
        title: 'Contingency Care Plan',
        subtitle: plan.name || '',
        blobFetcher: async () => {
          const t = localStorage.getItem('carryon_token');
          const prep = await fetch(`${API_URL}/downloads/prepare`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ccp_plan', params: { plan_id: plan.id }, filename }),
          });
          if (!prep.ok) throw new Error('Failed to prepare download');
          const { token: dt } = await prep.json();
          const res = await fetch(`${API_URL}/downloads/${dt}`);
          if (!res.ok) throw new Error('Failed to fetch PDF');
          return await res.blob();
        },
      });
    } catch {
      alert('Failed to download plan');
    }
  };

  const fetchHistory = async () => {
    if (!estateId) return;
    try {
      const [histRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/ccp/history/${estateId}`, { headers }),
        fetch(`${API_URL}/ccp/debrief-stats/${estateId}`, { headers }),
      ]);
      if (histRes.ok) setHistory(await histRes.json());
      if (statsRes.ok) setDebriefStats(await statsRes.json());
    } catch {}
  };

  const sharePlan = async (plan) => {
    try {
      const res = await fetch(`${API_URL}/ccp/plans/${plan.id}/share`, { method: 'POST', headers });
      if (!res.ok) { alert('Failed to generate share link'); return; }
      const data = await res.json();
      const shareUrl = `${window.location.origin}/shared/plan/${data.share_token}`;
      setShareModal({ planId: plan.id, planName: plan.name, token: data.share_token, url: shareUrl });
      setShareCopied(false);
    } catch { alert('Failed to share plan'); }
  };

  const revokeShare = async (planId) => {
    try {
      await fetch(`${API_URL}/ccp/plans/${planId}/share`, { method: 'DELETE', headers });
      setShareModal(null);
      await fetchPlans();
    } catch {}
  };

  const copyShareLink = () => {
    if (!shareModal?.url) return;
    navigator.clipboard.writeText(shareModal.url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  const nativeShare = async () => {
    if (!shareModal?.url || !navigator.share) return;
    try {
      await navigator.share({ title: `Contingency Protocol: ${shareModal.planName}`, text: `View our family contingency protocol: ${shareModal.planName}`, url: shareModal.url });
    } catch {}
  };

  const downloadEmergencyCard = async (plan) => {
    try {
      const safeName = (plan.name || 'plan').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'plan';
      const filename = `EmergencyCard_${safeName}.pdf`;
      await openPdfPreview({
        navigate,
        pdfType: 'ccp_card',
        filename,
        title: 'Emergency Card',
        subtitle: plan.name || '',
        blobFetcher: async () => {
          const t = localStorage.getItem('carryon_token');
          const prep = await fetch(`${API_URL}/downloads/prepare`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'emergency_card', params: { plan_id: plan.id }, filename }),
          });
          if (!prep.ok) throw new Error('Failed to prepare');
          const { token: dt } = await prep.json();
          const res = await fetch(`${API_URL}/downloads/${dt}`);
          if (!res.ok) throw new Error('Failed to fetch PDF');
          return await res.blob();
        },
      });
    } catch { alert('Failed to generate emergency card'); }
  };



  if (loading || estateResolving) {
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
      <div data-testid="ccp-checkin-view" className="max-w-lg lg:max-w-4xl mx-auto px-4 lg:px-8 py-6 pb-28 sm:pb-6 space-y-4">
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
                  background: selected ? cfg.bg : 'var(--s)',
                  border: `2px solid ${selected ? cfg.border : 'var(--b)'}`,
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
                color: 'var(--bg)',
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

  // ===================== WIZARD VIEW =====================
  if (view === 'wizard') {
    return (
      <CCPWizard
        estateId={estateId}
        token={token}
        onComplete={() => { clearViewDraft(); setView('plans'); fetchPlans(); }}
        onCancel={() => { clearViewDraft(); setView(plans.length > 0 ? 'plans' : 'home'); }}
      />
    );
  }

  // ===================== DEBRIEF VIEW =====================
  if (view === 'debrief' && debriefActivationId) {
    return (
      <CCPDebriefView
        activationId={debriefActivationId}
        planName={debriefPlanName}
        token={token}
        onComplete={() => { setDebriefActivationId(null); setView('home'); }}
        onSkip={() => { setDebriefActivationId(null); setView('home'); }}
      />
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
      <div data-testid="ccp-plans-list" className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-6 pb-28 sm:pb-6 space-y-4">
        <button onClick={() => setView('home')} className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--t4)' }}>
          <ArrowLeft className="w-4 h-4" />Back
        </button>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: 'var(--t)', fontFamily: 'var(--sans)' }}>Emergency Plans</h2>
          {isBenefactor && (
            <button onClick={() => { setEditPlan({ name: '', plan_type: 'custom', rendezvous_points: [], communication_plan: '', resource_locations: [], instructions: '', linked_document_ids: [], linked_ffn_contact_ids: [], linked_dav_entry_ids: [], assigned_beneficiary_ids: null }); fetchAvailableResources(); setView('plan-edit'); }}
              className="w-10 h-10 rounded-full flex items-center justify-center" data-testid="ccp-new-plan-btn"
              title="Create manually"
              style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              <Plus className="w-5 h-5" style={{ color: 'var(--t4)' }} />
            </button>
          )}
        </div>

        {/* Wizard CTA — primary action for creating plans */}
        {isBenefactor && (
          <button
            onClick={() => setView('wizard')}
            className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97] flex items-center gap-3 px-5"
            data-testid="ccp-wizard-btn"
            style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.12), rgba(240,201,92,0.08))', border: '1px solid rgba(212,175,55,0.3)', color: '#d4af37' }}
          >
            <Sparkles className="w-6 h-6 flex-shrink-0" />
            <div className="text-left flex-1">
              <div style={{ fontFamily: 'var(--sans)' }}>Build My Plan</div>
              <div className="text-xs font-normal" style={{ color: 'var(--t4)' }}>Answer a few questions — AI builds the rest</div>
            </div>
            <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--t4)' }} />
          </button>
        )}
        {isBenefactor && plans.length > 0 && (
          <p className="text-xs" style={{ color: 'var(--t5)' }} data-testid="ccp-beneficiary-note">Your beneficiaries can view these plans on their portal.</p>
        )}
        {plans.length === 0 && (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--t5)' }} />
            <p className="text-sm" style={{ color: 'var(--t4)' }}>No plans created yet</p>
          </div>
        )}
        {plans.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {plans.map(p => (
          <div key={p.id} className="rounded-xl p-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--t)' }}>{p.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,123,247,0.1)', color: '#3B7BF7' }}>{PLAN_TYPE_LABELS[p.plan_type] || p.plan_type}</span>
              </div>
              {isBenefactor && (
                <div className="flex gap-1.5">
                  <button onClick={() => sharePlan(p)} className="w-8 h-8 rounded-lg flex items-center justify-center" data-testid={`ccp-share-${p.id}`}
                    title="Share"
                    style={{ background: 'rgba(59,123,247,0.1)' }}><Share2 className="w-4 h-4" style={{ color: '#3B7BF7' }} /></button>
                  <button onClick={() => downloadPlan(p)} className="w-8 h-8 rounded-lg flex items-center justify-center" data-testid={`ccp-print-${p.id}`}
                    title="Download / Print"
                    style={{ background: 'rgba(34,201,147,0.1)' }}><Printer className="w-4 h-4" style={{ color: '#22C993' }} /></button>
                  <button onClick={() => { setEditPlan(p); fetchAvailableResources(); setView('plan-edit'); }} className="w-8 h-8 rounded-lg flex items-center justify-center" data-testid={`ccp-edit-${p.id}`}
                    style={{ background: 'var(--s)' }}><Edit className="w-4 h-4" style={{ color: 'var(--t4)' }} /></button>
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
            {/* Drill Schedule Info */}
            {p.drill_schedule && (
              <div className="flex items-center justify-between mt-2 px-1">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" style={{ color: p.drill_schedule.enabled ? '#3B7BF7' : 'var(--t5)' }} />
                  <span className="text-xs" style={{ color: p.drill_schedule.enabled ? 'var(--t4)' : 'var(--t5)' }}>
                    {p.drill_schedule.enabled
                      ? `Next drill: ${p.drill_schedule.next_drill_date ? new Date(p.drill_schedule.next_drill_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : p.drill_schedule.label}`
                      : 'Drill reminders off'}
                  </span>
                </div>
                {isBenefactor && (
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(`${API_URL}/ccp/plans/${p.id}/drill-schedule`, {
                          method: 'PATCH', headers,
                          body: JSON.stringify({ enabled: !p.drill_schedule.enabled }),
                        });
                        if (res.ok) fetchPlans();
                      } catch {}
                    }}
                    className="text-[11px] font-bold px-2 py-1 rounded-md"
                    data-testid={`ccp-drill-toggle-${p.id}`}
                    style={{
                      background: p.drill_schedule.enabled ? 'rgba(34,201,147,0.1)' : 'var(--s)',
                      color: p.drill_schedule.enabled ? '#22C993' : 'var(--t5)',
                    }}
                  >
                    {p.drill_schedule.enabled ? 'ON' : 'OFF'}
                  </button>
                )}
              </div>
            )}
            {/* Action buttons */}
            {isBenefactor && (
              <>
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
              <button onClick={() => downloadEmergencyCard(p)}
                className="w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 mt-2"
                data-testid={`ccp-emergency-card-${p.id}`}
                style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)', color: '#d4af37' }}>
                <CreditCard className="w-3.5 h-3.5" />Emergency Card (wallet PDF + QR)
              </button>
              </>
            )}
          </div>
        ))}
          </div>
        )}
      </div>
    );
  }

  // ===================== HISTORY VIEW =====================
  if (view === 'history') {
    return (
      <div data-testid="ccp-history" className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-6 pb-28 sm:pb-6 space-y-4">
        <button onClick={() => setView('home')} className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--t4)' }}>
          <ArrowLeft className="w-4 h-4" />Back
        </button>
        <h2 className="text-lg font-bold" style={{ color: 'var(--t)' }}>Past Activations</h2>

        {/* Drill Trend Summary */}
        {debriefStats && debriefStats.total_drills > 0 && (
          <div className="rounded-xl p-4" data-testid="ccp-debrief-trend" style={{ background: 'rgba(59,123,247,0.06)', border: '1px solid rgba(59,123,247,0.15)' }}>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4" style={{ color: '#3B7BF7' }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#3B7BF7' }}>Drill Performance</span>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star
                      key={s}
                      className="w-4 h-4"
                      style={{
                        color: s <= Math.round(debriefStats.average_rating) ? '#d4af37' : 'var(--t5)',
                        fill: s <= Math.round(debriefStats.average_rating) ? '#d4af37' : 'none',
                      }}
                    />
                  ))}
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--t4)' }}>
                  {debriefStats.average_rating}/5 average
                </p>
              </div>
              <div>
                <p className="text-lg font-bold" style={{ color: 'var(--t)' }}>{debriefStats.total_drills}</p>
                <p className="text-xs" style={{ color: 'var(--t4)' }}>drill{debriefStats.total_drills !== 1 ? 's' : ''} reviewed</p>
              </div>
            </div>
            {/* Mini trend dots */}
            {debriefStats.entries.length > 1 && (
              <div className="flex items-end gap-1 mt-3 h-8">
                {debriefStats.entries.slice(-10).map((e, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm transition-all"
                    title={`${e.plan_name}: ${e.rating}/5`}
                    style={{
                      height: `${(e.rating / 5) * 100}%`,
                      background: e.rating >= 4 ? '#22C993' : e.rating >= 3 ? '#d4af37' : '#F05252',
                      minWidth: 6,
                      maxWidth: 24,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {history.length === 0 && (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--t5)' }} />
            <p className="text-sm" style={{ color: 'var(--t4)' }}>No past activations</p>
          </div>
        )}
        {history.map(h => (
          <div key={h.id} className="rounded-xl p-4" data-testid={`ccp-history-${h.id}`} style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <div className="flex items-center gap-2 mb-1">
              {h.is_drill && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,123,247,0.15)', color: '#3B7BF7' }}>DRILL</span>}
              <span className="text-sm font-bold" style={{ color: 'var(--t)' }}>{h.plan_name}</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--t4)' }}>
              {new Date(h.activated_at).toLocaleDateString()} — {h.status === 'resolved' ? 'Resolved' : h.status}
            </p>
            {/* Debrief info */}
            {h.debrief && (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--b)' }}>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star
                        key={s}
                        className="w-3 h-3"
                        style={{
                          color: s <= h.debrief.rating ? '#d4af37' : 'var(--t5)',
                          fill: s <= h.debrief.rating ? '#d4af37' : 'none',
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--t5)' }}>
                    by {h.debrief.submitted_by_name}
                  </span>
                </div>
                {h.debrief.went_well && (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--t4)' }}>
                    <span style={{ color: '#22C993' }}>Went well:</span> {h.debrief.went_well}
                  </p>
                )}
                {h.debrief.to_improve && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>
                    <span style={{ color: '#F5A623' }}>Improve:</span> {h.debrief.to_improve}
                  </p>
                )}
              </div>
            )}
            {/* Submit debrief for drills without one */}
            {h.is_drill && !h.debrief && isBenefactor && (
              <button
                onClick={() => { setDebriefActivationId(h.id); setDebriefPlanName(h.plan_name); setView('debrief'); }}
                className="text-xs font-bold mt-2 flex items-center gap-1 py-1.5 px-3 rounded-lg"
                data-testid={`ccp-add-debrief-${h.id}`}
                style={{ background: 'rgba(59,123,247,0.1)', color: '#3B7BF7' }}
              >
                <MessageCircle className="w-3 h-3" />Add Debrief
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ===================== HOME VIEW — Big Bubble Buttons =====================
  return (
    <>
    <div data-testid="ccp-home" className="w-full max-w-[1400px] mx-auto p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(212,175,55,0.12), transparent 55%), radial-gradient(ellipse at bottom right, rgba(240,201,92,0.06), transparent 55%)' }}>
      {/* Header — standardized icon-box + title + 1-line description to
          match MM, SDV, DAV, EPT, etc. (centered hero replaced). */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(240,201,92,0.15))' }}>
            <Shield className="w-5 h-5 text-[#d4af37]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>{cleanLabel(`${brand} Contingency Protocols (CCP)`)}</h1>
            <p className="text-xs text-[var(--t5)]">Family disaster preparedness — plans, check-ins &amp; rendezvous</p>
          </div>
        </div>
      </div>

      {/* Emergency Alert Banner */}
      {activeEmergency && (
        <button onClick={() => setView('active')}
          className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97] flex items-center gap-3 px-5 animate-pulse"
          data-testid="ccp-active-alert"
          style={{ background: activeEmergency.is_drill ? 'rgba(59,123,247,0.12)' : 'rgba(240,82,82,0.12)', border: `1px solid ${activeEmergency.is_drill ? 'rgba(59,123,247,0.3)' : 'rgba(240,82,82,0.3)'}`, color: activeEmergency.is_drill ? '#3B7BF7' : '#F05252' }}>
          <AlertTriangle className="w-6 h-6 flex-shrink-0" />
          <span className="flex-1 text-left" style={{ fontFamily: 'var(--sans)' }}>{activeEmergency.is_drill ? 'Drill Active' : 'Emergency Active'} — Tap to View</span>
          <ChevronRight className="w-5 h-5 flex-shrink-0" />
        </button>
      )}

      {/* Big Navigation Buttons */}
      {isBenefactor && (
        <button onClick={() => setView('wizard')}
          className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97] flex items-center gap-3 px-5"
          data-testid="ccp-wizard-home-btn"
          style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.12), rgba(240,201,92,0.08))', border: '1px solid rgba(212,175,55,0.3)', color: '#d4af37' }}>
          <Sparkles className="w-6 h-6 flex-shrink-0" />
          <div className="text-left flex-1">
            <div style={{ fontFamily: 'var(--sans)' }}>Build My Plan</div>
            <div className="text-xs font-normal" style={{ color: 'var(--t4)' }}>Answer a few questions — AI builds the rest</div>
          </div>
          <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--t4)' }} />
        </button>
      )}

      <button onClick={() => setView('plans')}
        className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97] flex items-center gap-3 px-5"
        data-testid="ccp-plans-btn"
        style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#d4af37' }}>
        <FileText className="w-6 h-6 flex-shrink-0" />
        <div className="text-left flex-1">
          <div style={{ fontFamily: 'var(--sans)' }}>Contingency Protocols</div>
          <div className="text-xs font-normal" style={{ color: 'var(--t4)' }}>{plans.length} plan{plans.length !== 1 ? 's' : ''} created</div>
        </div>
        <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--t4)' }} />
      </button>

      <button onClick={() => { fetchHistory(); setView('history'); }}
        className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97] flex items-center gap-3 px-5"
        data-testid="ccp-history-btn"
        style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t4)' }}>
        <Clock className="w-6 h-6 flex-shrink-0" />
        <span className="flex-1 text-left" style={{ fontFamily: 'var(--sans)' }}>Past Activations</span>
        <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--t4)' }} />
      </button>

      {/* Family Readiness Report */}
      {isBenefactor && plans.length > 0 && (
        <div className="flex items-center gap-2 w-full">
          <button
            onClick={async () => {
              try {
                const filename = 'CarryOn_Readiness_Report.pdf';
                await openPdfPreview({
                  navigate,
                  pdfType: 'ccp_report',
                  filename,
                  title: 'Family Readiness Report',
                  subtitle: new Date().toISOString().slice(0, 10),
                  blobFetcher: async () => {
                    const t = localStorage.getItem('carryon_token');
                    const prep = await fetch(`${API_URL}/downloads/prepare`, {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'family_readiness_report', params: { estate_id: estateId }, filename }),
                    });
                    if (!prep.ok) throw new Error('Failed to prepare');
                    const { token: dt } = await prep.json();
                    const res = await fetch(`${API_URL}/downloads/${dt}`);
                    if (!res.ok) throw new Error('Failed to fetch PDF');
                    return await res.blob();
                  },
                });
              } catch { alert('Failed to generate report'); }
            }}
            className="flex-1 py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97] flex items-center gap-3 px-5"
            data-testid="ccp-readiness-report-btn"
            style={{ background: 'rgba(34,201,147,0.06)', border: '1px solid rgba(34,201,147,0.15)', color: '#22C993' }}
          >
            <Download className="w-6 h-6 flex-shrink-0" />
            <div className="text-left flex-1">
              <div style={{ fontFamily: 'var(--sans)' }}>Family Readiness Report</div>
              <div className="text-xs font-normal" style={{ color: 'var(--t4)' }}>Download PDF for your go-bag</div>
            </div>
            <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--t4)' }} />
          </button>
          <CachedPdfIcon pdfType="ccp_report" size={20} />
        </div>
      )}

      {/* Recall walkthrough */}
      <button
        onClick={() => { setWelcomeStep(1); setShowWelcome(true); }}
        className="w-full py-3 rounded-2xl text-sm font-semibold transition-all active:scale-[0.97] flex items-center justify-center gap-2"
        data-testid="ccp-recall-walkthrough"
        style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t4)' }}
      >
        <Info className="w-4 h-4" />
        How CCP Works
      </button>
    </div>
    {shareModal && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center" data-testid="ccp-share-modal"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)', padding: '16px' }}>
        <div className="w-full max-w-sm rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg2)', border: '1px solid rgba(59,123,247,0.3)', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold" style={{ color: 'var(--t)', fontFamily: 'var(--sans)' }}>Share Plan</h3>
            <button onClick={() => setShareModal(null)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--s)' }}>
              <X className="w-4 h-4" style={{ color: 'var(--t4)' }} />
            </button>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--t4)' }}>
            Anyone with this link can view <strong style={{ color: 'var(--t)' }}>{shareModal.planName}</strong> — no login required.
          </p>

          {/* Link display */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 rounded-xl px-3 py-2.5 text-xs truncate" style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t4)' }}>
              {shareModal.url}
            </div>
            <button onClick={copyShareLink}
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-[0.95]"
              data-testid="ccp-share-copy"
              style={{ background: shareCopied ? 'rgba(34,201,147,0.15)' : 'rgba(59,123,247,0.15)' }}>
              {shareCopied ? <Check className="w-4 h-4" style={{ color: '#22C993' }} /> : <Copy className="w-4 h-4" style={{ color: '#3B7BF7' }} />}
            </button>
          </div>

          {shareCopied && (
            <p className="text-xs text-center mb-3" style={{ color: '#22C993' }}>Link copied!</p>
          )}

          {/* Action buttons */}
          <div className="space-y-2">
            {navigator.share && (
              <button onClick={nativeShare}
                className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                data-testid="ccp-share-native"
                style={{ background: 'rgba(59,123,247,0.12)', border: '1px solid rgba(59,123,247,0.3)', color: '#3B7BF7' }}>
                <Share2 className="w-4 h-4" />Share via...
              </button>
            )}
            <button onClick={() => revokeShare(shareModal.planId)}
              className="w-full py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.97]"
              data-testid="ccp-share-revoke"
              style={{ background: 'rgba(240,82,82,0.08)', color: '#F05252' }}>
              Revoke Link
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ===== CCP First-Visit Welcome Walkthrough ===== */}
    {showWelcome && (
      <CCPWelcomeWalkthrough
        welcomeStep={welcomeStep}
        setWelcomeStep={setWelcomeStep}
        onDismiss={() => setShowWelcome(false)}
      />
    )}
    </>
  );
}

