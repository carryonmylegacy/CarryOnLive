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
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Loader2, Minus, Plus, ShieldCheck, Sparkles, X } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { API_URL } from '../config';
import { useAuth, useBrand } from '../contexts/AuthContext';
import { openPdfPreview } from '../utils/openPdfPreview';
import AddressAutocomplete from './AddressAutocomplete';

const STEPS = [
  'gate', 'welcome', 'residence', 'household',
  'properties', 'life_insurance', 'business', 'existing_documents',
  'generate',
];
// Re-exported so the public Partner-Brief trial page (which is not
// authenticated) can reuse the same step list / validation / UI without
// duplicating any copy. Keep these in lockstep.
export { STEPS };

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
  // dismissal AND refetch progress — the wizard's internal `progress`
  // state may be stale (e.g. the user previously completed the wizard
  // and then hit Edit & regenerate on the dashboard, which flipped
  // server-side `complete` from true → false; without a refetch the
  // wizard's local copy still says complete=true and shouldRender
  // returns null, making the Resume button feel "dead").
  useEffect(() => {
    if (forceOpen) {
      try { sessionStorage.removeItem(SESSION_SKIP_KEY); } catch { /* ignore */ }
      setDismissedThisSession(false);
      if (eligible) fetchProgress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpen]);

  const fetchProgress = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API_URL}/quickstart/progress`, getAuthHeaders());
      setProgress(res.data);
      let cur = res.data?.current_step || 'gate';
      // Backwards compat — older sessions may still point at a step
      // key that has since been removed (financial_accounts) or renamed
      // (state → residence, real_estate → properties). Snap them to the
      // start of the wizard so the user never lands on a dead step.
      if (!STEPS.includes(cur)) cur = 'gate';
      // Honour the "I'm familiar — don't bother me again" gate answer.
      // If the user previously tapped "No" we never re-open automatically
      // (the Dashboard Resume CTA can still force it open manually).
      if (res.data?.data?.gate?.familiar === 'familiar' && !forceOpen) {
        setDismissedThisSession(true);
      }
      stepIdxRef.current = Math.max(0, STEPS.indexOf(cur));
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

  // ── "Use what I already have" loading state ──────────────────────
  // MUST be declared before the early `if (!shouldRender) return null`
  // below so React's Hook order stays consistent across renders.
  // (eslint rules-of-hooks blocks the push if this is below the
  // early-return.)
  const [useExistingLoading, setUseExistingLoading] = useState(false);

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

  // ── Skip behavior ────────────────────────────────────────────────
  // Founder mandate (Feb 27 2026): the footer "Skip" should advance
  // to the NEXT wizard step, not eject the user back to the
  // dashboard. The wizard exit is the X in the top-right (which still
  // calls `exitWizard`). Only on the terminal `generate` step does
  // skipping mean "leave without generating" — the wizard has no
  // further step to advance to.
  const exitWizard = () => {
    try { sessionStorage.setItem(SESSION_SKIP_KEY, '1'); } catch { /* ignore */ }
    setDismissedThisSession(true);
    onClose();
  };
  // Skip the current step without writing any data for it. Advances
  // to the next step. On the last step, falls back to `exitWizard`.
  const skipStep = async () => {
    if (currentStep === 'generate') { exitWizard(); return; }
    const idx = STEPS.indexOf(currentStep);
    const nextKey = STEPS[Math.min(STEPS.length - 1, idx + 1)];
    if (nextKey === currentStep) { exitWizard(); return; }
    setSaving(true);
    setError('');
    try {
      // Persist an empty data blob for this step + advance. Server
      // dedupes — empty data for an already-saved step is a no-op.
      const res = await apiClient.put(
        `${API_URL}/quickstart/step/${currentStep}`,
        { data: {}, next_step: nextKey },
        getAuthHeaders(),
      );
      setProgress(res.data);
      const savedForNext = res.data?.data?.[nextKey] || {};
      setStepData(savedForNext);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not skip this step.');
    }
    setSaving(false);
  };

  // ── "Use what I already have" — pre-fill the current step from
  // existing platform records (beneficiaries page, settings, etc.)
  // so the wizard never creates a duplicate tile when the user has
  // already entered the same data manually. Each handler:
  //   1. Fetches the right platform endpoint.
  //   2. Reshapes the response into the wizard's stepData schema.
  //   3. Calls setStepData — the user then reviews and presses Next.
  // Steps without a matching platform source omit the button.
  // (The `useExistingLoading` state lives above the early-return so
  // Hook order is stable; only the handler closure lives here.)
  const useExistingData = async () => {
    if (useExistingLoading) return;
    setUseExistingLoading(true);
    setError('');
    try {
      if (currentStep === 'household') {
        // Merged household + beneficiaries page (May 26 2026). Pull
        // marital status from /auth/me AND existing beneficiaries
        // from /api/beneficiaries — populate both into one step blob.
        const [meRes, bensRes] = await Promise.all([
          apiClient.get(`${API_URL}/auth/me`, getAuthHeaders()),
          apiClient.get(`${API_URL}/beneficiaries`, getAuthHeaders()),
        ]);
        const u = meRes.data || {};
        const list = Array.isArray(bensRes.data) ? bensRes.data : (bensRes.data?.beneficiaries || []);
        const next = { ...stepData };
        if (u.marital_status) next.marital_status = u.marital_status;
        const mapped = list
          .filter((b) => (b.name || b.first_name))
          .map((b) => ({
            beneficiary_id: b.id,
            name: b.name || [b.first_name, b.last_name].filter(Boolean).join(' ') || b.first_name || 'Beneficiary',
            relationship: b.relation || b.relationship || '',
            age: typeof b.age === 'number' ? b.age : (b.age || ''),
          }));
        if (mapped.length > 0) next.beneficiaries = mapped;
        if (!u.marital_status && mapped.length === 0) {
          setError('No household details or beneficiaries on file yet — fill them in below.');
          return;
        }
        setStepData(next);
      } else if (currentStep === 'residence') {
        const res = await apiClient.get(`${API_URL}/auth/me`, getAuthHeaders());
        const u = res.data || {};
        const next = {
          ...stepData,
          street: u.address_street || '',
          line2: u.address_line2 || '',
          city: u.address_city || '',
          state: u.address_state || '',
          zip: u.address_zip || '',
        };
        if (!u.address_street || !u.address_state) {
          setError('No saved address on file yet — enter it below.');
          return;
        }
        setStepData(next);
      } else if (currentStep === 'business') {
        // Pull existing CES entities so the wizard reflects the user's
        // actual org chart (founder May 25 2026: CES is where most
        // users will actually input their entities, so QW should
        // mirror CES — not the other way around).
        const estatesRes = await apiClient.get(`${API_URL}/estates`, getAuthHeaders());
        const estate = Array.isArray(estatesRes.data) ? estatesRes.data[0] : estatesRes.data;
        if (!estate?.id) { setError('No estate found.'); return; }
        const r = await apiClient.get(`${API_URL}/financial/entities/${estate.id}`, getAuthHeaders());
        const allEnts = r.data?.entities || [];
        // Map every CES entity type → QW business-step bucket.
        // The QW step only knows 8 broad buckets; CES has ~20 types,
        // so several CES types collapse into one QW bucket (e.g. all
        // partnership variants → `limited_partnership` if any of LP /
        // FLP / LLP / LLLP, else `partnership`).
        const CES_TO_QW = {
          sole_prop: 'sole_prop',
          gen_partnership: 'partnership',
          lp: 'limited_partnership',
          flp: 'limited_partnership',
          llp: 'limited_partnership',
          lllp: 'limited_partnership',
          llc: 'llc',
          pllc: 'llc',
          l3c: 'llc',
          c_corp: 'c_corp',
          s_corp: 's_corp',
          pc: 'c_corp',
          b_corp: 'c_corp',
          close_corp: 'c_corp',
          cooperative: 'c_corp',
        };
        const counts = {};
        allEnts.forEach((e) => {
          // category: businesses + specialized (holding co's, captive
          // insurance, family office, SPV — all map to holding_company
          // QW bucket) + charity (nonprofit). Trusts + properties are
          // their own QW concerns and have separate steps; we don't
          // mix them into the business counts.
          if (e.category === 'business') {
            const bucket = CES_TO_QW[e.type] || 'llc';
            counts[bucket] = (counts[bucket] || 0) + 1;
          } else if (e.category === 'specialized') {
            counts['holding_company'] = (counts['holding_company'] || 0) + 1;
          } else if (e.category === 'charity') {
            counts['nonprofit'] = (counts['nonprofit'] || 0) + 1;
          }
        });
        if (Object.keys(counts).length === 0) {
          setError('No businesses on file in your Entity Structure yet — add them below.');
          return;
        }
        setStepData({ ...stepData, counts, types: Object.keys(counts), none: false });
      } else if (currentStep === 'properties') {
        // Pull every CES tile flagged as a property and create one QW
        // property row per tile. The CES doesn't capture a full street
        // address on its property tiles (just `name` + `formation_state`)
        // so we map name → address-label and formation_state → state.
        // The user can fill the rest in if they want extra fidelity.
        const estatesRes = await apiClient.get(`${API_URL}/estates`, getAuthHeaders());
        const estate = Array.isArray(estatesRes.data) ? estatesRes.data[0] : estatesRes.data;
        if (!estate?.id) { setError('No estate found.'); return; }
        const r = await apiClient.get(`${API_URL}/financial/entities/${estate.id}`, getAuthHeaders());
        const props = (r.data?.entities || []).filter((e) => e.category === 'property');
        if (props.length === 0) {
          setError('No property tiles in your Entity Structure yet — add them below.');
          return;
        }
        const list = props.map((p) => ({
          kind: 'other',
          street: '',
          line2: '',
          city: '',
          state: p.formation_state || '',
          zip: '',
          address: p.name || '',
        }));
        setStepData({ ...stepData, list });
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not pull your existing data.');
    } finally {
      setUseExistingLoading(false);
    }
  };
  // Which steps offer the "Use what I already have" shortcut.
  const stepsWithExistingFetch = new Set(['residence', 'household', 'properties', 'business']);
  const showUseExistingButton = stepsWithExistingFetch.has(currentStep);

  const skip = exitWizard; // legacy alias used by the top-right X handler

  // Handles the gate Yes/No buttons. Persists the choice server-side
  // and, when the user picks "I'm familiar," immediately closes the
  // modal without nagging — they can still open it from the Dashboard
  // Resume CTA whenever they want.
  const handleGateChoice = async (choice) => {
    setSaving(true);
    setError('');
    try {
      const nextStep = choice === 'new' ? 'welcome' : 'gate';
      const res = await apiClient.put(
        `${API_URL}/quickstart/step/gate`,
        { data: { familiar: choice }, next_step: nextStep },
        getAuthHeaders(),
      );
      setProgress(res.data);
      if (choice === 'familiar') {
        // Mark dismissed for the session; the Resume CTA stays on the
        // dashboard so they can come back at any time.
        try { sessionStorage.setItem(SESSION_SKIP_KEY, '1'); } catch { /* ignore */ }
        setDismissedThisSession(true);
        try { window.dispatchEvent(new CustomEvent('carryon:quickstart-progress-changed')); }
        catch { /* ignore */ }
        onClose();
      } else {
        setStepData(res.data?.data?.welcome || {});
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not save your choice.');
    }
    setSaving(false);
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
      // Tell the rest of the app (Dashboard tile, etc.) that QW state
      // changed so they can refetch and switch from the Resume CTA
      // over to the "Your guide is ready" tile.
      try { window.dispatchEvent(new CustomEvent('carryon:quickstart-progress-changed')); }
      catch { /* ignore */ }
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
      {/* Backdrop — lighter overlay (founder mandate May 22 2026:
          modal was reading "too dark and somber"). Softer veil so
          the dashboard glimmers through and the modal feels uplifted
          rather than funereal. */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(15,28,52,0.55)',
          backdropFilter: 'blur(14px) saturate(140%)',
          WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        }}
      />

      {/* Card — warmer navy gradient with a gold sheen, matching the
          LandingContent pillar cards. Brighter than the prior flat
          #0F172A which read as funereal. */}
      <div
        className="relative w-full max-w-2xl mx-3 lg:mx-6 rounded-3xl overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(160deg, #1f3055 0%, #1d2c4f 45%, #20355e 100%)',
          border: '1px solid rgba(212,175,55,0.55)',
          boxShadow: '0 30px 80px -10px rgba(0,0,0,0.55), 0 0 80px rgba(212,175,55,0.10), inset 0 1px 0 rgba(255,255,255,0.06)',
          maxHeight: '92vh',
          color: '#F8FAFC',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.10)' }}
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
                className="text-base lg:text-lg font-bold truncate"
                style={{ fontFamily: 'var(--sans)', color: '#F8FAFC' }}
              >
                {brand} QuickStart
              </h2>
              <p className="text-xs" style={{ color: '#CBD5E1' }}>
                Step {currentIdx + 1} of {totalSteps}
              </p>
            </div>
          </div>
          <button
            onClick={skip}
            type="button"
            data-testid="quickstart-skip-x"
            aria-label="Skip for now"
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: 'rgba(255,255,255,0.10)', color: '#F8FAFC', border: '1px solid rgba(255,255,255,0.18)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step progress bar */}
        <div className="px-5 pt-3">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.10)' }}>
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${((currentIdx + 1) / totalSteps) * 100}%`,
                background: 'linear-gradient(90deg, #d4af37, #b8962e)',
              }}
            />
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5" style={{ color: '#F8FAFC' }}>
          {showUseExistingButton && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={useExistingData}
                disabled={useExistingLoading || saving || generating}
                data-testid="quickstart-use-existing-btn"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] lg:text-xs font-bold transition-all active:scale-[0.97] disabled:opacity-50"
                style={{
                  background: 'rgba(34,201,147,0.14)',
                  border: '1px solid rgba(34,201,147,0.55)',
                  color: '#86efac',
                }}
                title="Pre-fill this step from data you've already entered elsewhere in CarryOn"
              >
                {useExistingLoading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Pulling…</>
                  : <><Sparkles className="w-3.5 h-3.5" /> Use what I already have</>}
              </button>
            </div>
          )}
          <QuickStartStep
            stepKey={currentStep}
            data={stepData}
            setData={setStepData}
            user={user}
            brand={brand}
            allData={progress?.data || {}}
            onGateChoice={(choice) => handleGateChoice(choice)}
          />
          {error && (
            <p className="mt-3 text-xs" style={{ color: '#fca5a5' }} data-testid="quickstart-error">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.10)' }}
        >
          <button
            type="button"
            onClick={skipStep}
            disabled={saving || generating}
            data-testid="quickstart-skip-btn"
            className="text-xs lg:text-sm font-bold transition-colors disabled:opacity-50"
            style={{ color: '#CBD5E1' }}
            title="Skip this step and go to the next one"
          >
            {currentStep === 'generate' ? 'Skip for now' : 'Skip this step'}
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
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: '#F8FAFC',
                }}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
            {currentStep === 'gate' ? null : currentStep === 'generate' ? (
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
    case 'gate':
      return Boolean(data?.familiar);
    case 'welcome':
      return true;
    case 'residence':
      // Either a Google-Places-selected full address (street+state) OR a
      // bare state pick is enough to drive jurisdictional tailoring.
      return Boolean(data?.state) && data.state.length === 2;
    case 'household':
      // Merged household + beneficiaries page (May 26 2026). Require
      // marital status AND at least one named beneficiary with a
      // relationship picked. Age is optional.
      return Boolean(data?.marital_status)
        && Array.isArray(data?.beneficiaries)
        && data.beneficiaries.length > 0
        && data.beneficiaries.every((b) => b?.name && b?.relationship);
    case 'properties':
      return true; // optional — many users rent or own nothing
    case 'life_insurance':
      return data?.policy_count !== undefined && data?.policy_count !== null && data.policy_count >= 0;
    case 'business':
      // Multi-select: either "none" is explicitly checked OR at least
      // one entity type is selected.
      if (data?.none === true) return true;
      return Array.isArray(data?.types) && data.types.length > 0;
    case 'existing_documents':
      return true; // anything goes — counts default to 0
    default:
      return true;
  }
}

const Label = ({ children }) => (
  <label className="block text-xs lg:text-sm font-bold mb-1.5" style={{ color: '#F8FAFC' }}>{children}</label>
);
const inputStyle = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.18)',
  color: '#F8FAFC',
};

// ── Step button styles — extracted because every step reuses them. ──
const pillButtonStyle = (selected) => ({
  background: selected ? 'rgba(212,175,55,0.22)' : 'rgba(255,255,255,0.07)',
  border: selected ? '1px solid rgba(212,175,55,0.65)' : '1px solid rgba(255,255,255,0.18)',
  color: selected ? '#FCD34D' : '#F8FAFC',
});
const headingStyle = { color: '#F8FAFC', fontFamily: 'var(--serif)' };
const bodyStyle = { color: '#E5E7EB' };
const mutedStyle = { color: '#CBD5E1' };

const _STATE_LIST = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];
const _RELS = [
  'Spouse','Partner','Son','Daughter','Mother','Father','Brother','Sister',
  'Grandson','Granddaughter','Grandmother','Grandfather','Aunt','Uncle',
  'Niece','Nephew','Friend','Charity','Other',
];
const _ENTITY_TYPES = [
  ['sole_prop','Sole Proprietorship'],['llc','LLC'],
  ['s_corp','S-Corp'],['c_corp','C-Corp'],
  ['partnership','Partnership'],['limited_partnership','Limited Partnership'],
  ['nonprofit','Nonprofit / 501(c)'],['holding_company','Holding Company'],
];

export const QuickStartStep = ({ stepKey, data, setData, user, brand, allData, onGateChoice }) => {
  const set = (k, v) => setData({ ...data, [k]: v });
  const firstName = (user?.first_name || user?.name || '').split(' ')[0] || 'there';

  // ── 0. Gate: Is estate planning new to you? ──────────────────────
  if (stepKey === 'gate') {
    return (
      <div className="space-y-5" data-testid="qs-step-gate">
        <h3 className="text-xl lg:text-2xl font-bold" style={headingStyle}>
          Is estate planning new to you?
        </h3>
        <p className="text-sm lg:text-base leading-relaxed" style={bodyStyle}>
          If you&apos;ve never sat down with an attorney about a will or trust, {brand} QuickStart
          will help you arrive at one prepared. If you already have your plan in place,
          you&apos;re welcome to use QuickStart as a refresher — but you don&apos;t need to.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            data-testid="qs-gate-new"
            onClick={() => onGateChoice && onGateChoice('new')}
            className="rounded-2xl px-5 py-5 text-left transition-all active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #d4af37, #b8962e)',
              color: '#181818',
              boxShadow: '0 10px 30px rgba(212,175,55,0.25)',
              border: 'none',
            }}
          >
            <div className="text-lg font-bold mb-1">Yes &mdash; walk me through it</div>
            <div className="text-xs opacity-80">~2 minutes. Ends with a printable, professional-prep checklist.</div>
          </button>
          <button
            type="button"
            data-testid="qs-gate-familiar"
            onClick={() => onGateChoice && onGateChoice('familiar')}
            className="rounded-2xl px-5 py-5 text-left transition-all active:scale-[0.98]"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: '#F8FAFC',
              border: '1px solid rgba(255,255,255,0.20)',
            }}
          >
            <div className="text-lg font-bold mb-1">No &mdash; I&apos;m familiar</div>
            <div className="text-xs" style={mutedStyle}>Skip straight to your dashboard. QuickStart is always available from there.</div>
          </button>
        </div>
      </div>
    );
  }

  // ── 1. Welcome ─────────────────────────────────────────────────────
  if (stepKey === 'welcome') {
    return (
      <div className="space-y-4" data-testid="qs-step-welcome">
        <h3 className="text-xl lg:text-2xl font-bold" style={headingStyle}>
          Hi {firstName} — let&apos;s get you started.
        </h3>
        <p className="text-sm lg:text-base leading-relaxed" style={bodyStyle}>
          In about two minutes, {brand} will turn what you tell us into a one-page guide
          you can take, verbatim, to your estate attorney, CPA, financial advisor, and
          life-insurance agent.
        </p>
        <p className="text-sm lg:text-base leading-relaxed" style={bodyStyle}>
          No documents to dig up, no jargon. Just a few quick questions about where you
          live, who&apos;s in your family, and what you own.
        </p>
        <div
          className="rounded-2xl p-4 flex items-start gap-3"
          style={{ background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.35)' }}
        >
          <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#FCD34D' }} />
          <p className="text-xs lg:text-sm" style={mutedStyle}>
            Anything you skip can be filled in later. Your answers save as you go — if you log out,
            you&apos;ll pick up right where you left off.
          </p>
        </div>
      </div>
    );
  }

  // ── 2. Residence (Google Places autocomplete) ─────────────────────
  if (stepKey === 'residence') {
    const onAddressSelect = ({ street, city, state, zip }) => {
      setData({
        ...data,
        address: [street, city].filter(Boolean).join(', '),
        street: street || '',
        city: city || '',
        state: state || data?.state || '',
        zip: zip || '',
      });
    };
    return (
      <div className="space-y-3" data-testid="qs-step-residence">
        <h3 className="text-lg lg:text-xl font-bold" style={headingStyle}>Where do you live?</h3>
        <p className="text-sm" style={mutedStyle}>
          Estate laws vary state by state. Start typing your home address and pick the
          match — we&apos;ll fill in the city, state, and ZIP automatically. (You can leave
          the address blank and just choose a state if you&apos;d rather.)
        </p>
        <Label>Personal residence</Label>
        {/* Field set mirrors the Settings → Personal Info → Address layout
            (Feb 26 2026 founder direction) so any full address captured
            here propagates 1:1 onto the user profile without a second
            entry pass in Settings. */}
        <AddressAutocomplete
          /* Display rule (Feb 26 2026 bug fix): once `data.street`
             has been touched at all, it becomes the single source of
             truth — including the empty string. The previous `||`
             fallback to `data.address` made backspace impossible
             because clearing the street to '' fell through to the
             legacy combined-address blob. */
          value={data && 'street' in data ? (data.street || '') : (((data?.address && data.address !== '[object Object]') ? data.address : ''))}
          onChange={(e) => set('street', typeof e === 'string' ? e : (e?.target?.value ?? ''))}
          onSelect={onAddressSelect}
          placeholder="Street address"
          className="w-full rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
          style={{ ...inputStyle, fontSize: '16px' }}
          data-testid="qs-residence-street"
        />
        <input
          value={data?.line2 || ''}
          onChange={(e) => set('line2', e.target.value)}
          placeholder="Apt, suite, unit (optional)"
          className="w-full rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
          style={{ ...inputStyle, fontSize: '16px' }}
          data-testid="qs-residence-line2"
        />
        <div className="grid grid-cols-4 gap-2">
          <div className="col-span-2">
            <input
              value={data?.city || ''}
              onChange={(e) => set('city', e.target.value)}
              placeholder="City"
              className="w-full rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
              style={{ ...inputStyle, fontSize: '16px' }}
              data-testid="qs-residence-city"
            />
          </div>
          <div className="relative">
            <select
              value={data?.state || ''}
              onChange={(e) => set('state', e.target.value)}
              data-testid="qs-residence-state"
              className="w-full appearance-none rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
              style={{ ...inputStyle, fontSize: '16px' }}
            >
              <option value="" style={{ color: '#0F172A' }}>State</option>
              {_STATE_LIST.map((s) => <option key={s} value={s} style={{ color: '#0F172A' }}>{s}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#CBD5E1' }} />
          </div>
          <div>
            <input
              value={data?.zip || ''}
              onChange={(e) => set('zip', e.target.value.replace(/[^0-9-]/g, '').slice(0, 10))}
              placeholder="ZIP"
              inputMode="numeric"
              className="w-full rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
              style={{ ...inputStyle, fontSize: '16px' }}
              data-testid="qs-residence-zip"
            />
          </div>
        </div>
        {/* Tenure pills (Feb 26 2026 founder direction). The Quickstart
            used to silently assume the residence was an owned asset,
            then the next step asked about "OTHER" properties — which
            misleads renters into thinking step 5 means "in addition
            to my home". Asking own/rent/other here lets us reword
            step 5 + tell Grok the truth so the guide is accurate. */}
        <div className="pt-1">
          <Label>Do you own or rent this home?</Label>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['own', 'I own it'],
              ['rent', 'I rent'],
              ['other', 'Other'],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => set('tenure', k)}
                data-testid={`qs-residence-tenure-${k}`}
                className="rounded-xl px-2 py-2.5 text-sm font-bold transition-all active:scale-[0.97]"
                style={pillButtonStyle(data?.tenure === k)}
              >
                {label}
              </button>
            ))}
          </div>
          {data?.tenure === 'other' && (
            <p className="text-xs mt-1.5" style={mutedStyle}>
              No problem — pick &quot;Other&quot; for situations like living with family,
              corporate housing, or a residence held in trust.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── 3. Household ───────────────────────────────────────────────────
  if (stepKey === 'household') {
    // Merged household + beneficiaries page (May 26 2026 founder
    // direction): marital status at the top, then the named-people
    // list with an optional age field. Minor/adult is DERIVED from
    // age — the AI summary counts age<18 as a minor and age>=18
    // (or blank, default to adult) as an adult, eliminating the
    // double-counting bug that surfaced when the wizard asked for
    // "X dependent children + X adult children" separately.
    const beneficiaries = Array.isArray(data?.beneficiaries) ? data.beneficiaries : [];
    const addRow = () => setData({ ...data, beneficiaries: [...beneficiaries, { name: '', relationship: '', age: '' }] });
    const updateRow = (idx, field, value) => setData({ ...data, beneficiaries: beneficiaries.map((b, i) => i === idx ? { ...b, [field]: value } : b) });
    const removeRow = (idx) => setData({ ...data, beneficiaries: beneficiaries.filter((_, i) => i !== idx) });
    return (
      <div className="space-y-4" data-testid="qs-step-household">
        <h3 className="text-lg lg:text-xl font-bold" style={headingStyle}>About your household</h3>
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
                style={pillButtonStyle(data?.marital_status === opt)}
              >{opt}</button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Beneficiaries — name, relationship, and age</Label>
          <p className="text-xs" style={mutedStyle}>
            Just a name, a relationship, and the person&apos;s age. Age lets us
            tell which children are minors vs. adults without double-counting.
            We&apos;ll create a tile for each person so you can fill the rest
            in later from Getting Started.
          </p>
          {beneficiaries.length === 0 && (
            <p className="text-xs italic pt-1" style={mutedStyle}>No one added yet. Add at least one to continue.</p>
          )}
          {beneficiaries.map((b, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_80px_auto] gap-2 sm:items-center">
              <input
                type="text" value={b.name || ''} onChange={(e) => updateRow(idx, 'name', e.target.value)}
                placeholder="Full name" data-testid={`qs-ben-name-${idx}`}
                className="rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#d4af37] min-w-0"
                style={{ ...inputStyle, fontSize: '16px' }}
              />
              <select
                value={b.relationship || ''} onChange={(e) => updateRow(idx, 'relationship', e.target.value)}
                data-testid={`qs-ben-rel-${idx}`}
                className="rounded-xl px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#d4af37] min-w-0"
                style={{ ...inputStyle, fontSize: '16px' }}
              >
                <option value="" style={{ color: '#0F172A' }}>Relationship…</option>
                {_RELS.map((r) => <option key={r} value={r} style={{ color: '#0F172A' }}>{r}</option>)}
              </select>
              <input
                type="number" min="0" max="120" inputMode="numeric"
                value={b.age ?? ''}
                onChange={(e) => updateRow(idx, 'age', e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Age"
                data-testid={`qs-ben-age-${idx}`}
                className="rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#d4af37] min-w-0"
                style={{ ...inputStyle, fontSize: '16px' }}
                aria-label="Age (optional)"
              />
              <button
                type="button" onClick={() => removeRow(idx)} data-testid={`qs-ben-remove-${idx}`}
                aria-label="Remove"
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 justify-self-end sm:justify-self-auto"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#FCA5A5', border: '1px solid rgba(255,255,255,0.15)' }}
              ><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <button
          type="button" onClick={addRow} data-testid="qs-ben-add"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all active:scale-[0.97]"
          style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.45)', color: '#FCD34D' }}
        ><ChevronRight className="w-3.5 h-3.5" /> Add a beneficiary</button>
        <label className="flex items-center gap-3 text-sm cursor-pointer pt-2" style={bodyStyle}>
          <input
            type="checkbox"
            checked={Boolean(data?.special_needs_dependent)}
            onChange={(e) => set('special_needs_dependent', e.target.checked)}
            data-testid="qs-special-needs"
            className="w-5 h-5 rounded accent-[#d4af37]"
          />
          A dependent in my care has special needs (drives special-needs trust guidance).
        </label>
      </div>
    );
  }

  // (Standalone "beneficiaries" step retired May 26 2026 — folded into
  // the merged Household page above so age-derived minor/adult counts
  // never get double-counted alongside named children.)

  // ── 5. Properties (multi-add with Google Places + per-property state) ──
  if (stepKey === 'properties') {
    const list = Array.isArray(data?.list) ? data.list : [];
    // Read the residence tenure picked one step back so we can phrase
    // this step correctly (Feb 26 2026 founder direction): renters and
    // "other" arrangements never had a "first" owned property, so the
    // word "Other" up top is misleading for them.
    const tenure = (allData?.residence?.tenure || 'own');
    const headline = tenure === 'own'
      ? 'Other properties you own'
      : 'Properties you own';
    const blurb = tenure === 'own'
      ? `Add any properties beyond your personal residence — rentals, vacation homes, land, anything that's in your name. State matters (out-of-state property drives ancillary probate). The full street/city/ZIP is optional — adding it lets your guide reference each property by name. Leave this blank if there are none.`
      : `You told us you don't own where you live — that's fine. List any real estate you DO own in your name: a rental, vacation home, land, etc. State matters (out-of-state property drives ancillary probate). The full street/city/ZIP is optional — adding it lets your guide reference each property by name. Leave this blank if you own no real estate.`;
    const addRow = () => setData({ ...data, list: [...list, { street: '', line2: '', city: '', state: '', zip: '', address: '', kind: 'other' }] });
    const updateRow = (idx, patch) => setData({ ...data, list: list.map((p, i) => i === idx ? { ...p, ...patch } : p) });
    const removeRow = (idx) => setData({ ...data, list: list.filter((_, i) => i !== idx) });
    return (
      <div className="space-y-3" data-testid="qs-step-properties">
        <h3 className="text-lg lg:text-xl font-bold" style={headingStyle}>{headline}</h3>
        <p className="text-sm" style={mutedStyle}>{blurb}</p>
        <div className="space-y-3">
          {list.map((p, idx) => (
            <div key={idx} className="space-y-2 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" style={mutedStyle}>Property {idx + 1}</span>
                <button
                  type="button" onClick={() => removeRow(idx)} data-testid={`qs-prop-remove-${idx}`}
                  aria-label="Remove" className="w-7 h-7 rounded-md flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#FCA5A5' }}
                ><X className="w-3.5 h-3.5" /></button>
              </div>
              <select
                value={p.kind || 'other'} onChange={(e) => updateRow(idx, { kind: e.target.value })}
                data-testid={`qs-prop-kind-${idx}`}
                className="w-full rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
                style={{ ...inputStyle, fontSize: '16px' }}
              >
                {[['vacation','Vacation / second home'],['rental','Rental property'],['land','Vacant land'],['commercial','Commercial property'],['other','Other']].map(([k, label]) => (
                  <option key={k} value={k} style={{ color: '#0F172A' }}>{label}</option>
                ))}
              </select>
              {/* Full address — mirrors the residence step + Settings layout.
                  Optional; if filled the guide PDF prints each property
                  with its full street address for greater fidelity. */}
              <AddressAutocomplete
                /* Same backspace-trap fix as the residence step:
                   once `p.street` has been touched, it's the single
                   source of truth — empty included. */
                value={p && 'street' in p ? (p.street || '') : (((p.address && p.address !== '[object Object]') ? p.address : ''))}
                onChange={(e) => updateRow(idx, { street: typeof e === 'string' ? e : (e?.target?.value ?? '') })}
                onSelect={({ street, city, state, zip }) => updateRow(idx, {
                  street: street || '',
                  city: city || p.city || '',
                  state: state || p.state || '',
                  zip: zip || p.zip || '',
                  address: [street, city].filter(Boolean).join(', '),
                })}
                placeholder="Street address (optional)"
                className="w-full rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
                style={{ ...inputStyle, fontSize: '16px' }}
                data-testid={`qs-prop-street-${idx}`}
              />
              <input
                value={p.line2 || ''}
                onChange={(e) => updateRow(idx, { line2: e.target.value })}
                placeholder="Apt, suite, unit (optional)"
                className="w-full rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
                style={{ ...inputStyle, fontSize: '16px' }}
                data-testid={`qs-prop-line2-${idx}`}
              />
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-2">
                  <input
                    value={p.city || ''}
                    onChange={(e) => updateRow(idx, { city: e.target.value })}
                    placeholder="City"
                    className="w-full rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
                    style={{ ...inputStyle, fontSize: '16px' }}
                    data-testid={`qs-prop-city-${idx}`}
                  />
                </div>
                <div className="relative">
                  <select
                    value={p.state || ''} onChange={(e) => updateRow(idx, { state: e.target.value })}
                    data-testid={`qs-prop-state-${idx}`}
                    className="w-full appearance-none rounded-xl px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
                    style={{ ...inputStyle, fontSize: '16px' }}
                  >
                    <option value="" style={{ color: '#0F172A' }}>State</option>
                    {_STATE_LIST.map((s) => <option key={s} value={s} style={{ color: '#0F172A' }}>{s}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#CBD5E1' }} />
                </div>
                <div>
                  <input
                    value={p.zip || ''}
                    onChange={(e) => updateRow(idx, { zip: e.target.value.replace(/[^0-9-]/g, '').slice(0, 10) })}
                    placeholder="ZIP"
                    inputMode="numeric"
                    className="w-full rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
                    style={{ ...inputStyle, fontSize: '16px' }}
                    data-testid={`qs-prop-zip-${idx}`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button" onClick={addRow} data-testid="qs-prop-add"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all active:scale-[0.97]"
          style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.45)', color: '#FCD34D' }}
        ><ChevronRight className="w-3.5 h-3.5" /> Add a property</button>
      </div>
    );
  }

  // ── 6. Life Insurance — number of policies ────────────────────────
  if (stepKey === 'life_insurance') {
    return (
      <div className="space-y-3" data-testid="qs-step-life_insurance">
        <h3 className="text-lg lg:text-xl font-bold" style={headingStyle}>Life insurance</h3>
        <p className="text-sm" style={mutedStyle}>
          How many active life-insurance policies do you carry? (Term, whole, group through work — all count.)
        </p>
        <Label>Number of policies</Label>
        <input
          type="number" min="0" max="20"
          value={data?.policy_count ?? ''}
          onChange={(e) => set('policy_count', e.target.value === '' ? null : Number(e.target.value))}
          data-testid="qs-li-count"
          className="w-full rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
          style={{ ...inputStyle, fontSize: '16px' }}
        />
        <label className="flex items-center gap-3 text-sm cursor-pointer pt-1" style={bodyStyle}>
          <input
            type="checkbox" checked={Boolean(data?.unsure)} onChange={(e) => set('unsure', e.target.checked)}
            data-testid="qs-li-unsure"
            className="w-5 h-5 rounded accent-[#d4af37]"
          />
          I&apos;m not sure how many I have (we&apos;ll flag this for the insurance-agent conversation).
        </label>
      </div>
    );
  }

  // ── 7. Business — MULTI-SELECT entity types + per-type count ──────
  if (stepKey === 'business') {
    const types = Array.isArray(data?.types) ? data.types : [];
    const counts = (data?.counts && typeof data.counts === 'object') ? data.counts : {};
    const isNone = data?.none === true;
    const toggle = (k) => {
      if (types.includes(k)) {
        const nextCounts = { ...counts };
        delete nextCounts[k];
        setData({ ...data, types: types.filter((t) => t !== k), counts: nextCounts, none: false });
      } else {
        setData({ ...data, types: [...types, k], counts: { ...counts, [k]: counts[k] || 1 }, none: false });
      }
    };
    const setCount = (k, raw) => {
      const v = raw === '' ? '' : Math.max(1, Math.min(50, Number(raw) || 1));
      setData({ ...data, counts: { ...counts, [k]: v } });
    };
    const bumpCount = (k, delta) => {
      const cur = Number(counts[k] ?? 1) || 1;
      const next = Math.max(1, Math.min(50, cur + delta));
      setData({ ...data, counts: { ...counts, [k]: next } });
    };
    const toggleNone = () => setData({ none: !isNone, types: [], counts: {} });
    return (
      <div className="space-y-3" data-testid="qs-step-business">
        <h3 className="text-lg lg:text-xl font-bold" style={headingStyle}>Business ownership</h3>
        <p className="text-sm" style={mutedStyle}>
          Select every entity type you own all or part of. Use the −/+ steppers on the right to set how
          many you have of each (e.g. two LLCs).
        </p>
        <button
          type="button" onClick={toggleNone} data-testid="qs-biz-none"
          className="w-full rounded-xl px-3 py-3 text-sm font-bold transition-all active:scale-[0.98] text-left"
          style={pillButtonStyle(isNone)}
        >None — I don&apos;t own a business</button>
        <div className="grid grid-cols-1 gap-2">
          {_ENTITY_TYPES.map(([k, label]) => {
            const selected = types.includes(k);
            const stepperDisabled = isNone || !selected;
            const curCount = selected ? Number(counts[k] ?? 1) : '';
            return (
              <div key={k} className="grid grid-cols-[1fr_124px] gap-2 items-stretch">
                <button
                  type="button" onClick={() => toggle(k)} data-testid={`qs-biz-${k}`}
                  disabled={isNone}
                  className="rounded-xl px-3 py-3 text-sm font-bold transition-all active:scale-[0.97] text-left disabled:opacity-40"
                  style={pillButtonStyle(selected)}
                >{label}</button>
                {/* Stepper widget (Feb 26 2026): tap −/+ to nudge the
                    count without needing to pop the keyboard. The
                    middle slot is still a numeric input for power
                    users who'd rather type. Disabled state mirrors
                    the pill column. */}
                <div
                  className="flex items-stretch rounded-xl overflow-hidden"
                  style={{
                    ...inputStyle,
                    padding: 0,
                    opacity: stepperDisabled ? 0.4 : 1,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => bumpCount(k, -1)}
                    disabled={stepperDisabled || curCount <= 1}
                    data-testid={`qs-biz-count-${k}-dec`}
                    aria-label={`Decrease ${label}`}
                    className="px-3 flex items-center justify-center active:scale-[0.92] disabled:opacity-40"
                    style={{
                      borderRight: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(212,175,55,0.18)',
                      color: '#FCD34D',
                    }}
                  >
                    <Minus className="w-5 h-5" strokeWidth={3} />
                  </button>
                  <input
                    type="number" min="1" max="50"
                    value={selected ? (counts[k] ?? 1) : ''}
                    onChange={(e) => setCount(k, e.target.value)}
                    disabled={stepperDisabled}
                    placeholder="#"
                    inputMode="numeric"
                    aria-label={`How many ${label}`}
                    data-testid={`qs-biz-count-${k}`}
                    className="flex-1 min-w-0 text-center font-bold focus:outline-none bg-transparent"
                    style={{ fontSize: '16px', color: 'inherit' }}
                  />
                  <button
                    type="button"
                    onClick={() => bumpCount(k, +1)}
                    disabled={stepperDisabled || curCount >= 50}
                    data-testid={`qs-biz-count-${k}-inc`}
                    aria-label={`Increase ${label}`}
                    className="px-3 flex items-center justify-center active:scale-[0.92] disabled:opacity-40"
                    style={{
                      borderLeft: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(212,175,55,0.18)',
                      color: '#FCD34D',
                    }}
                  >
                    <Plus className="w-5 h-5" strokeWidth={3} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 8. Existing documents — counts per type ───────────────────────
  if (stepKey === 'existing_documents') {
    const counts = data?.counts || {};
    const setCount = (k, v) => setData({ ...data, counts: { ...counts, [k]: v } });
    const bumpDocCount = (k, delta) => {
      const cur = Number(counts[k] ?? 0) || 0;
      const next = Math.max(0, Math.min(20, cur + delta));
      setData({ ...data, counts: { ...counts, [k]: next } });
    };
    const flags = Array.isArray(data?.flags) ? data.flags : [];
    const toggleFlag = (k) => setData({
      ...data, flags: flags.includes(k) ? flags.filter((f) => f !== k) : [...flags, k]
    });
    return (
      <div className="space-y-3" data-testid="qs-step-existing_documents">
        <h3 className="text-lg lg:text-xl font-bold" style={headingStyle}>What do you already have?</h3>
        <p className="text-sm" style={mutedStyle}>
          Most people have multiple of these — be exact where you can. Use the −/+
          steppers to nudge the count without popping the keyboard. Leave any at 0 if
          you don&apos;t have one.
        </p>
        <div className="space-y-2">
          {[['wills','Wills'],['trusts','Trusts (revocable, irrevocable, charitable…)'],['policies_business','Buy-sell / business succession agreements']].map(([k, label]) => {
            const curCount = Number(counts[k] ?? 0) || 0;
            return (
              <div key={k} className="grid grid-cols-[1fr_124px] gap-3 items-center">
                <span className="text-sm" style={bodyStyle}>{label}</span>
                {/* Stepper widget matches the business-step pattern.
                    Floor is 0 (vs 1 in business) because "I have zero
                    wills" is a legitimate answer here. */}
                <div
                  className="flex items-stretch rounded-xl overflow-hidden h-[44px]"
                  style={{ ...inputStyle, padding: 0 }}
                >
                  <button
                    type="button"
                    onClick={() => bumpDocCount(k, -1)}
                    disabled={curCount <= 0}
                    data-testid={`qs-doc-count-${k}-dec`}
                    aria-label={`Decrease ${label}`}
                    className="px-3 flex items-center justify-center active:scale-[0.92] disabled:opacity-40"
                    style={{
                      borderRight: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(212,175,55,0.18)',
                      color: '#FCD34D',
                    }}
                  >
                    <Minus className="w-5 h-5" strokeWidth={3} />
                  </button>
                  <input
                    type="number" min="0" max="20"
                    value={counts[k] ?? ''}
                    onChange={(e) => setCount(k, e.target.value === '' ? null : Number(e.target.value))}
                    placeholder="0"
                    inputMode="numeric"
                    aria-label={`How many ${label}`}
                    data-testid={`qs-doc-count-${k}`}
                    className="flex-1 min-w-0 text-center font-bold focus:outline-none bg-transparent"
                    style={{ fontSize: '16px', color: 'inherit' }}
                  />
                  <button
                    type="button"
                    onClick={() => bumpDocCount(k, +1)}
                    disabled={curCount >= 20}
                    data-testid={`qs-doc-count-${k}-inc`}
                    aria-label={`Increase ${label}`}
                    className="px-3 flex items-center justify-center active:scale-[0.92] disabled:opacity-40"
                    style={{
                      borderLeft: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(212,175,55,0.18)',
                      color: '#FCD34D',
                    }}
                  >
                    <Plus className="w-5 h-5" strokeWidth={3} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs pt-1" style={mutedStyle}>Check anything else you already have in place:</p>
        <div className="grid grid-cols-1 gap-2">
          {[['durable_poa','Durable Power of Attorney'],['healthcare_directive','Healthcare Directive / Living Will'],['hipaa_release','HIPAA Release'],['guardianship_designation','Guardianship Designation']].map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 text-sm cursor-pointer" style={bodyStyle}>
              <input
                type="checkbox" checked={flags.includes(k)} onChange={() => toggleFlag(k)}
                data-testid={`qs-doc-${k}`}
                className="w-5 h-5 rounded accent-[#d4af37]"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  // ── 9. Generate ───────────────────────────────────────────────────
  if (stepKey === 'generate') {
    return (
      <div className="space-y-3" data-testid="qs-step-generate">
        <h3 className="text-lg lg:text-xl font-bold" style={headingStyle}>You&apos;re ready.</h3>
        <p className="text-sm leading-relaxed" style={bodyStyle}>
          Tap <strong>Generate my guide</strong> and {brand} will hand you a one-page
          checklist tailored to your state, your family, and what you own. Take it,
          verbatim, to your estate attorney, CPA, financial advisor, and life-insurance
          agent — and start the conversation already informed.
        </p>
        <p className="text-xs italic" style={mutedStyle}>
          This usually takes 10-30 seconds. The guide opens in a preview where you can
          download or print it, and it&apos;s automatically saved to your Estate Binder.
        </p>
      </div>
    );
  }

  return null;
};

export default QuickStartWizard;
