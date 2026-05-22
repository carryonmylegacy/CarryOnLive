/**
 * QuickStartWizard
 * ───────────────────────────────────────────────────────────────────
 * The very first thing a new benefactor sees on login. Full-screen
 * modal overlay rendered by `DashboardLayout` *over* the dashboard.
 *
 * Founder direction (May 22 2026):
 *   • Collects only what xAI Grok needs to produce a state-aware,
 *     family-tailored professional-prep checklist.
 *   • Beneficiaries entered here are immediately materialised as
 *     `beneficiaries` rows stamped `quickstart_seed=true` so the
 *     existing Getting Started flow opens those tiles to fill out
 *     instead of asking the user to "Add a beneficiary" again.
 *   • Every step has a Skip for Now affordance that drops the user
 *     on the dashboard for the rest of the session; on the next
 *     login they see the QW again at the last step (server-side
 *     progress).
 *   • Ends with a PDF preview using the standard `openPdfPreview`
 *     pipeline. The PDF is cached under `pdf_type=quickstart_guide`
 *     so the Estate Binder picks it up as the first section.
 *   • All Grok calls hit the founder's personal `XAI_API_KEY` —
 *     no Emergent LLM key on this path.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Loader2, ShieldCheck, Sparkles, X } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { API_URL } from '../config';
import { useAuth, useBrand } from '../contexts/AuthContext';
import { openPdfPreview } from '../utils/openPdfPreview';

const STEPS = [
  'welcome', 'state', 'household', 'beneficiaries', 'real_estate',
  'financial_accounts', 'life_insurance', 'business', 'existing_documents',
  'generate',
];
// Re-exported so the public Partner-Brief trial page (which is not
// authenticated) can reuse the same step list / validation / UI without
// duplicating any copy. Keep these in lockstep.
export { STEPS };

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];
const RELATIONSHIPS = [
  'Spouse','Partner','Son','Daughter','Mother','Father','Brother','Sister',
  'Grandson','Granddaughter','Grandmother','Grandfather','Aunt','Uncle',
  'Niece','Nephew','Friend','Charity','Other',
];

const SESSION_SKIP_KEY = 'carryon_quickstart_skipped_session';

const QuickStartWizard = ({ forceOpen = false, onClose = () => {} }) => {
  const { user, getAuthHeaders } = useAuth();
  const brand = useBrand();
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [stepData, setStepData] = useState({});
  const [error, setError] = useState('');
  const stepIdxRef = useRef(0);

  // Eligibility: benefactors only (multi-role with benefactor flag also
  // included so a beneficiary-with-benefactor-side sees it).
  const eligible = user?.role === 'benefactor' || user?.is_also_benefactor;

  // Local "dismissed for this session" state. Mirrors sessionStorage so
  // a page reload preserves the dismissal, but also lives in component
  // state so toggling it forces a re-render. Initialized from storage.
  const [dismissedThisSession, setDismissedThisSession] = useState(() => {
    try { return sessionStorage.getItem(SESSION_SKIP_KEY) === '1'; }
    catch { return false; }
  });
  // When the dashboard Resume CTA forces us open, clear the local
  // dismissal so the modal shows immediately.
  useEffect(() => {
    if (forceOpen) {
      try { sessionStorage.removeItem(SESSION_SKIP_KEY); } catch { /* ignore */ }
      setDismissedThisSession(false);
    }
  }, [forceOpen]);

  const fetchProgress = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API_URL}/quickstart/progress`, getAuthHeaders());
      setProgress(res.data);
      const cur = res.data?.current_step || 'welcome';
      stepIdxRef.current = Math.max(0, STEPS.indexOf(cur));
      // Pre-load the current step's saved data if any.
      const savedForStep = res.data?.data?.[cur] || {};
      setStepData(savedForStep);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load your QuickStart progress.');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (eligible) fetchProgress();
    else setLoading(false);
  }, [eligible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Decide whether to render at all.
  const shouldRender = eligible
    && !loading
    && progress
    && !progress.complete
    && !dismissedThisSession;

  if (!shouldRender) return null;

  const currentStep = progress.current_step || 'welcome';
  const currentIdx = Math.max(0, STEPS.indexOf(currentStep));
  const totalSteps = STEPS.length;

  const skip = () => {
    try { sessionStorage.setItem(SESSION_SKIP_KEY, '1'); } catch { /* ignore */ }
    setDismissedThisSession(true);
    onClose();
  };

  const goToStep = async (nextKey) => {
    if (!STEPS.includes(nextKey)) return;
    setSaving(true);
    setError('');
    try {
      const res = await apiClient.put(
        `${API_URL}/quickstart/step/${currentStep}`,
        { data: stepData, next_step: nextKey },
        getAuthHeaders(),
      );
      setProgress(res.data);
      const savedForStep = res.data?.data?.[nextKey] || {};
      setStepData(savedForStep);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not save this step.');
    }
    setSaving(false);
  };

  const next = () => {
    const idx = STEPS.indexOf(currentStep);
    const nextKey = STEPS[Math.min(STEPS.length - 1, idx + 1)];
    goToStep(nextKey);
  };
  const back = () => {
    const idx = STEPS.indexOf(currentStep);
    if (idx <= 0) return;
    goToStep(STEPS[idx - 1]);
  };

  const generate = async () => {
    setGenerating(true);
    setError('');
    try {
      // Save the last step first (no-op data is fine).
      await apiClient.put(
        `${API_URL}/quickstart/step/${currentStep}`,
        { data: stepData, next_step: 'generate' },
        getAuthHeaders(),
      );

      // Use the standard PDF preview pipeline so the result lands in
      // the same preview modal as every other platform PDF.
      const headers = getAuthHeaders().headers || {};
      await openPdfPreview({
        pdfType: 'quickstart_guide',
        title: 'QuickStart Estate Plan Guide',
        subtitle: progress?.data?.state?.state_of_residence || '',
        filename: 'CarryOn_QuickStart_Guide.pdf',
        blobFetcher: async () => {
          const res = await apiClient.post(
            `${API_URL}/quickstart/generate`,
            {},
            { headers, responseType: 'blob', timeout: 90000 },
          );
          return new Blob([res.data], { type: 'application/pdf' });
        },
      });
      // Refresh progress so `complete=true` is reflected and the modal
      // closes on next render.
      await fetchProgress();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not generate your guide. Please try again.');
    }
    setGenerating(false);
  };

  // Modal payload — full-screen, frosted, dashboard visible behind.
  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      data-testid="quickstart-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quickstart-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(8,14,26,0.85)',
          backdropFilter: 'blur(18px) saturate(130%)',
          WebkitBackdropFilter: 'blur(18px) saturate(130%)',
        }}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-2xl mx-3 lg:mx-6 rounded-3xl overflow-hidden flex flex-col"
        style={{
          background: 'var(--card)',
          border: '1px solid rgba(var(--gold-rgb), 0.30)',
          boxShadow: '0 30px 80px -10px rgba(0,0,0,0.7)',
          maxHeight: '92vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'radial-gradient(circle, rgba(var(--gold-rgb),0.22), rgba(var(--gold-rgb),0.08))',
                border: '1px solid rgba(var(--gold-rgb),0.30)',
              }}
            >
              <Sparkles className="w-5 h-5" style={{ color: 'var(--gold)' }} />
            </div>
            <div className="min-w-0">
              <h2
                id="quickstart-title"
                className="text-base lg:text-lg font-bold text-[var(--t)] truncate"
                style={{ fontFamily: 'var(--sans)' }}
              >
                {brand} QuickStart
              </h2>
              <p className="text-xs text-[var(--t5)]">
                Step {currentIdx + 1} of {totalSteps}
              </p>
            </div>
          </div>
          <button
            onClick={skip}
            type="button"
            data-testid="quickstart-skip-x"
            aria-label="Skip for now"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--t4)] active:scale-90 transition-transform"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step progress bar */}
        <div className="px-5 pt-3">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${((currentIdx + 1) / totalSteps) * 100}%`,
                background: 'linear-gradient(90deg, var(--gold), color-mix(in srgb, var(--gold) 50%, transparent))',
              }}
            />
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <QuickStartStep
            stepKey={currentStep}
            data={stepData}
            setData={setStepData}
            user={user}
            brand={brand}
          />
          {error && (
            <p className="mt-3 text-xs text-rose-400" data-testid="quickstart-error">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <button
            type="button"
            onClick={skip}
            data-testid="quickstart-skip-btn"
            className="text-xs lg:text-sm font-bold text-[var(--t4)] hover:text-[var(--t)] transition-colors"
          >
            Skip for now
          </button>
          <div className="flex items-center gap-2">
            {currentIdx > 0 && (
              <button
                type="button"
                onClick={back}
                disabled={saving || generating}
                data-testid="quickstart-back-btn"
                className="inline-flex items-center gap-1.5 px-3 lg:px-4 py-2 rounded-xl text-xs lg:text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-40"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--t)',
                }}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
            {currentStep === 'generate' ? (
              <button
                type="button"
                onClick={generate}
                disabled={generating}
                data-testid="quickstart-generate-btn"
                className="inline-flex items-center gap-2 px-4 lg:px-5 py-2 rounded-xl text-xs lg:text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #d4af37, #b8962e)',
                  color: '#181818',
                  boxShadow: '0 8px 24px rgba(var(--gold-rgb), 0.25)',
                }}
              >
                {generating ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>) : (<><ShieldCheck className="w-3.5 h-3.5" /> Generate my guide</>)}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                disabled={saving || !isStepValid(currentStep, stepData)}
                data-testid="quickstart-next-btn"
                className="inline-flex items-center gap-1.5 px-4 lg:px-5 py-2 rounded-xl text-xs lg:text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #d4af37, #b8962e)',
                  color: '#181818',
                  boxShadow: '0 8px 24px rgba(var(--gold-rgb), 0.25)',
                }}
              >
                {saving ? 'Saving…' : 'Next'} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Render via portal so the modal escapes the `main-content` overlay
  // scrollbar and any z-index stacking inside DashboardLayout.
  return createPortal(modal, document.body);
};

// ─── Step content ─────────────────────────────────────────────────
// Both `isStepValid` and `QuickStartStep` are exported so the public
// Partner-Brief trial page (`/quickstart/try`) can reuse the exact
// same step UI + validation logic without any duplication.
export function isStepValid(stepKey, data) {
  switch (stepKey) {
    case 'welcome':
      return true;
    case 'state':
      return Boolean(data?.state_of_residence);
    case 'household':
      return Boolean(data?.marital_status);
    case 'beneficiaries':
      return Array.isArray(data?.beneficiaries) && data.beneficiaries.length > 0
        && data.beneficiaries.every((b) => b?.name && b?.relationship);
    case 'real_estate':
      return true; // optional
    case 'financial_accounts':
      return true;
    case 'life_insurance':
      return Boolean(data?.status);
    case 'business':
      return Boolean(data?.structure);
    case 'existing_documents':
      return true; // multi-select can be empty
    default:
      return true;
  }
}

const Label = ({ children }) => (
  <label className="block text-xs lg:text-sm font-bold text-[var(--t)] mb-1.5">{children}</label>
);
const inputStyle = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.10)',
  color: 'var(--t)',
};

export const QuickStartStep = ({ stepKey, data, setData, user, brand }) => {
  const set = (k, v) => setData({ ...data, [k]: v });
  const firstName = (user?.first_name || user?.name || '').split(' ')[0] || 'there';

  if (stepKey === 'welcome') {
    return (
      <div className="space-y-4" data-testid="qs-step-welcome">
        <h3 className="text-xl lg:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--serif)' }}>
          Hi {firstName} — let&apos;s get you started.
        </h3>
        <p className="text-sm lg:text-base text-[var(--t4)] leading-relaxed">
          In about two minutes, {brand} will turn what you tell us into a
          one-page guide you can take, verbatim, to your estate attorney, CPA,
          financial advisor, and life-insurance agent.
        </p>
        <p className="text-sm lg:text-base text-[var(--t4)] leading-relaxed">
          No documents to dig up, no jargon. Just a few quick questions about
          where you live, who&apos;s in your family, and what you own.
        </p>
        <div
          className="rounded-2xl p-3 lg:p-4 flex items-start gap-3"
          style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px solid rgba(var(--gold-rgb), 0.20)' }}
        >
          <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
          <p className="text-xs lg:text-sm text-[var(--t4)]">
            Anything you skip can be filled in later. Your answers save as you go — if you log out, you&apos;ll pick up right where you left off.
          </p>
        </div>
      </div>
    );
  }

  if (stepKey === 'state') {
    return (
      <div className="space-y-3" data-testid="qs-step-state">
        <h3 className="text-lg lg:text-xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--serif)' }}>
          Where do you live?
        </h3>
        <p className="text-sm text-[var(--t4)]">
          Estate laws vary state by state. Your state of residence drives every recommendation we make.
        </p>
        <Label>State of residence</Label>
        <div className="relative">
          <select
            value={data?.state_of_residence || ''}
            onChange={(e) => set('state_of_residence', e.target.value)}
            data-testid="qs-state-select"
            className="w-full appearance-none rounded-xl px-3 py-3 text-sm lg:text-base focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
            style={{ ...inputStyle, fontSize: '16px' }}
          >
            <option value="">Choose your state…</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t5)] pointer-events-none" />
        </div>
      </div>
    );
  }

  if (stepKey === 'household') {
    return (
      <div className="space-y-4" data-testid="qs-step-household">
        <h3 className="text-lg lg:text-xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--serif)' }}>About your household</h3>
        <div>
          <Label>Marital status</Label>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {['single','married','partnered','widowed','divorced','separated'].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => set('marital_status', opt)}
                data-testid={`qs-marital-${opt}`}
                className="rounded-xl px-3 py-2.5 text-sm font-bold capitalize transition-all active:scale-[0.97]"
                style={{
                  background: data?.marital_status === opt ? 'rgba(var(--gold-rgb), 0.18)' : 'rgba(255,255,255,0.04)',
                  border: data?.marital_status === opt ? '1px solid rgba(var(--gold-rgb), 0.5)' : '1px solid rgba(255,255,255,0.08)',
                  color: data?.marital_status === opt ? 'var(--gold)' : 'var(--t)',
                }}
              >{opt}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Dependent children</Label>
            <input
              type="number" min="0" max="20"
              value={data?.children_dependent ?? ''}
              onChange={(e) => set('children_dependent', e.target.value === '' ? null : Number(e.target.value))}
              data-testid="qs-children-dep"
              className="w-full rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
              style={{ ...inputStyle, fontSize: '16px' }}
            />
          </div>
          <div>
            <Label>Adult children</Label>
            <input
              type="number" min="0" max="20"
              value={data?.children_adult ?? ''}
              onChange={(e) => set('children_adult', e.target.value === '' ? null : Number(e.target.value))}
              data-testid="qs-children-adult"
              className="w-full rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
              style={{ ...inputStyle, fontSize: '16px' }}
            />
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm text-[var(--t)] cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(data?.special_needs_dependent)}
            onChange={(e) => set('special_needs_dependent', e.target.checked)}
            data-testid="qs-special-needs"
            className="w-5 h-5 rounded accent-[color:var(--gold)]"
          />
          A dependent in my care has special needs (drives special-needs trust guidance).
        </label>
      </div>
    );
  }

  if (stepKey === 'beneficiaries') {
    const beneficiaries = Array.isArray(data?.beneficiaries) ? data.beneficiaries : [];
    const addRow = () => setData({ ...data, beneficiaries: [...beneficiaries, { name: '', relationship: '' }] });
    const updateRow = (idx, field, value) => {
      const next = beneficiaries.map((b, i) => i === idx ? { ...b, [field]: value } : b);
      setData({ ...data, beneficiaries: next });
    };
    const removeRow = (idx) => setData({ ...data, beneficiaries: beneficiaries.filter((_, i) => i !== idx) });
    return (
      <div className="space-y-3" data-testid="qs-step-beneficiaries">
        <h3 className="text-lg lg:text-xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--serif)' }}>Who are your beneficiaries?</h3>
        <p className="text-sm text-[var(--t4)]">
          Just a name and a relationship is enough. We&apos;ll create a tile for each
          person so you can fill in the rest later from Getting Started.
        </p>
        <div className="space-y-2">
          {beneficiaries.length === 0 && (
            <p className="text-xs text-[var(--t5)] italic">No one added yet. Add at least one to continue.</p>
          )}
          {beneficiaries.map((b, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_140px_auto] gap-2 items-center">
              <input
                type="text"
                value={b.name || ''}
                onChange={(e) => updateRow(idx, 'name', e.target.value)}
                placeholder="Full name"
                data-testid={`qs-ben-name-${idx}`}
                className="rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
                style={{ ...inputStyle, fontSize: '16px' }}
              />
              <select
                value={b.relationship || ''}
                onChange={(e) => updateRow(idx, 'relationship', e.target.value)}
                data-testid={`qs-ben-rel-${idx}`}
                className="rounded-xl px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
                style={{ ...inputStyle, fontSize: '16px' }}
              >
                <option value="">Relationship…</option>
                {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button
                type="button"
                onClick={() => removeRow(idx)}
                data-testid={`qs-ben-remove-${idx}`}
                aria-label="Remove"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--t4)] hover:text-rose-400"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              ><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          data-testid="qs-ben-add"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-[var(--gold)] transition-all active:scale-[0.97]"
          style={{ background: 'rgba(var(--gold-rgb), 0.08)', border: '1px solid rgba(var(--gold-rgb), 0.25)' }}
        >
          <ChevronRight className="w-3.5 h-3.5" /> Add a beneficiary
        </button>
      </div>
    );
  }

  if (stepKey === 'real_estate') {
    return (
      <div className="space-y-3" data-testid="qs-step-real_estate">
        <h3 className="text-lg lg:text-xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--serif)' }}>Real estate</h3>
        <p className="text-sm text-[var(--t4)]">Quick counts only — no addresses needed here.</p>
        <label className="flex items-center gap-3 text-sm text-[var(--t)] cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(data?.primary_residence)}
            onChange={(e) => set('primary_residence', e.target.checked)}
            data-testid="qs-re-primary"
            className="w-5 h-5 rounded accent-[color:var(--gold)]"
          />
          I own my primary residence.
        </label>
        <div>
          <Label>Additional properties (rentals, vacation, land)</Label>
          <input
            type="number" min="0" max="50"
            value={data?.additional_count ?? ''}
            onChange={(e) => set('additional_count', e.target.value === '' ? null : Number(e.target.value))}
            data-testid="qs-re-additional"
            className="w-full rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
            style={{ ...inputStyle, fontSize: '16px' }}
          />
        </div>
        <label className="flex items-center gap-3 text-sm text-[var(--t)] cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(data?.multi_state)}
            onChange={(e) => set('multi_state', e.target.checked)}
            data-testid="qs-re-multistate"
            className="w-5 h-5 rounded accent-[color:var(--gold)]"
          />
          At least one property is in a different state than my residence.
        </label>
      </div>
    );
  }

  if (stepKey === 'financial_accounts') {
    const keys = [
      ['checking_savings', 'Checking / Savings'],
      ['brokerage', 'Brokerage / Investments'],
      ['retirement', 'Retirement (401(k), IRA, etc.)'],
      ['hsa', 'HSA / FSA'],
      ['crypto', 'Crypto / Digital assets'],
    ];
    return (
      <div className="space-y-3" data-testid="qs-step-financial_accounts">
        <h3 className="text-lg lg:text-xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--serif)' }}>Financial accounts</h3>
        <p className="text-sm text-[var(--t4)]">Just check what applies — no amounts.</p>
        <div className="space-y-2">
          {keys.map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 text-sm text-[var(--t)] cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(data?.[k])}
                onChange={(e) => set(k, e.target.checked)}
                data-testid={`qs-fa-${k}`}
                className="w-5 h-5 rounded accent-[color:var(--gold)]"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (stepKey === 'life_insurance') {
    return (
      <div className="space-y-3" data-testid="qs-step-life_insurance">
        <h3 className="text-lg lg:text-xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--serif)' }}>Life insurance</h3>
        <p className="text-sm text-[var(--t4)]">Do you carry a life-insurance policy?</p>
        <div className="grid grid-cols-3 gap-2">
          {['yes','no','unsure'].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => set('status', opt)}
              data-testid={`qs-li-${opt}`}
              className="rounded-xl px-3 py-3 text-sm font-bold capitalize transition-all active:scale-[0.97]"
              style={{
                background: data?.status === opt ? 'rgba(var(--gold-rgb), 0.18)' : 'rgba(255,255,255,0.04)',
                border: data?.status === opt ? '1px solid rgba(var(--gold-rgb), 0.5)' : '1px solid rgba(255,255,255,0.08)',
                color: data?.status === opt ? 'var(--gold)' : 'var(--t)',
              }}
            >{opt}</button>
          ))}
        </div>
      </div>
    );
  }

  if (stepKey === 'business') {
    const opts = [
      ['none','None'],['sole_prop','Sole Proprietorship'],['llc','LLC'],
      ['s_corp','S-Corp'],['c_corp','C-Corp'],['partnership','Partnership'],['multiple','Multiple Entities'],
    ];
    return (
      <div className="space-y-3" data-testid="qs-step-business">
        <h3 className="text-lg lg:text-xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--serif)' }}>Business ownership</h3>
        <p className="text-sm text-[var(--t4)]">Do you own all or part of a business?</p>
        <div className="grid grid-cols-2 gap-2">
          {opts.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => set('structure', k)}
              data-testid={`qs-biz-${k}`}
              className="rounded-xl px-3 py-3 text-sm font-bold transition-all active:scale-[0.97] text-left"
              style={{
                background: data?.structure === k ? 'rgba(var(--gold-rgb), 0.18)' : 'rgba(255,255,255,0.04)',
                border: data?.structure === k ? '1px solid rgba(var(--gold-rgb), 0.5)' : '1px solid rgba(255,255,255,0.08)',
                color: data?.structure === k ? 'var(--gold)' : 'var(--t)',
              }}
            >{label}</button>
          ))}
        </div>
      </div>
    );
  }

  if (stepKey === 'existing_documents') {
    const opts = [
      ['will','Will'],['revocable_trust','Revocable Trust'],['irrevocable_trust','Irrevocable Trust'],
      ['durable_poa','Durable Power of Attorney'],['healthcare_directive','Healthcare Directive / Living Will'],
      ['hipaa_release','HIPAA Release'],['guardianship_designation','Guardianship Designation'],
    ];
    const current = Array.isArray(data?.documents) ? data.documents : [];
    const toggle = (k) => {
      if (current.includes(k)) setData({ ...data, documents: current.filter((x) => x !== k) });
      else setData({ ...data, documents: [...current, k] });
    };
    return (
      <div className="space-y-3" data-testid="qs-step-existing_documents">
        <h3 className="text-lg lg:text-xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--serif)' }}>What do you already have?</h3>
        <p className="text-sm text-[var(--t4)]">Tap any documents you&apos;ve already executed.</p>
        <div className="grid grid-cols-1 gap-2">
          {opts.map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 text-sm text-[var(--t)] cursor-pointer">
              <input
                type="checkbox"
                checked={current.includes(k)}
                onChange={() => toggle(k)}
                data-testid={`qs-doc-${k}`}
                className="w-5 h-5 rounded accent-[color:var(--gold)]"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (stepKey === 'generate') {
    return (
      <div className="space-y-3" data-testid="qs-step-generate">
        <h3 className="text-lg lg:text-xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--serif)' }}>You&apos;re ready.</h3>
        <p className="text-sm text-[var(--t4)] leading-relaxed">
          Tap <strong>Generate my guide</strong> and {brand} will hand you a one-page
          checklist tailored to your state, your family, and what you own. Take it,
          verbatim, to your estate attorney, CPA, financial advisor, and life-insurance
          agent — and start the conversation already informed.
        </p>
        <p className="text-xs text-[var(--t5)] italic">
          This usually takes 10-30 seconds. The guide opens in a preview where you can
          download or print it, and it&apos;s automatically saved to your Estate Binder.
        </p>
      </div>
    );
  }

  return null;
};

export default QuickStartWizard;
