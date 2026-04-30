import React, { useState, useEffect } from 'react';
import { API_URL } from '../../config';
import AddressAutocomplete from '../AddressAutocomplete';
import { getDisasterTemplate } from './disasterTemplates';
import {
  MapPin,
  Users,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Loader2,
  Sparkles,
  Baby,
  Heart,
  Dog,
  Accessibility,
  CloudRain,
  Flame,
  Zap,
  Waves,
  Wind,
  Mountain,
  ShieldAlert,
  Siren,
  Droplets,
  Snowflake,
  Home,
  Navigation,
  TriangleAlert,
  Edit3,
  Info,
  Plus,
  LocateFixed,
} from 'lucide-react';

const HOUSEHOLD_OPTIONS = [
  { id: 'children', label: 'Children', icon: Baby, color: '#3B7BF7' },
  { id: 'elderly', label: 'Elderly', icon: Heart, color: '#B794F6' },
  { id: 'pets', label: 'Pets', icon: Dog, color: '#22C993' },
  { id: 'disabled', label: 'Special Needs', icon: Accessibility, color: '#F5A623' },
];

const CONCERN_OPTIONS = [
  { id: 'hurricane', label: 'Hurricane', icon: CloudRain, color: '#3B7BF7' },
  { id: 'tornado', label: 'Tornado', icon: Wind, color: '#6B7BF7' },
  { id: 'earthquake', label: 'Earthquake', icon: Mountain, color: '#F5A623' },
  { id: 'flood', label: 'Flood', icon: Waves, color: '#3B9BF7' },
  { id: 'wildfire', label: 'Wildfire', icon: Flame, color: '#F05252' },
  { id: 'house_fire', label: 'House Fire', icon: Flame, color: '#FF6B35' },
  { id: 'nuclear', label: 'Nuclear Event', icon: ShieldAlert, color: '#F05252' },
  { id: 'winter_storm', label: 'Winter Storm', icon: Snowflake, color: '#88C8F7' },
  { id: 'power_outage', label: 'Power Outage', icon: Zap, color: '#F5A623' },
  { id: 'terrorism', label: 'Terrorism', icon: Siren, color: '#F05252' },
  { id: 'pandemic', label: 'Pandemic', icon: ShieldAlert, color: '#B794F6' },
  { id: 'civil_unrest', label: 'Civil Unrest', icon: AlertTriangle, color: '#F5A623' },
  { id: 'water_failure', label: 'Water Failure', icon: Droplets, color: '#3B9BF7' },
  { id: 'chemical_spill', label: 'Chemical Spill', icon: TriangleAlert, color: '#FF6B35' },
  { id: 'home_invasion', label: 'Home Invasion', icon: ShieldAlert, color: '#F05252' },
  { id: 'tsunami', label: 'Tsunami', icon: Waves, color: '#1E6BF7' },
  { id: 'cyber_attack', label: 'Cyber Attack', icon: Zap, color: '#B794F6' },
];

const TOTAL_STEPS = 4; // household → disaster → details → review

// Theme-safe border that's visible in both dark and light mode
const tileBorder = (selected, color) =>
  `2px solid ${selected ? `${color}50` : 'rgba(120,120,140,0.25)'}`;
const inputBorder = (filled) =>
  `2px solid ${filled ? 'rgba(34,201,147,0.4)' : 'rgba(120,120,140,0.25)'}`;
const sectionBorder = (editing) =>
  `1px solid ${editing ? 'rgba(212,175,55,0.35)' : 'rgba(120,120,140,0.2)'}`;

export default function CCPWizard({ estateId, token, onComplete, onCancel }) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ─── Draft persistence ─────────────────────────────────────────
  // Founder report (Apr 2026): tapping into another section mid-wizard
  // and coming back resets the form. Now we mirror the in-progress
  // wizard state to sessionStorage scoped to estate so an accidental
  // navigation doesn't lose 5 minutes of input. Cleared on successful
  // finalize or explicit cancel.
  const DRAFT_KEY = `ccp_wizard_draft:${estateId}`;
  const loadDraft = () => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  };
  const draft = loadDraft();

  const [step, setStep] = useState(draft?.step || 1);
  const [household, setHousehold] = useState(draft?.household || []);
  const [selectedConcern, setSelectedConcern] = useState(draft?.selectedConcern || '');
  const [location, setLocation] = useState(draft?.location || '');
  const [followUpAnswers, setFollowUpAnswers] = useState(draft?.followUpAnswers || {});
  const [generating, setGenerating] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState(draft?.generatedPlan || null);
  const [drillSchedule, setDrillSchedule] = useState(draft?.drillSchedule || null);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingSections, setEditingSections] = useState({});
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Mirror persistable wizard state to sessionStorage on every change.
  useEffect(() => {
    // Don't persist after the plan is saved — the wizard transitions to
    // the post-finalize "Done" screen and the draft becomes stale.
    if (saved) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        step, household, selectedConcern, location, followUpAnswers,
        generatedPlan, drillSchedule,
      }));
    } catch { /* quota or disabled — non-fatal */ }
  }, [DRAFT_KEY, step, household, selectedConcern, location, followUpAnswers, generatedPlan, drillSchedule, saved]);

  const clearDraft = () => {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* non-fatal */ }
  };

  // Detect location on user request (button tap)
  const detectLocation = () => {
    if (!navigator.geolocation) return;
    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const apiKey = process.env.REACT_APP_GOOGLE_PLACES_API_KEY;
          if (!apiKey) {
            // Fallback: use raw coordinates
            setLocation(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
            setDetectingLocation(false);
            return;
          }
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.results?.length > 0) {
              setLocation(data.results[0].formatted_address);
            } else {
              setLocation(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
            }
          } else {
            setLocation(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          }
        } catch {
          // Silent fallback
        } finally {
          setDetectingLocation(false);
        }
      },
      () => setDetectingLocation(false),
      { timeout: 10000 }
    );
  };

  const toggleHousehold = (id) => {
    setHousehold(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const template = selectedConcern ? getDisasterTemplate(selectedConcern) : null;

  const updateFollowUp = (key, value) => {
    setFollowUpAnswers(prev => ({ ...prev, [key]: value }));
  };

  const canProceed = () => {
    if (step === 1) return true; // household is optional
    if (step === 2) return !!selectedConcern;
    if (step === 3) {
      if (!location.trim() || location.trim().length < 4) return false;
      // Check required disaster-specific questions
      if (template?.questions) {
        for (const q of template.questions) {
          if (q.required && (!followUpAnswers[q.key] || !followUpAnswers[q.key].trim())) return false;
        }
      }
      return true;
    }
    return true;
  };

  const handleNext = async () => {
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    if (step === 3) {
      // Generate the plan
      setStep(4);
      setGenerating(true);
      setError('');
      try {
        const res = await fetch(`${API_URL}/ccp/wizard/generate`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            estate_id: estateId,
            location,
            household,
            concern: selectedConcern,
            follow_up_answers: followUpAnswers,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Failed to generate plan');
        }
        const data = await res.json();
        setGeneratedPlan({
          name: data.plan_name,
          plan_type: data.plan_type,
          rendezvous_points: data.rendezvous_points || [],
          communication_plan: data.communication_plan || '',
          resource_locations: data.resource_locations || [],
          instructions: data.instructions || '',
        });
        setDrillSchedule(data.drill_schedule || null);
        setWarnings(data.warnings || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setGenerating(false);
      }
    }
  };

  const handleSave = async () => {
    if (!generatedPlan) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/ccp/plans`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          estate_id: estateId,
          name: generatedPlan.name,
          plan_type: generatedPlan.plan_type,
          rendezvous_points: generatedPlan.rendezvous_points,
          communication_plan: generatedPlan.communication_plan,
          resource_locations: generatedPlan.resource_locations,
          instructions: generatedPlan.instructions,
          linked_document_ids: [],
          linked_ffn_contact_ids: [],
          linked_dav_entry_ids: [],
          assigned_beneficiary_ids: null,
          drill_schedule: drillSchedule,
        }),
      });
      if (res.ok) {
        setSaved(true);
        clearDraft();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || 'Failed to save plan');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (step === 4 && generatedPlan) {
      setGeneratedPlan(null);
      setDrillSchedule(null);
      setWarnings([]);
      setStep(3);
    } else if (step > 1) {
      setStep(step - 1);
    } else {
      clearDraft();
      onCancel();
    }
  };

  const toggleEditSection = (key) => {
    setEditingSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const startNewPlan = () => {
    setSelectedConcern('');
    setFollowUpAnswers({});
    setGeneratedPlan(null);
    setDrillSchedule(null);
    setWarnings([]);
    setError('');
    setSaved(false);
    setEditingSections({});
    setStep(2);
  };

  const updatePlanField = (field, value) => {
    setGeneratedPlan(prev => ({ ...prev, [field]: value }));
  };

  const progressPercent = step === 4 ? 100 : ((step) / TOTAL_STEPS) * 100;
  const concernLabel = selectedConcern ? CONCERN_OPTIONS.find(c => c.id === selectedConcern)?.label || selectedConcern : '';

  return (
    <div data-testid="ccp-wizard" className="max-w-lg sm:max-w-xl mx-auto px-4 py-6 pb-28 sm:pb-6">
      {/* Header */}
      <button
        onClick={handleBack}
        className="flex items-center gap-2 text-sm font-semibold mb-4"
        data-testid="ccp-wizard-back"
        style={{ color: 'var(--t4)' }}
      >
        <ArrowLeft className="w-4 h-4" />
        {step === 1 ? 'Cancel' : 'Back'}
      </button>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--b)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%`, background: 'linear-gradient(90deg, #d4af37, #F0C95C)' }}
          />
        </div>
        {step <= 3 && (
          <p className="text-xs mt-2 text-right" style={{ color: 'var(--t5)' }}>
            {step} of 3
          </p>
        )}
      </div>

      {/* ── STEP 1: Household ── */}
      {step === 1 && (
        <div className="space-y-5" data-testid="ccp-wizard-step-1">
          <div className="text-center mb-6">
            <Users className="w-10 h-10 mx-auto mb-3" style={{ color: '#d4af37' }} />
            <h2 className="text-xl font-bold" style={{ color: 'var(--t)', fontFamily: 'var(--sans)' }}>
              Who is in your household?
            </h2>
            <p className="text-sm mt-2" style={{ color: 'var(--t4)' }}>
              Select anyone who needs special consideration
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {HOUSEHOLD_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const selected = household.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => toggleHousehold(opt.id)}
                  className="flex flex-col items-center justify-center py-6 px-4 rounded-2xl transition-all active:scale-[0.95]"
                  data-testid={`ccp-wizard-household-${opt.id}`}
                  style={{
                    background: selected ? `${opt.color}15` : 'var(--s)',
                    border: tileBorder(selected, opt.color),
                    minHeight: 110,
                  }}
                >
                  <Icon className="w-8 h-8 mb-2" style={{ color: selected ? opt.color : 'var(--t5)' }} />
                  <span className="text-sm font-bold" style={{ color: selected ? opt.color : 'var(--t4)' }}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-center" style={{ color: 'var(--t5)' }}>
            Skip if none apply — just tap Next
          </p>
        </div>
      )}

      {/* ── STEP 2: Pick ONE disaster ── */}
      {step === 2 && (
        <div className="space-y-5" data-testid="ccp-wizard-step-2">
          <div className="text-center mb-6">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: '#d4af37' }} />
            <h2 className="text-xl font-bold" style={{ color: 'var(--t)', fontFamily: 'var(--sans)' }}>
              What plan do you want to create?
            </h2>
            <p className="text-sm mt-2" style={{ color: 'var(--t4)' }}>
              Pick one — you can create plans for other scenarios after
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {CONCERN_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const selected = selectedConcern === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setSelectedConcern(opt.id)}
                  className="flex flex-col items-center justify-center py-4 px-2 rounded-xl transition-all active:scale-[0.95]"
                  data-testid={`ccp-wizard-concern-${opt.id}`}
                  style={{
                    background: selected ? `${opt.color}15` : 'var(--s)',
                    border: tileBorder(selected, opt.color),
                  }}
                >
                  <Icon className="w-6 h-6 mb-1.5" style={{ color: selected ? opt.color : 'var(--t5)' }} />
                  <span className="text-[11px] font-bold leading-tight text-center" style={{ color: selected ? opt.color : 'var(--t4)' }}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── STEP 3: Location + Disaster-specific questions ── */}
      {step === 3 && (
        <div className="space-y-5" data-testid="ccp-wizard-step-3">
          <div className="text-center mb-4">
            <MapPin className="w-10 h-10 mx-auto mb-3" style={{ color: '#d4af37' }} />
            <h2 className="text-xl font-bold" style={{ color: 'var(--t)', fontFamily: 'var(--sans)' }}>
              {concernLabel} Plan Details
            </h2>
            {template && (
              <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--t4)' }}>
                {template.intro}
              </p>
            )}
          </div>

          {/* Home address — universal */}
          <div>
            <label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--t4)' }}>
              Your home address
            </label>
            <div className="relative">
              <AddressAutocomplete
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onSelect={({ street, city, state, zip }) => {
                  const full = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
                  setLocation(full);
                }}
                placeholder={detectingLocation ? 'Detecting your location...' : 'Enter your address'}
                className="w-full rounded-xl px-4 py-3.5 text-base"
                data-testid="ccp-wizard-location"
                style={{
                  background: 'var(--s)',
                  border: inputBorder(location.trim().length > 3),
                  color: 'var(--t)',
                  fontSize: '16px',
                }}
              />
              {detectingLocation && (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin" style={{ color: '#d4af37' }} />
              )}
            </div>
            {!location.trim() && !detectingLocation && (
              <button
                onClick={detectLocation}
                className="flex items-center gap-1.5 mt-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-[0.97]"
                data-testid="ccp-wizard-use-location"
                style={{ background: 'rgba(59,123,247,0.1)', color: '#3B7BF7' }}
              >
                <LocateFixed className="w-3.5 h-3.5" />Use my current location
              </button>
            )}
          </div>

          {/* Disaster-specific follow-up questions */}
          {template?.questions?.map(q => (
            <div key={q.key}>
              <label className="text-xs font-bold mb-1.5 flex items-center gap-1" style={{ color: 'var(--t4)' }}>
                {q.label}
                {!q.required && <span className="font-normal" style={{ color: 'var(--t5)' }}>(optional)</span>}
              </label>
              {q.type === 'address' ? (
                <AddressAutocomplete
                  value={followUpAnswers[q.key] || ''}
                  onChange={(e) => updateFollowUp(q.key, e.target.value)}
                  onSelect={({ street, city, state, zip }) => {
                    const full = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
                    updateFollowUp(q.key, full);
                  }}
                  placeholder={q.placeholder}
                  className="w-full rounded-xl px-4 py-3.5 text-base"
                  data-testid={`ccp-wizard-followup-${q.key}`}
                  style={{
                    background: 'var(--s)',
                    border: inputBorder((followUpAnswers[q.key] || '').trim()),
                    color: 'var(--t)',
                    fontSize: '16px',
                  }}
                />
              ) : q.type === 'select' ? (
                <>
                  <select
                    value={followUpAnswers[q.key] || ''}
                    onChange={(e) => updateFollowUp(q.key, e.target.value)}
                    className="w-full rounded-xl px-4 py-3.5 text-base"
                    data-testid={`ccp-wizard-followup-${q.key}`}
                    style={{
                      background: 'var(--s)',
                      border: inputBorder((followUpAnswers[q.key] || '').trim()),
                      color: (followUpAnswers[q.key] || '').trim() ? 'var(--t)' : 'var(--t4)',
                      fontSize: '16px',
                    }}
                  >
                    {/* Generic prompt — reads as "I haven't picked yet"
                        instead of looking like a real selectable answer.
                        The detailed q.placeholder (often a coaching
                        sentence) renders BELOW as helper text so it
                        doesn't compete with real options. */}
                    <option value="" disabled>Tap to choose…</option>
                    {(q.options || []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  {q.placeholder && (
                    <p className="text-xs font-semibold text-[var(--t4)] mt-1.5 px-1" data-testid={`ccp-wizard-followup-${q.key}-help`}>
                      {q.placeholder}
                    </p>
                  )}
                </>
              ) : (
                <input
                  value={followUpAnswers[q.key] || ''}
                  onChange={(e) => updateFollowUp(q.key, e.target.value)}
                  placeholder={q.placeholder}
                  className="w-full rounded-xl px-4 py-3.5 text-base"
                  data-testid={`ccp-wizard-followup-${q.key}`}
                  style={{
                    background: 'var(--s)',
                    border: inputBorder((followUpAnswers[q.key] || '').trim()),
                    color: 'var(--t)',
                    fontSize: '16px',
                  }}
                />
              )}
              {q.hint && (
                <p className="text-xs font-semibold mt-1" style={{ color: 'var(--t5)' }}>{q.hint}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── STEP 4: Generating / Review ── */}
      {step === 4 && (
        <div data-testid="ccp-wizard-step-4">
          {generating && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4" data-testid="ccp-wizard-generating">
              <div className="relative">
                <Sparkles className="w-12 h-12 animate-pulse" style={{ color: '#d4af37' }} />
              </div>
              <h2 className="text-xl font-bold text-center" style={{ color: 'var(--t)', fontFamily: 'var(--sans)' }}>
                Building your {concernLabel} plan...
              </h2>
              <p className="text-sm text-center max-w-xs" style={{ color: 'var(--t4)' }}>
                CCP AI is creating a personalized plan based on your answers
              </p>
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#d4af37' }} />
            </div>
          )}

          {error && !generating && (
            <div className="text-center py-12 space-y-4" data-testid="ccp-wizard-error">
              <AlertTriangle className="w-12 h-12 mx-auto" style={{ color: '#F05252' }} />
              <p className="text-sm font-semibold" style={{ color: '#F05252' }}>{error}</p>
              <button
                onClick={() => { setError(''); handleNext(); }}
                className="px-6 py-3 rounded-xl text-sm font-bold"
                data-testid="ccp-wizard-retry"
                style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.3)' }}
              >
                Try Again
              </button>
            </div>
          )}

          {generatedPlan && !generating && (
            <div className="space-y-4" data-testid="ccp-wizard-review">
              {/* Draft banner */}
              <div className="rounded-xl px-4 py-3 flex items-start gap-3" data-testid="ccp-wizard-draft-banner"
                style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)' }}>
                <Info className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#d4af37' }} />
                <div>
                  <p className="text-sm font-bold" style={{ color: '#d4af37' }}>Draft Plan — Generated by CCP AI</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>
                    Review each section below. Tap "Change" to edit anything before finalizing.
                  </p>
                </div>
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="rounded-xl p-3 space-y-2" data-testid="ccp-wizard-warnings" style={{ background: 'rgba(240,82,82,0.08)', border: '1px solid rgba(240,82,82,0.2)' }}>
                  {warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#F05252' }} />
                      <span className="text-xs" style={{ color: '#F05252' }}>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Plan Name */}
              <ReviewSection title="Plan Name" editing={editingSections.name} onToggle={() => toggleEditSection('name')}>
                {editingSections.name ? (
                  <input value={generatedPlan.name} onChange={(e) => updatePlanField('name', e.target.value)}
                    className="w-full rounded-xl px-3 py-3 text-base" data-testid="ccp-wizard-edit-name"
                    style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
                ) : (
                  <p className="text-base font-bold" style={{ color: 'var(--t)' }}>{generatedPlan.name}</p>
                )}
              </ReviewSection>

              {/* Rendezvous Points */}
              <ReviewSection title="Meeting Points" editing={editingSections.rendezvous} onToggle={() => toggleEditSection('rendezvous')}>
                {generatedPlan.rendezvous_points.map((rp, i) => (
                  <div key={i} className="mb-3 last:mb-0">
                    {editingSections.rendezvous ? (
                      <div className="space-y-2">
                        <input value={rp.name} onChange={(e) => { const arr = [...generatedPlan.rendezvous_points]; arr[i] = { ...arr[i], name: e.target.value }; updatePlanField('rendezvous_points', arr); }}
                          placeholder="Name" className="w-full rounded-xl px-3 py-2.5 text-sm"
                          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
                        <input value={rp.address} onChange={(e) => { const arr = [...generatedPlan.rendezvous_points]; arr[i] = { ...arr[i], address: e.target.value }; updatePlanField('rendezvous_points', arr); }}
                          placeholder="Address" className="w-full rounded-xl px-3 py-2.5 text-sm"
                          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'var(--t)' }}>{rp.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>{rp.address}</p>
                        {rp.notes && <p className="text-xs mt-0.5 italic" style={{ color: 'var(--t5)' }}>{rp.notes}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </ReviewSection>

              {/* Communication Plan */}
              <ReviewSection title="Communication Plan" editing={editingSections.comm} onToggle={() => toggleEditSection('comm')}>
                {editingSections.comm ? (
                  <textarea value={generatedPlan.communication_plan} onChange={(e) => updatePlanField('communication_plan', e.target.value)}
                    rows={4} className="w-full rounded-xl px-3 py-3 text-sm resize-none" data-testid="ccp-wizard-edit-comm"
                    style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
                ) : (
                  <p className="text-sm whitespace-pre-line" style={{ color: 'var(--t)' }}>{generatedPlan.communication_plan}</p>
                )}
              </ReviewSection>

              {/* Resource Locations */}
              <ReviewSection title="Supply & Resource Locations" editing={editingSections.resources} onToggle={() => toggleEditSection('resources')}>
                {generatedPlan.resource_locations.map((rl, i) => (
                  <div key={i} className="mb-3 last:mb-0">
                    {editingSections.resources ? (
                      <div className="space-y-2">
                        <input value={rl.name} onChange={(e) => { const arr = [...generatedPlan.resource_locations]; arr[i] = { ...arr[i], name: e.target.value }; updatePlanField('resource_locations', arr); }}
                          placeholder="Name" className="w-full rounded-xl px-3 py-2.5 text-sm"
                          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
                        <input value={rl.location} onChange={(e) => { const arr = [...generatedPlan.resource_locations]; arr[i] = { ...arr[i], location: e.target.value }; updatePlanField('resource_locations', arr); }}
                          placeholder="Location" className="w-full rounded-xl px-3 py-2.5 text-sm"
                          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'var(--t)' }}>{rl.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>{rl.location}</p>
                        {rl.notes && <p className="text-xs mt-0.5 italic" style={{ color: 'var(--t5)' }}>{rl.notes}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </ReviewSection>

              {/* Instructions */}
              <ReviewSection title="Step-by-Step Instructions" editing={editingSections.instructions} onToggle={() => toggleEditSection('instructions')}>
                {editingSections.instructions ? (
                  <textarea value={generatedPlan.instructions} onChange={(e) => updatePlanField('instructions', e.target.value)}
                    rows={6} className="w-full rounded-xl px-3 py-3 text-sm resize-none" data-testid="ccp-wizard-edit-instructions"
                    style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
                ) : (
                  <p className="text-sm whitespace-pre-line" style={{ color: 'var(--t)' }}>{generatedPlan.instructions}</p>
                )}
              </ReviewSection>

              {/* Drill Schedule */}
              {drillSchedule && (
                <div className="rounded-xl overflow-hidden" data-testid="ccp-wizard-drill-schedule"
                  style={{ background: 'rgba(59,123,247,0.05)', border: '1px solid rgba(59,123,247,0.15)' }}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#3B7BF7' }}>Drill Reminders</span>
                    <button onClick={() => setDrillSchedule(prev => ({ ...prev, enabled: !prev.enabled }))}
                      className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                      data-testid="ccp-wizard-drill-toggle"
                      style={{ background: drillSchedule.enabled ? 'rgba(34,201,147,0.15)' : 'var(--s)', color: drillSchedule.enabled ? '#22C993' : 'var(--t5)' }}>
                      {drillSchedule.enabled ? <><Check className="w-3 h-3" /> On</> : <><X className="w-3 h-3" /> Off</>}
                    </button>
                  </div>
                  <div className="px-4 pb-4">
                    <p className="text-sm" style={{ color: 'var(--t)' }}>
                      We recommend practicing this plan <strong>{drillSchedule.label?.toLowerCase()}</strong>.
                    </p>
                    {drillSchedule.next_drill_date && (
                      <p className="text-xs mt-2" style={{ color: 'var(--t4)' }}>
                        Next suggested drill: <strong style={{ color: '#3B7BF7' }}>
                          {new Date(drillSchedule.next_drill_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </strong>
                      </p>
                    )}
                    {drillSchedule.enabled && (
                      <p className="text-xs mt-1.5" style={{ color: 'var(--t5)' }}>
                        We'll send you a friendly email reminder when it's time.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Save / Post-Save Actions */}
              {!saved ? (
                <button onClick={handleSave} disabled={saving || !generatedPlan.name?.trim()}
                  className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97] mt-4"
                  data-testid="ccp-wizard-save"
                  style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}>
                  {saving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Finalize & Save Plan'}
                </button>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-center gap-2 py-3 rounded-2xl"
                    style={{ background: 'rgba(34,201,147,0.12)', border: '1px solid rgba(34,201,147,0.3)' }}>
                    <Check className="w-5 h-5" style={{ color: '#22C993' }} />
                    <span className="text-sm font-bold" style={{ color: '#22C993' }}>Plan Saved</span>
                  </div>
                  <button onClick={startNewPlan}
                    className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                    data-testid="ccp-wizard-create-another"
                    style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}>
                    <Plus className="w-5 h-5" />Create Another Plan
                  </button>
                  <button onClick={onComplete}
                    className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97] hover:brightness-110"
                    data-testid="ccp-wizard-done"
                    // Bright active blue — was a grayed disabled-looking
                    // pill that founders read as "not clickable" during
                    // a B2B pitch. Per founder directive, post-finalize
                    // CTAs must look ACTIVE so demo viewers see the
                    // gold→blue progression as a clear next action.
                    style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#FFFFFF', boxShadow: '0 8px 24px rgba(37,99,235,0.35)' }}>
                    Done — Back to Plans
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Next Button (Steps 1-3) ── */}
      {step <= 3 && (
        <button
          onClick={handleNext}
          disabled={!canProceed()}
          className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97] mt-8 flex items-center justify-center gap-2"
          data-testid="ccp-wizard-next"
          style={{
            background: canProceed() ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(120,120,140,0.15)',
            color: canProceed() ? '#080e1a' : 'rgba(120,120,140,0.5)',
            border: canProceed() ? 'none' : '1px solid rgba(120,120,140,0.2)',
          }}
        >
          {step === 3 ? (
            <><Sparkles className="w-5 h-5" />Generate My {concernLabel} Plan</>
          ) : (
            <>Next<ArrowRight className="w-5 h-5" /></>
          )}
        </button>
      )}
    </div>
  );
}

/** Collapsible review section with Accept/Change toggle */
function ReviewSection({ title, editing, onToggle, children }) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'var(--s)', border: sectionBorder(editing) }}>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--t4)' }}>{title}</span>
        <button onClick={onToggle}
          className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
          data-testid={`ccp-wizard-toggle-${title.toLowerCase().replace(/\s+/g, '-')}`}
          style={{ background: editing ? 'rgba(212,175,55,0.15)' : 'rgba(120,120,140,0.1)', color: editing ? '#d4af37' : 'var(--t4)' }}>
          {editing ? <><Check className="w-3 h-3" /> Done</> : <><Edit3 className="w-3 h-3" /> Change</>}
        </button>
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}
