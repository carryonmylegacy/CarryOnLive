import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import { formatPhoneUS } from '../utils/phoneFormat';
import AddressAutocomplete from '../components/AddressAutocomplete';
import {
  Shield,
  AlertTriangle,
  Plus,
  MapPin,
  Phone,
  Package,
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
  FolderLock,
  Heart,
  KeyRound,
  ExternalLink,
  Mail,
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
    const snap = activeEmergency.plan_snapshot || {};
    return (
      <div data-testid="ccp-active-view" className="max-w-2xl mx-auto px-4 py-6 pb-28 sm:pb-6 space-y-5">
        {/* Emergency Header */}
        <div className="rounded-2xl p-5 text-center" style={{
          background: activeEmergency.is_drill ? 'rgba(59,123,247,0.12)' : 'rgba(240,82,82,0.12)',
          border: `2px solid ${activeEmergency.is_drill ? 'rgba(59,123,247,0.4)' : 'rgba(240,82,82,0.4)'}`,
        }}>
          {activeEmergency.is_drill && (
            <div className="text-xs font-bold mb-2 px-3 py-1 rounded-full inline-block" style={{ background: 'rgba(59,123,247,0.2)', color: '#3B7BF7' }}>DRILL MODE</div>
          )}
          <AlertTriangle className="w-10 h-10 mx-auto mb-2" style={{ color: activeEmergency.is_drill ? '#3B7BF7' : '#F05252' }} />
          <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>{activeEmergency.plan_name}</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--t4)' }}>
            Activated {new Date(activeEmergency.activated_at).toLocaleString()}
          </p>
        </div>

        {/* CHECK IN Button - Huge, crisis-friendly */}
        <button
          onClick={() => setView('checkin')}
          className="w-full py-6 rounded-2xl text-xl font-bold transition-all active:scale-[0.97]"
          data-testid="ccp-checkin-btn"
          style={{
            background: 'linear-gradient(135deg, #22C993, #4EDBA8)',
            color: '#080e1a',
            boxShadow: '0 4px 20px rgba(34,201,147,0.3)',
            minHeight: 80,
          }}
        >
          <UserCheck className="w-8 h-8 mx-auto mb-1" />
          CHECK IN
        </button>

        {/* Status Board */}
        <div>
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--t4)' }}>MEMBER STATUS</h3>
          <div className="space-y-2">
            {statusBoard.map(m => {
              const cfg = STATUS_CONFIG[m.status] || STATUS_CONFIG.not_checked_in;
              const Icon = cfg.icon;
              return (
                <div key={m.user_id} className="flex items-center gap-3 p-3 rounded-xl" data-testid={`ccp-status-${m.user_id}`}
                  style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: cfg.color, color: '#080e1a' }}>
                    {m.name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold" style={{ color: 'var(--t)' }}>{m.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                      <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
                    </div>
                    {m.status_note && <p className="text-xs mt-1" style={{ color: 'var(--t4)' }}>{m.status_note}</p>}
                    {m.location_description && (
                      <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--t4)' }}>
                        <MapPin className="w-3 h-3" />{m.location_description}
                      </p>
                    )}
                  </div>
                  {m.checked_in_at && (
                    <span className="text-[11px]" style={{ color: 'var(--t5)' }}>
                      {new Date(m.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Plan Details - Collapsible */}
        <PlanDetails snap={snap} />

        {/* Linked Resources — Quick Access */}
        {(linkedResources.documents.length > 0 || linkedResources.ffn_contacts.length > 0 || linkedResources.dav_entries.length > 0) && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold" style={{ color: 'var(--t4)' }}>EMERGENCY RESOURCES</h3>

            {/* SDV Documents */}
            {linkedResources.documents.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(59,123,247,0.2)' }}>
                <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'rgba(59,123,247,0.08)' }}>
                  <FolderLock className="w-4 h-4" style={{ color: '#3B7BF7' }} />
                  <span className="text-xs font-bold" style={{ color: '#3B7BF7' }}>DOCUMENTS (SDV)</span>
                </div>
                <div className="p-2 space-y-1">
                  {linkedResources.documents.map(doc => (
                    <a key={doc.id} href={`/vault`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.97]"
                      data-testid={`ccp-doc-${doc.id}`}
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--b)' }}>
                      <FileText className="w-5 h-5 flex-shrink-0" style={{ color: '#3B7BF7' }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: 'var(--t)' }}>{doc.name}</div>
                        <div className="text-xs" style={{ color: 'var(--t4)' }}>{doc.category} · {doc.file_type}</div>
                      </div>
                      <ExternalLink className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--t5)' }} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* FFN Contacts */}
            {linkedResources.ffn_contacts.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(34,201,147,0.2)' }}>
                <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'rgba(34,201,147,0.08)' }}>
                  <Heart className="w-4 h-4" style={{ color: '#22C993' }} />
                  <span className="text-xs font-bold" style={{ color: '#22C993' }}>TRUSTED CONTACTS (FFN)</span>
                </div>
                <div className="p-2 space-y-1">
                  {linkedResources.ffn_contacts.map(fc => (
                    <div key={fc.id} className="flex items-center gap-3 p-3 rounded-xl"
                      data-testid={`ccp-ffn-${fc.id}`}
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--b)' }}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(34,201,147,0.15)', color: '#22C993' }}>
                        {fc.name?.charAt(0) || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold" style={{ color: 'var(--t)' }}>{fc.name}</div>
                        <div className="text-xs" style={{ color: 'var(--t4)' }}>{fc.relationship}</div>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        {fc.phone && (
                          <a href={`tel:${fc.phone}`} className="w-9 h-9 rounded-full flex items-center justify-center active:scale-[0.95]"
                            style={{ background: 'rgba(34,201,147,0.15)' }}>
                            <Phone className="w-4 h-4" style={{ color: '#22C993' }} />
                          </a>
                        )}
                        {fc.email && (
                          <a href={`mailto:${fc.email}`} className="w-9 h-9 rounded-full flex items-center justify-center active:scale-[0.95]"
                            style={{ background: 'rgba(59,123,247,0.15)' }}>
                            <Mail className="w-4 h-4" style={{ color: '#3B7BF7' }} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DAV Entries */}
            {linkedResources.dav_entries.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(183,148,246,0.2)' }}>
                <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'rgba(183,148,246,0.08)' }}>
                  <KeyRound className="w-4 h-4" style={{ color: '#B794F6' }} />
                  <span className="text-xs font-bold" style={{ color: '#B794F6' }}>DIGITAL CREDENTIALS (DAV)</span>
                </div>
                <div className="p-2 space-y-1">
                  {linkedResources.dav_entries.map(dav => (
                    <a key={dav.id} href={`/digital-wallet`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.97]"
                      data-testid={`ccp-dav-${dav.id}`}
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--b)' }}>
                      <KeyRound className="w-5 h-5 flex-shrink-0" style={{ color: '#B794F6' }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: 'var(--t)' }}>{dav.account_name}</div>
                        <div className="text-xs" style={{ color: 'var(--t4)' }}>{dav.category} · {dav.login_username}</div>
                      </div>
                      <ExternalLink className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--t5)' }} />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Deactivate - Benefactor only */}
        {isBenefactor && (
          <button
            onClick={deactivate}
            disabled={submitting}
            className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97]"
            data-testid="ccp-deactivate-btn"
            style={{ background: 'rgba(240,82,82,0.15)', border: '2px solid rgba(240,82,82,0.4)', color: '#F05252' }}
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'STAND DOWN — Deactivate'}
          </button>
        )}

        <button onClick={() => setView('home')} className="w-full py-3 rounded-xl text-sm font-semibold" data-testid="ccp-back-home"
          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t4)' }}>
          <ArrowLeft className="w-4 h-4 inline mr-1" />Back
        </button>
      </div>
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
      <div data-testid="ccp-plan-edit" className="max-w-2xl mx-auto px-4 py-6 pb-28 sm:pb-6 space-y-4" style={{ overflowX: 'hidden' }}>
        <button onClick={() => { setEditPlan(null); setView('plans'); }} className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--t4)' }}>
          <ArrowLeft className="w-4 h-4" />Back to Plans
        </button>
        <h2 className="text-lg font-bold" style={{ color: 'var(--t)' }}>{editPlan.id ? 'Edit Plan' : 'New Emergency Plan'}</h2>

        {/* Plan Name */}
        <div>
          <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--t4)' }}>Plan Name</label>
          <input value={editPlan.name || ''} onChange={(e) => setEditPlan({ ...editPlan, name: e.target.value })}
            placeholder="e.g., Hurricane Evacuation Plan" className="w-full rounded-xl px-3 py-3 text-base"
            data-testid="ccp-plan-name" style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
        </div>

        {/* Plan Type */}
        <div>
          <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--t4)' }}>Plan Type</label>
          <select value={editPlan.plan_type || 'custom'} onChange={(e) => setEditPlan({ ...editPlan, plan_type: e.target.value })}
            className="w-full rounded-xl px-3 py-3 text-base" data-testid="ccp-plan-type"
            style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }}>
            {Object.entries(PLAN_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {/* Rendezvous Points */}
        <div>
          <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--t4)' }}>Rendezvous Points</label>
          {(editPlan.rendezvous_points || []).map((rp, i) => (
            <div key={i} className="mb-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex gap-2 mb-2">
                <input value={rp.name || ''} onChange={(e) => { const arr = [...(editPlan.rendezvous_points || [])]; arr[i] = { ...arr[i], name: e.target.value }; setEditPlan({ ...editPlan, rendezvous_points: arr }); }}
                  placeholder="Name" className="flex-1 rounded-xl px-3 py-2.5 text-base"
                  data-testid={`ccp-rendezvous-name-${i}`}
                  style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
                <button onClick={() => { const arr = (editPlan.rendezvous_points || []).filter((_, j) => j !== i); setEditPlan({ ...editPlan, rendezvous_points: arr }); }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(240,82,82,0.1)' }}>
                  <X className="w-4 h-4" style={{ color: '#F05252' }} />
                </button>
              </div>
              <AddressAutocomplete value={rp.address || ''} onChange={(e) => { const arr = [...(editPlan.rendezvous_points || [])]; arr[i] = { ...arr[i], address: e.target.value }; setEditPlan({ ...editPlan, rendezvous_points: arr }); }}
                onSelect={({ street, city, state, zip }) => { const full = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', '); const arr = [...(editPlan.rendezvous_points || [])]; arr[i] = { ...arr[i], address: full }; setEditPlan({ ...editPlan, rendezvous_points: arr }); }}
                placeholder="Address" className="w-full rounded-xl px-3 py-2.5 text-base"
                data-testid={`ccp-rendezvous-address-${i}`}
                style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
            </div>
          ))}
          <button onClick={() => setEditPlan({ ...editPlan, rendezvous_points: [...(editPlan.rendezvous_points || []), { name: '', address: '', notes: '' }] })}
            className="text-sm font-semibold flex items-center gap-1 py-2" data-testid="ccp-add-rendezvous" style={{ color: '#3B7BF7' }}>
            <Plus className="w-4 h-4" />Add Rendezvous Point
          </button>
        </div>

        {/* Communication Plan */}
        <div>
          <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--t4)' }}>Communication Plan</label>
          <textarea value={editPlan.communication_plan || ''} onChange={(e) => setEditPlan({ ...editPlan, communication_plan: e.target.value })}
            placeholder="e.g., Text first, then call home phone, then radio channel 14"
            rows={3} className="w-full rounded-xl px-3 py-3 text-base resize-none"
            data-testid="ccp-comm-plan"
            style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
        </div>

        {/* Resource Locations */}
        <div>
          <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--t4)' }}>Resource / Supply Locations</label>
          {(editPlan.resource_locations || []).map((rl, i) => (
            <div key={i} className="mb-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex gap-2 mb-2">
                <input value={rl.name || ''} onChange={(e) => { const arr = [...(editPlan.resource_locations || [])]; arr[i] = { ...arr[i], name: e.target.value }; setEditPlan({ ...editPlan, resource_locations: arr }); }}
                  placeholder="Name / What" className="flex-1 rounded-xl px-3 py-2.5 text-base"
                  data-testid={`ccp-resource-name-${i}`}
                  style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
                <button onClick={() => { const arr = (editPlan.resource_locations || []).filter((_, j) => j !== i); setEditPlan({ ...editPlan, resource_locations: arr }); }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(240,82,82,0.1)' }}>
                  <X className="w-4 h-4" style={{ color: '#F05252' }} />
                </button>
              </div>
              <AddressAutocomplete value={rl.location || ''} onChange={(e) => { const arr = [...(editPlan.resource_locations || [])]; arr[i] = { ...arr[i], location: e.target.value }; setEditPlan({ ...editPlan, resource_locations: arr }); }}
                onSelect={({ street, city, state, zip }) => { const full = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', '); const arr = [...(editPlan.resource_locations || [])]; arr[i] = { ...arr[i], location: full }; setEditPlan({ ...editPlan, resource_locations: arr }); }}
                placeholder="Address" className="w-full rounded-xl px-3 py-2.5 text-base"
                data-testid={`ccp-resource-address-${i}`}
                style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
            </div>
          ))}
          <button onClick={() => setEditPlan({ ...editPlan, resource_locations: [...(editPlan.resource_locations || []), { name: '', location: '', notes: '' }] })}
            className="text-sm font-semibold flex items-center gap-1 py-2" data-testid="ccp-add-resource" style={{ color: '#3B7BF7' }}>
            <Plus className="w-4 h-4" />Add Resource Location
          </button>
        </div>

        {/* Instructions */}
        <div>
          <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--t4)' }}>Instructions</label>
          <textarea value={editPlan.instructions || ''} onChange={(e) => setEditPlan({ ...editPlan, instructions: e.target.value })}
            placeholder="Step-by-step instructions for family members"
            rows={4} className="w-full rounded-xl px-3 py-3 text-base resize-none"
            data-testid="ccp-instructions"
            style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
        </div>

        {/* Assign to Beneficiaries */}
        {estateMembers.filter(m => m.role_in_estate === 'beneficiary').length > 0 && (
          <div>
            <label className="text-xs font-bold mb-2 block" style={{ color: 'var(--t4)' }}>Assign to Beneficiaries</label>
            <p className="text-xs mb-3" style={{ color: 'var(--t5)' }}>Choose which beneficiaries this plan applies to. All are selected by default.</p>
            <div className="space-y-2">
              {estateMembers.filter(m => m.role_in_estate === 'beneficiary').map(member => {
                const assignedIds = editPlan.assigned_beneficiary_ids;
                const isSelected = assignedIds === null || assignedIds === undefined || assignedIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    onClick={() => {
                      const beneficiaryIds = estateMembers.filter(m => m.role_in_estate === 'beneficiary').map(m => m.id);
                      let current = editPlan.assigned_beneficiary_ids;
                      // If null/undefined (all selected), create explicit list with this one removed
                      if (current === null || current === undefined) {
                        current = beneficiaryIds.filter(id => id !== member.id);
                      } else if (current.includes(member.id)) {
                        // Deselect — but don't allow empty (at least one must be selected)
                        const next = current.filter(id => id !== member.id);
                        current = next.length > 0 ? next : current;
                      } else {
                        // Select
                        current = [...current, member.id];
                        // If all are now selected, set back to null (meaning "all")
                        if (current.length === beneficiaryIds.length) current = null;
                      }
                      setEditPlan({ ...editPlan, assigned_beneficiary_ids: current });
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl transition-all"
                    data-testid={`ccp-assign-beneficiary-${member.id}`}
                    style={{
                      background: isSelected ? 'rgba(59,123,247,0.08)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isSelected ? 'rgba(59,123,247,0.25)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: isSelected ? 'rgba(59,123,247,0.15)' : 'rgba(255,255,255,0.06)', color: isSelected ? '#3B7BF7' : 'var(--t5)' }}>
                      {member.photo_url ? (
                        <img src={member.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        (member.name || '?').charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-semibold" style={{ color: isSelected ? 'var(--t)' : 'var(--t4)' }}>{member.name || 'Unknown'}</div>
                      {member.relation && <div className="text-xs" style={{ color: 'var(--t5)' }}>{member.relation}</div>}
                    </div>
                    <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{
                      background: isSelected ? '#3B7BF7' : 'rgba(255,255,255,0.06)',
                      border: `2px solid ${isSelected ? '#3B7BF7' : 'rgba(255,255,255,0.15)'}`,
                    }}>
                      {isSelected && <Check className="w-3.5 h-3.5" style={{ color: '#fff' }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Link Resources */}
        <ResourceLinker
          label="Link Documents (SDV)" icon={FolderLock} color="#3B7BF7"
          available={availableResources.documents} idField="id" nameField="name" subtitleField="category"
          selected={editPlan.linked_document_ids || []}
          onChange={(ids) => setEditPlan({ ...editPlan, linked_document_ids: ids })}
        />
        <ResourceLinker
          label="Link Contacts (FFN)" icon={Heart} color="#22C993"
          available={availableResources.ffn_contacts} idField="id" nameField="name" subtitleField="relationship"
          selected={editPlan.linked_ffn_contact_ids || []}
          onChange={(ids) => setEditPlan({ ...editPlan, linked_ffn_contact_ids: ids })}
        />
        <ResourceLinker
          label="Link Credentials (DAV)" icon={KeyRound} color="#B794F6"
          available={availableResources.dav_entries} idField="id" nameField="account_name" subtitleField="category"
          selected={editPlan.linked_dav_entry_ids || []}
          onChange={(ids) => setEditPlan({ ...editPlan, linked_dav_entry_ids: ids })}
        />

        {/* Save */}
        <button onClick={savePlan} disabled={submitting || !editPlan.name?.trim()}
          className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97]"
          data-testid="ccp-save-plan"
          style={{ background: editPlan.name?.trim() ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(255,255,255,0.06)', color: editPlan.name?.trim() ? '#080e1a' : 'var(--t5)' }}>
          {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Save Plan'}
        </button>
      </div>
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

// Collapsible plan details component
function PlanDetails({ snap }) {
  const [open, setOpen] = useState(false);
  if (!snap) return null;
  const hasContent = snap.rendezvous_points?.length || snap.communication_plan || snap.resource_locations?.length || snap.instructions;
  if (!hasContent) return null;
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 text-left" data-testid="ccp-plan-details-toggle"
        style={{ background: 'rgba(255,255,255,0.03)' }}>
        <span className="text-sm font-bold" style={{ color: 'var(--t4)' }}>Plan Details</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--t4)' }} />
      </button>
      {open && (
        <div className="p-4 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {snap.rendezvous_points?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2"><MapPin className="w-4 h-4" style={{ color: '#3B7BF7' }} /><span className="text-xs font-bold" style={{ color: '#3B7BF7' }}>RENDEZVOUS POINTS</span></div>
              {snap.rendezvous_points.map((rp, i) => (
                <div key={i} className="ml-6 mb-1.5">
                  <div className="text-sm font-semibold" style={{ color: 'var(--t)' }}>{rp.name}</div>
                  {rp.address && <div className="text-xs" style={{ color: 'var(--t4)' }}>{rp.address}</div>}
                </div>
              ))}
            </div>
          )}
          {snap.communication_plan && (
            <div>
              <div className="flex items-center gap-2 mb-2"><Phone className="w-4 h-4" style={{ color: '#22C993' }} /><span className="text-xs font-bold" style={{ color: '#22C993' }}>COMMUNICATION</span></div>
              <p className="text-sm ml-6" style={{ color: '#D8DEE9' }}>{snap.communication_plan}</p>
            </div>
          )}
          {snap.resource_locations?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2"><Package className="w-4 h-4" style={{ color: '#F5A623' }} /><span className="text-xs font-bold" style={{ color: '#F5A623' }}>RESOURCES</span></div>
              {snap.resource_locations.map((rl, i) => (
                <div key={i} className="ml-6 mb-1.5">
                  <div className="text-sm font-semibold" style={{ color: 'var(--t)' }}>{rl.name}</div>
                  {rl.location && <div className="text-xs" style={{ color: 'var(--t4)' }}>{rl.location}</div>}
                </div>
              ))}
            </div>
          )}
          {snap.instructions && (
            <div>
              <div className="flex items-center gap-2 mb-2"><FileText className="w-4 h-4" style={{ color: '#B794F6' }} /><span className="text-xs font-bold" style={{ color: '#B794F6' }}>INSTRUCTIONS</span></div>
              <p className="text-sm ml-6 whitespace-pre-wrap" style={{ color: '#D8DEE9' }}>{snap.instructions}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function ResourceLinker({ label, icon: Icon, color, available, idField, nameField, subtitleField, selected, onChange }) {
  const [open, setOpen] = useState(false);
  if (!available || available.length === 0) return null;
  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-semibold py-2" style={{ color }} data-testid={`ccp-link-${label.split(' ')[1]?.toLowerCase() || 'res'}`}>
        <Icon className="w-4 h-4" />
        {label} ({selected.length}/{available.length})
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-1 mb-3">
          {available.map(item => {
            const id = item[idField];
            const isSelected = selected.includes(id);
            return (
              <button key={id} onClick={() => toggle(id)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all"
                style={{ background: isSelected ? `${color}15` : 'rgba(255,255,255,0.02)', border: `1px solid ${isSelected ? `${color}40` : 'rgba(255,255,255,0.05)'}` }}>
                <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: isSelected ? color : 'rgba(255,255,255,0.08)' }}>
                  {isSelected && <Check className="w-3 h-3" style={{ color: '#080e1a' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--t)' }}>{item[nameField]}</div>
                  {subtitleField && item[subtitleField] && <div className="text-xs" style={{ color: 'var(--t4)' }}>{item[subtitleField]}</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
