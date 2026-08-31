/**
 * QuickStartTrialPage
 * ───────────────────────────────────────────────────────────────────
 * Public, no-auth anonymous trial of the QuickStart Wizard.
 * Mounted at `/quickstart/try` and linked from the Partner Brief
 * "Try it on your own household" CTA so a B2B prospect can feel
 * the platform before signing up.
 *
 * Flow:
 *   • Walk the same 10 wizard steps as the authenticated wizard
 *     (UI + validation reused verbatim from `QuickStartWizard.js`).
 *   • Progress lives in `sessionStorage` only — never hits the
 *     server until the final POST.
 *   • Last step replaces "Generate" with a small form: Name + Email
 *     → POST `/api/partner-brief/try-quickstart` → backend calls
 *     Grok, renders the PDF, emails it via Resend, captures the
 *     lead, and streams the PDF back inline so we can show it on
 *     the success screen.
 *   • Rate-limited per-IP + platform-wide on the backend (see
 *     `routes/partner_brief.py::_check_try_rate_limit`).
 */
import React, { useState } from 'react';
import SEO from '../components/SEO';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail, Sparkles, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../config';
import { isStepValid, QuickStartStep, STEPS } from '../components/QuickStartWizard';

const TRIAL_STORAGE_KEY = 'carryon_quickstart_trial_v1';

const loadTrial = () => {
  try { return JSON.parse(sessionStorage.getItem(TRIAL_STORAGE_KEY) || '{}'); }
  catch { return {}; }
};
const saveTrial = (obj) => {
  try { sessionStorage.setItem(TRIAL_STORAGE_KEY, JSON.stringify(obj)); }
  catch { /* private mode */ }
};

export default function QuickStartTrialPage() {
  // Per-step blobs keyed by step key (matches the authenticated
  // wizard's server-side `data.<step>` shape so the same backend
  // prompt builder works on this payload too).
  const [trial, setTrial] = useState(() => loadTrial());
  // Skip the "Is estate planning new to you?" gate — the user has
  // already self-selected by clicking "Try it on your own household"
  // on the Partner Brief, so the gate would be a useless click here.
  const [currentIdx, setCurrentIdx] = useState(() => Math.max(0, STEPS.indexOf('welcome')));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [name, setName] = useState(() => loadTrial()._name || '');
  const [email, setEmail] = useState(() => loadTrial()._email || '');

  const currentStep = STEPS[currentIdx];
  const totalSteps = STEPS.length;

  const stepData = trial[currentStep] || {};
  const setStepData = (next) => {
    const merged = { ...trial, [currentStep]: next };
    setTrial(merged);
    saveTrial({ ...merged, _name: name, _email: email });
  };

  const go = (delta) => {
    // Floor at the welcome step — never let the trial page back into
    // the authenticated wizard's gate step.
    const minIdx = Math.max(0, STEPS.indexOf('welcome'));
    const nextIdx = Math.min(STEPS.length - 1, Math.max(minIdx, currentIdx + delta));
    setCurrentIdx(nextIdx);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!email.trim()) { setError('Please enter your email so we can send your guide.'); return; }
    setSubmitting(true);
    setError('');
    saveTrial({ ...trial, _name: name, _email: email });
    try {
      // Strip the `_name` / `_email` keys before sending — backend only
      // wants the per-step data blob.
      const dataPayload = Object.fromEntries(
        Object.entries(trial).filter(([k]) => !k.startsWith('_')),
      );
      const res = await axios.post(
        `${API_URL}/partner-brief/try-quickstart`,
        { name, email, data: dataPayload },
        { responseType: 'blob', timeout: 90000 },
      );
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      setSuccess({
        emailSent: res.headers?.['x-carryon-email-sent'] === '1',
        blobUrl,
      });
      // Clear the per-step blob but keep name/email in storage so a
      // refresh doesn't lose the inline preview confirmation.
      saveTrial({ _name: name, _email: email, _completed: true });
      setTrial({});
    } catch (e) {
      let detail = e?.message || 'Could not generate your guide. Please try again.';
      // Axios blob-responses surface server JSON errors as a Blob,
      // so we have to read the blob back to surface the actual detail.
      try {
        const blobErr = e?.response?.data;
        if (blobErr && typeof blobErr.text === 'function') {
          const txt = await blobErr.text();
          try { detail = JSON.parse(txt).detail || detail; } catch { detail = txt || detail; }
        }
      } catch { /* fall through to generic message */ }
      setError(detail);
    }
    setSubmitting(false);
  };

  // ── Success view — full-bleed confirmation + inline PDF preview ──
  if (success) {
    return (
      <div data-testid="qs-trial-success" style={{ minHeight: '100vh', background: 'var(--bg)', color: '#E5E7EB' }}>
        <SEO title="QuickStart Trial — CarryOn" description="Try the CarryOn QuickStart experience." path="/quickstart/try" noindex />
        <TrialTopBar />
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px', textAlign: 'center' }}>
          <CheckCircle2 className="mx-auto" style={{ width: 56, height: 56, color: '#d4af37' }} />
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 38, lineHeight: 1.1, fontWeight: 600, color: '#F8FAFC', margin: '18px 0 8px 0' }}>
            Your QuickStart Guide is ready, {name.split(' ')[0]}.
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#94A3B8', margin: '0 0 22px 0' }}>
            {success.emailSent
              ? `We just emailed a PDF copy to ${email}. The same guide is below — feel free to print, share, or take it straight to your professionals.`
              : `Your guide is below — you can download or print it from the preview. (Email delivery isn't enabled on this environment yet, but the PDF is yours to save.)`}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
            <a
              href={success.blobUrl}
              download="CarryOn_QuickStart_Guide.pdf"
              data-testid="qs-trial-download"
              style={{ padding: '11px 22px', borderRadius: 10, fontSize: 14, fontWeight: 700, background: 'linear-gradient(135deg,#d4af37,#b8962e)', color: '#080e1a', textDecoration: 'none', boxShadow: '0 8px 24px rgba(212,175,55,0.25)' }}
            >
              Download PDF
            </a>
            <Link
              to="/partner-brief"
              style={{ padding: '11px 22px', borderRadius: 10, fontSize: 14, fontWeight: 700, background: 'transparent', color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.18)', textDecoration: 'none' }}
            >
              Back to Partner Brief
            </Link>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(var(--gold-rgb), 0.2)', borderRadius: 14, padding: 4, height: 720 }}>
            <iframe
              title="Your QuickStart Guide"
              src={success.blobUrl}
              data-testid="qs-trial-pdf-iframe"
              style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12, background: '#fff' }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Final-step form (replaces the wizard's "Generate" button) ──
  const renderFinalStep = () => (
    <div data-testid="qs-trial-final" style={{ display: 'grid', gap: 14 }}>
      <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, lineHeight: 1.15, fontWeight: 600, color: '#F8FAFC', margin: 0 }}>You&rsquo;re ready.</h3>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: '#CBD5E1', margin: 0 }}>
        Tell us where to send your guide. We&rsquo;ll generate a state-aware, family-tailored checklist you can
        take, verbatim, to your estate attorney, CPA, financial advisor, and life-insurance agent.
      </p>
      <div>
        <label style={labelStyle}>Your name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="qs-trial-name"
          placeholder="Full name"
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="qs-trial-email"
          placeholder="you@example.com"
          style={inputStyle}
        />
      </div>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: 12,
        borderRadius: 12,
        background: 'rgba(var(--gold-rgb), 0.06)',
        border: '1px solid rgba(var(--gold-rgb), 0.20)',
      }}>
        <ShieldCheck style={{ width: 18, height: 18, color: '#d4af37', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 12, color: '#CBD5E1', margin: 0, lineHeight: 1.5 }}>
          We use this only to send your guide and follow up if you&rsquo;d like a partnership conversation. No spam,
          no unrelated emails. The AI runs on the founder&rsquo;s own xAI key — no third-party access to your data.
        </p>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        data-testid="qs-trial-submit"
        style={{
          marginTop: 8,
          padding: '12px 22px',
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 700,
          background: 'linear-gradient(135deg,#d4af37,#b8962e)',
          color: '#080e1a',
          border: 'none',
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.7 : 1,
          boxShadow: '0 10px 30px rgba(212,175,55,0.25)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {submitting ? (<><Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> Generating your guide…</>) : (<><Mail style={{ width: 16, height: 16 }} /> Email me my guide</>)}
      </button>
    </div>
  );

  return (
    <div data-testid="qs-trial-page" style={{ minHeight: '100vh', background: 'var(--bg)', color: '#E5E7EB' }}>
      <SEO title="QuickStart Trial — CarryOn" description="Try the CarryOn QuickStart experience." path="/quickstart/try" noindex />
      <TrialTopBar />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 60px' }}>
        {/* Trial banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
          padding: '10px 14px', borderRadius: 999,
          background: 'rgba(var(--gold-rgb), 0.08)',
          border: '1px solid rgba(var(--gold-rgb), 0.25)',
          maxWidth: 'fit-content',
        }}>
          <Sparkles style={{ width: 16, height: 16, color: '#d4af37' }} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: '#d4af37' }}>
            Anonymous trial &mdash; no sign-up required
          </span>
        </div>
        {/* Progress bar */}
        <div style={{ marginBottom: 4, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94A3B8' }}>
          Step {currentIdx + 1} of {totalSteps}
        </div>
        <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 24 }}>
          <div style={{
            height: '100%',
            width: `${((currentIdx + 1) / totalSteps) * 100}%`,
            background: 'linear-gradient(90deg, #d4af37, rgba(212,175,55,0.5))',
            transition: 'width 0.4s',
          }} />
        </div>

        {/* Step body */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          padding: '22px 22px 26px',
        }}>
          {currentStep === 'generate' ? renderFinalStep() : (
            <QuickStartStep
              stepKey={currentStep}
              data={stepData}
              setData={setStepData}
              user={{ first_name: name.split(' ')[0] || 'there' }}
              brand="CarryOn"
            />
          )}
          {error && (
            <p data-testid="qs-trial-error" style={{ marginTop: 14, fontSize: 13, color: '#fb7185' }}>{error}</p>
          )}
        </div>

        {/* Nav row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={currentIdx === 0 || submitting}
            data-testid="qs-trial-back"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: 'rgba(255,255,255,0.05)', color: '#E5E7EB',
              border: '1px solid rgba(255,255,255,0.10)',
              cursor: currentIdx === 0 ? 'not-allowed' : 'pointer',
              opacity: currentIdx === 0 ? 0.4 : 1,
            }}
          ><ArrowLeft style={{ width: 14, height: 14 }} /> Back</button>
          {currentStep !== 'generate' && (
            <button
              type="button"
              onClick={() => go(1)}
              disabled={!isStepValid(currentStep, stepData)}
              data-testid="qs-trial-next"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                background: 'linear-gradient(135deg,#d4af37,#b8962e)', color: '#080e1a',
                border: 'none',
                cursor: isStepValid(currentStep, stepData) ? 'pointer' : 'not-allowed',
                opacity: isStepValid(currentStep, stepData) ? 1 : 0.4,
                boxShadow: '0 8px 24px rgba(212,175,55,0.2)',
              }}
            >Next <ArrowRight style={{ width: 14, height: 14 }} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

function TrialTopBar() {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(15,22,41,0.92)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(var(--gold-rgb), 0.18)',
    }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Link to="/partner-brief" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: '#d4af37' }}>CarryOn<span style={{ fontSize: 12, verticalAlign: 'top' }}>™</span></span>
          <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94A3B8' }}>QuickStart Trial</span>
        </Link>
        <Link
          to="/partner-brief"
          data-testid="qs-trial-exit"
          style={{ fontSize: 12, color: '#94A3B8', textDecoration: 'none', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }}
        >
          Exit trial
        </Link>
      </div>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: '#F8FAFC', marginBottom: 6, letterSpacing: '0.02em' };
const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.10)',
  color: '#F8FAFC',
  fontSize: 16,
  outline: 'none',
};
