import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Mail, Lock, Eye, EyeOff, Loader2, ArrowLeft, ArrowRight,
  AlertCircle, CheckSquare, Shield, ChevronRight, User,
  Briefcase, Sparkles,
  Users, Check, Heart, Award
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { toast } from '../utils/toast';
import DateMaskInput from '../components/DateMaskInput';
import apiClient from '../utils/apiClient';
import { API_URL } from '../config';

const suffixOptions = [
  { value: 'none', label: 'None' },
  { value: 'Jr.', label: 'Jr.' },
  { value: 'Sr.', label: 'Sr.' },
  { value: 'II', label: 'II' },
  { value: 'III', label: 'III' },
  { value: 'IV', label: 'IV' },
  { value: 'V', label: 'V' },
  { value: 'Esq.', label: 'Esq.' },
  { value: 'MD', label: 'MD' },
  { value: 'PhD', label: 'PhD' },
];

const genderOptions = [
  { value: 'not_selected', label: 'Select...' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const _maritalOptions = [
  { value: 'not_selected', label: 'Select...' },
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'domestic_partnership', label: 'Domestic Partnership' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'separated', label: 'Separated' },
];

const _usStates = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

// Steps are computed dynamically based on form state
const _beneficiaryRelations = ['Spouse', 'Son', 'Daughter', 'Son-in-law', 'Daughter-in-law', 'Mother', 'Father', 'Mother-in-law', 'Father-in-law', 'Brother', 'Sister', 'Aunt', 'Uncle', 'Grandson', 'Granddaughter', 'Grandmother', 'Grandfather', 'Nephew', 'Niece', 'Great-Grandson', 'Great-Granddaughter', 'Great-Grandmother', 'Great-Grandfather', 'Friend', 'Other'];

const inputClass = "h-14 px-4 bg-[#0b1322] border border-[#1a2a42] text-white text-base placeholder:text-[#2d3d55] focus:border-[#d4af37] focus:ring-1 focus:ring-inset focus:ring-[#d4af37]/30 focus:outline-none rounded-xl w-full";
const selectClass = "h-14 bg-[#0b1322] border-[#1a2a42] text-white text-base rounded-xl [&>span]:text-white";

const SignupPage = () => {
  const navigate = useNavigate();
  const { verifyOtp, resendOtp } = useAuth();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState('right');
  const [slidePhase, setSlidePhase] = useState('idle'); // 'idle' | 'exit' | 'enter'
  const [_emailErrors, setEmailErrors] = useState({});
  const [entered, setEntered] = useState(false);
  const scrollRef = useRef(null);

  // ─── Enterprise / B2B partner code (final signup tile) ──────────
  // Stashed by `/p/:slug` partner landing page in localStorage so the
  // visitor sees their code prefilled at the end of signup. Account
  // is already created + token is already stored before this tile
  // appears, so `/partners/redeem-code` (auth-required) just works.
  const [partnerCodeInput, setPartnerCodeInput] = useState('');
  const [partnerLandingCompany, setPartnerLandingCompany] = useState('');
  const [partnerLandingLogo, setPartnerLandingLogo] = useState('');
  const [applyingPartnerCode, setApplyingPartnerCode] = useState(false);
  const [partnerCodeError, setPartnerCodeError] = useState('');
  const [partnerCodeApplied, setPartnerCodeApplied] = useState(null);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('none');
  const [gender, setGender] = useState('not_selected');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [maritalStatus, _setMaritalStatus] = useState('not_selected');
  const [dependentsOver18, _setDependentsOver18] = useState(0);
  const [dependentsUnder18, _setDependentsUnder18] = useState(0);
  const [addressStreet, _setAddressStreet] = useState('');
  const [addressCity, _setAddressCity] = useState('');
  const [addressState, _setAddressState] = useState('');
  const [addressZip, _setAddressZip] = useState('');
  const [_role, _setRole] = useState('benefactor'); // Always benefactor — beneficiaries join via invitation
  const [specialStatus, setSpecialStatus] = useState([]);
  const [b2bCodeSignup, setB2bCodeSignup] = useState('');
  const [addressLine2, _setAddressLine2] = useState('');
  const [beneficiaries, setBeneficiaries] = useState([]); // [{first_name, last_name, email, dob, same_address, address_street, address_city, address_state, address_zip}]
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);

  // Compute age from DOB
  const userAge = dateOfBirth ? Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const isMinor = userAge !== null && userAge < 18;

  const isNewAdult = userAge !== null && userAge >= 18 && userAge <= 25;

  // Generate beneficiary slots based on marital status + dependents (or parents for new adults)
  useEffect(() => {
    const slots = [];
    if (isNewAdult) {
      // New adults: prompt to add parents, not dependents
      slots.push({ relation: 'Parent / Guardian 1', requireEmail: true });
      slots.push({ relation: 'Parent / Guardian 2', requireEmail: true });
    } else {
      if (maritalStatus === 'married' || maritalStatus === 'domestic_partnership') {
        slots.push({ relation: 'Spouse', requireEmail: true });
      }
      for (let i = 0; i < dependentsOver18; i++) {
        slots.push({ relation: `Adult Beneficiary ${i + 1}`, requireEmail: true });
      }
      for (let i = 0; i < dependentsUnder18; i++) {
        slots.push({ relation: `Minor Beneficiary ${i + 1}`, requireEmail: false });
      }
    }
    // Preserve existing data, add new slots, trim excess
    setBeneficiaries(prev => {
      const updated = slots.map((slot, idx) => ({
        ...slot,
        first_name: prev[idx]?.first_name || '',
        middle_name: prev[idx]?.middle_name || '',
        last_name: prev[idx]?.last_name || '',
        email: prev[idx]?.email || '',
        dob: prev[idx]?.dob || '',
        gender: prev[idx]?.gender || '',
        same_address: prev[idx]?.same_address !== undefined ? prev[idx].same_address : true,
        address_street: prev[idx]?.address_street || '',
        address_line2: prev[idx]?.address_line2 || '',
        address_city: prev[idx]?.address_city || '',
        address_state: prev[idx]?.address_state || '',
        address_zip: prev[idx]?.address_zip || '',
      }));
      return updated;
    });
  }, [maritalStatus, dependentsOver18, dependentsUnder18, isNewAdult]);

  // Dynamic steps — beneficiaries join via invitation only, no role selection needed
  //
  // The eligibility (Military/First Responder/Hospice/B2B Code) and
  // partner_code tiles are MUTUALLY EXCLUSIVE based on arrival path:
  //
  //   • Landed via /p/<slug>  → SKIP eligibility, SHOW partner_code
  //                             (their discount is already negotiated
  //                             through the partner — picking a
  //                             category would be redundant/confusing)
  //
  //   • Direct CarryOn signup → SHOW eligibility, SKIP partner_code
  //                             (eligibility's "B2B Code" category is
  //                             the on-ramp for self-found B2B codes;
  //                             a second dedicated tile would be a
  //                             duplicate UX)
  //
  // We read the WL marker straight from localStorage. It's a one-shot
  // sync read — cheap on every render and avoids a useState round-trip
  // that would briefly flash the wrong step set on first paint.
  const computeSteps = () => {
    const arrivedViaPartnerLanding = (() => {
      try { return !!localStorage.getItem('cy_partner_slug'); } catch { return false; }
    })();

    const steps = [
      { id: 'name', label: 'About You', icon: User },
    ];
    if (isMinor) {
      // Under 18: show blocked message, no further steps
      steps.push({ id: 'minor_blocked', label: 'Invitation Required', icon: Users });
      return steps;
    }
    // Benefactor flow (all direct signups are benefactors)
    if (!arrivedViaPartnerLanding) {
      // Standard signup — show the Military/First Responder/Hospice/
      // B2B-Code chooser. This is where self-found B2B codes get
      // entered.
      steps.push({ id: 'eligibility', label: 'Eligibility', icon: Shield });
    }
    steps.push({ id: 'credentials', label: 'Login', icon: Lock });
    if (arrivedViaPartnerLanding) {
      // White-label arrival — show the dedicated, pre-populated
      // enterprise-code tile as the closing step. Sits after
      // credentials because /partners/redeem-code is auth-required.
      steps.push({ id: 'partner_code', label: 'Enterprise Code', icon: Briefcase });
    }
    return steps;
  };

  const STEPS = computeSteps();
  const currentStep = STEPS[step] || STEPS[0];
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 150);
    return () => clearTimeout(t);
  }, []);

  // On mount, hydrate the partner-code tile from anything the visitor
  // stashed when they hit `/p/:slug`. We attempt up to two sources:
  //   1. `cy_partner_code` — set if the visitor explicitly typed/saw
  //      the code on the partner landing page (future-proofing).
  //   2. `cy_partner_slug` — set unconditionally on partner-page load;
  //      we re-fetch the public partner blob to surface the company
  //      name so the "wrong code? confirm with X" error tile is
  //      personalized even before they enter anything.
  useEffect(() => {
    try {
      const stashedCode = localStorage.getItem('cy_partner_code');
      if (stashedCode) setPartnerCodeInput(stashedCode);
      const stashedSlug = localStorage.getItem('cy_partner_slug');
      if (stashedSlug) {
        apiClient.get(`${API_URL}/public/partners/${stashedSlug}`)
          .then(r => {
            setPartnerLandingCompany(r.data?.company_name || '');
            setPartnerLandingLogo(r.data?.logo_data_url || '');
          })
          .catch(() => { /* partner deactivated since landing — silent */ });
      }
    } catch { /* private mode → skip */ }
  }, []);

  const goTo = (nextStep) => {
    if (slidePhase !== 'idle' || nextStep === step) return;
    setDirection(nextStep > step ? 'right' : 'left');
    setSlidePhase('exit');
    setTimeout(() => {
      setStep(nextStep);
      setSlidePhase('enter');
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setTimeout(() => setSlidePhase('idle'), 350);
    }, 300);
  };

  const canAdvance = () => {
    const sid = currentStep?.id;
    if (sid === 'name') {
      if (!firstName.trim() || !lastName.trim()) return false;
      return true;
    }
    if (sid === 'minor_blocked') {
      return false; // Cannot proceed — must be invited
    }
    if (sid === 'eligibility') {
      if (specialStatus.includes('enterprise') && !b2bCodeSignup.trim()) return false;
      return true;
    }
    if (sid === 'credentials') return email.trim() && username.trim() && !usernameError && !usernameChecking && password.length >= 8 && password === confirmPassword && smsConsent;
    if (sid === 'partner_code') {
      // Advance is always allowed — the button morphs to "Apply",
      // "Skip", or "Continue" depending on input state. The handler
      // decides what to do on click.
      return true;
    }
    return false;
  };

  const handleNext = () => {
    if (!canAdvance()) {
      const sid = currentStep?.id;
      if (sid === 'name') {
        if (!firstName.trim() || !lastName.trim()) toast.error('Please enter your first and last name');
      }
      if (sid === 'minor_blocked') {
        toast.error('Under 18? Ask your family member to invite you from their CarryOn account.');
      }
      if (sid === 'eligibility' && specialStatus.includes('enterprise') && !b2bCodeSignup.trim()) toast.error('Please enter your partner access code');
      if (sid === 'credentials') {
        if (!email.trim()) toast.error('Please enter your email');
        else if (!username.trim()) toast.error('Please choose a username');
        else if (usernameError) toast.error(usernameError);
        else if (password.length < 8) toast.error('Password must be at least 8 characters');
        else if (password !== confirmPassword) toast.error('Passwords do not match');
        else if (!smsConsent) toast.error('Please agree to the terms to continue');
      }
      return;
    }
    // Credentials step → create the account. We DON'T advance the
    // visible step here — handleSignup does it after the token is
    // in localStorage so the final partner_code tile can call the
    // auth-required `/partners/redeem-code`.
    if (currentStep?.id === 'credentials') {
      handleSignup();
      return;
    }
    // Partner-code step → submit or skip.
    if (currentStep?.id === 'partner_code') {
      handlePartnerCodeSubmit();
      return;
    }
    if (step < STEPS.length - 1) goTo(step + 1);
    else handleSignup();
  };

  // Final-tile post-account-creation handler. If the visitor entered
  // a code, redeem it. If they didn't (or already applied), continue
  // to dashboard.
  const handlePartnerCodeSubmit = async () => {
    if (partnerCodeApplied) {
      finishToDashboard();
      return;
    }
    const code = partnerCodeInput.trim().toUpperCase();
    if (!code) {
      // Empty → treat as Skip (button label is "Skip — None")
      finishToDashboard();
      return;
    }
    setApplyingPartnerCode(true);
    setPartnerCodeError('');
    try {
      const token = localStorage.getItem('carryon_token');
      const res = await apiClient.post(
        `${API_URL}/partners/redeem-code`,
        { code },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      setPartnerCodeApplied(res.data);
      toast.success(`${res.data.company_name} access unlocked`);
      // Auto-advance after a brief moment so the user can SEE the
      // green confirmation before being dropped into the platform.
      setTimeout(() => finishToDashboard(), 1200);
    } catch (err) {
      const detail = err.response?.data?.detail || 'Invalid or inactive code';
      setPartnerCodeError(detail);
    } finally {
      setApplyingPartnerCode(false);
    }
  };

  const finishToDashboard = async () => {
    // Landing-page attribution (founder rule, Aug 2026): anyone who
    // arrived via /p/{slug} joins that partner's roster even if they
    // skipped the optional code tile. Awaited BEFORE the reload below
    // kills in-flight requests. Best-effort — never blocks signup.
    try {
      const slug = localStorage.getItem('cy_partner_slug');
      if (slug && !partnerCodeApplied) {
        const token = localStorage.getItem('carryon_token');
        if (token) {
          await apiClient.post(
            `${API_URL}/partners/attribute-signup`,
            { slug },
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
          );
        }
      }
    } catch { /* attribution is best-effort */ }
    // Clear partner stash so a future signup on the same device
    // doesn't accidentally inherit it.
    try {
      localStorage.removeItem('cy_partner_code');
      localStorage.removeItem('cy_partner_slug');
    } catch { /* ignore */ }
    navigate('/dashboard');
    // Force a fresh hydrate so AuthContext + feature gates pick up
    // the partner overrides we just attached to the user record.
    window.location.reload();
  };

  const handleSignup = async () => {
    setLoading(true);
    // Defensive username availability re-check — covers the race where the user
    // typed a username and clicked Create Account WITHOUT blurring the field
    // first (so the onBlur /auth/check-username probe never fired). Without this
    // a taken username would only surface as an opaque /auth/register 400.
    if (username.trim().length >= 3) {
      try {
        const res = await apiClient.post(`${API_URL}/auth/check-username`, { username });
        if (!res.data.available) {
          const msg = res.data.message || 'Username is already taken';
          setUsernameError(msg);
          toast.error(msg);
          setLoading(false);
          return;
        }
      } catch {
        // fail open — backend will reject duplicate usernames at register time
      }
    }
    try {
      const response = await apiClient.post(`${API_URL}/auth/register`, {
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        suffix: suffix === 'none' ? null : suffix,
        gender: gender === 'not_selected' ? null : gender,
        date_of_birth: dateOfBirth || null,
        marital_status: maritalStatus === 'not_selected' ? null : maritalStatus,
        dependents_over_18: dependentsOver18,
        dependents_under_18: dependentsUnder18,
        address_street: addressStreet || null,
        address_city: addressCity || null,
        address_state: addressState || null,
        address_zip: addressZip || null,
        address_line2: addressLine2 || null,
        beneficiary_enrollments: beneficiaries.filter(b => b.first_name.trim()).map(b => ({
          first_name: b.first_name,
          last_name: b.last_name,
          email: b.email || null,
          dob: b.dob || null,
          gender: b.gender || null,
          relation: b.relation,
          same_address: b.same_address,
          address_street: b.same_address ? null : b.address_street,
          address_city: b.same_address ? null : b.address_city,
          address_state: b.same_address ? null : b.address_state,
          address_zip: b.same_address ? null : b.address_zip,
        })),
        email, password, username,
        role: 'benefactor',
        special_status: specialStatus.length > 0 ? specialStatus : null,
        b2b_code: specialStatus.includes('enterprise') ? b2bCodeSignup : null,
      });
      // Apr 27, 2026 — when admin has flipped `signup_otp_disabled` ON in the
      // founder portal, /auth/register returns an access_token + user object
      // directly. We skip the OTP modal and drop the user straight onto their
      // dashboard, mirroring the post-OTP-verify path.
      if (response.data?.skip_otp && response.data?.access_token) {
        localStorage.setItem('carryon_token', response.data.access_token);
        // Claim referral if a code is in storage from the landing page
        try {
          const ref = localStorage.getItem('carryon_referral_code');
          if (ref) {
            await apiClient.post(
              `${API_URL}/referrals/claim`,
              { code: ref },
              { headers: { Authorization: `Bearer ${response.data.access_token}` } }
            ).catch(() => {});
            localStorage.removeItem('carryon_referral_code');
          }
        } catch {}
        const u = response.data.user || {};
        // Beneficiaries skip the partner-code tile entirely.
        if (u.role === 'beneficiary') {
          navigate('/beneficiary');
          window.location.reload();
          return;
        }
        // Benefactor → if they came via /p/<slug>, advance to the
        // final partner_code tile so they can redeem. For direct
        // signups the partner_code step was never compiled in
        // (see `computeSteps`) so we just route to the dashboard.
        const idx = STEPS.findIndex(s => s.id === 'partner_code');
        if (idx >= 0) {
          setLoading(false);
          goTo(idx);
          return;
        }
        // Direct signup — straight to the dashboard.
        navigate('/dashboard');
        window.location.reload();
        return;
      }
      setRegisteredEmail(email);
      setOtpHint(response.data.otp_hint);
      setShowOtpModal(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { toast.error('Please enter a valid 6-digit OTP'); return; }
    setLoading(true);
    try {
      const user = await verifyOtp(registeredEmail, otp);
      // Claim referral if a code is stashed from the landing page
      try {
        const ref = localStorage.getItem('carryon_referral_code');
        const tk = localStorage.getItem('carryon_token');
        if (ref && tk) {
          await apiClient.post(
            `${API_URL}/referrals/claim`,
            { code: ref },
            { headers: { Authorization: `Bearer ${tk}` } }
          ).catch(() => {});
          localStorage.removeItem('carryon_referral_code');
        }
      } catch {}
      // Beneficiaries skip the partner-code tile entirely.
      if (user.role === 'beneficiary') {
        navigate('/beneficiary');
        return;
      }
      // Benefactor → if they came via /p/<slug>, advance to the
      // dedicated partner_code tile. For direct signups that step
      // doesn't exist (see `computeSteps`) so we land on /dashboard.
      // Token has been stored by `verifyOtp`.
      setShowOtpModal(false);
      const idx = STEPS.findIndex(s => s.id === 'partner_code');
      if (idx >= 0) {
        setLoading(false);
        goTo(idx);
        return;
      }
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    try {
      const result = await resendOtp(registeredEmail);
      if (result.email_sent === false) {
        toast.error('Failed to send code — please try again');
      } else {
        // toast removed
      }
      setResendCooldown(30);
      const interval = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch {
      toast.error('Failed to resend code');
    }
  };

  // Auto-scroll on input focus so next field below is visible
  const _handleFieldFocus = (e) => {
    if (!scrollRef.current) return;
    const el = e.target;
    const fieldContainer = el.closest('.space-y-1, .space-y-1\\.5') || el.parentElement;
    if (!fieldContainer) return;
    const nextSibling = fieldContainer.parentElement?.querySelector(`:scope > *:nth-child(${Array.from(fieldContainer.parentElement.children).indexOf(fieldContainer) + 2})`);
    const targetEl = nextSibling || fieldContainer;
    setTimeout(() => {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 300);
  };

  // Validate beneficiary email: no duplicates across beneficiaries
  const _validateBenEmail = async (emailVal, benIndex) => {
    if (!emailVal || !emailVal.trim()) {
      setEmailErrors(prev => { const n = { ...prev }; delete n[benIndex]; return n; });
      return;
    }
    const normalizedEmail = emailVal.toLowerCase().trim();

    // Check for duplicate across other beneficiaries being enrolled
    const isDuplicate = beneficiaries.some((b, i) => i !== benIndex && b.email && b.email.toLowerCase().trim() === normalizedEmail);
    if (isDuplicate) {
      setEmailErrors(prev => ({ ...prev, [benIndex]: 'This email is already assigned to another beneficiary.' }));
      return;
    }

    setEmailErrors(prev => { const n = { ...prev }; delete n[benIndex]; return n; });
  };

  // Two-phase slide: exit (current slides out) → enter (new slides in)
  const getSlideStyle = () => {
    const goingForward = direction === 'right';
    if (slidePhase === 'exit') {
      return {
        transform: `translateX(${goingForward ? '-100px' : '100px'})`,
        opacity: 0,
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease',
      };
    }
    if (slidePhase === 'enter') {
      return {
        transform: `translateX(${goingForward ? '60px' : '-60px'})`,
        opacity: 0,
        transition: 'none',
      };
    }
    return {
      transform: 'translateX(0)',
      opacity: 1,
      transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease',
    };
  };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{
      background: 'var(--bg)',
      animation: 'signupPageEnter 0.6s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <style>{`
        @keyframes signupPageEnter {
          from { opacity: 0; transform: scale(1.02); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* NAV */}
      <nav className="fixed top-0 w-full z-50" style={{ borderBottom: '1px solid rgba(var(--gold-rgb), 0.08)', background: 'rgba(8,14,26,0.97)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <Link to="/login"><img src={partnerLandingLogo || "/carryon-logo.png"} alt={partnerLandingCompany || "CarryOn"} className="h-12" /></Link>
          <Link to="/login" className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1">
            Sign In <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      {/* Flag background */}
      <div className="absolute inset-0 z-0">
        <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(1.3) contrast(1.05) saturate(1.1)' }} />
      </div>
      <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.0) 0%, rgba(11,18,33,0.05) 50%, rgba(14,24,41,0.25) 100%)' }} />
      <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 90% 80% at 20% 80%, rgba(255,255,255,0.12) 0%, transparent 60%)' }} />
      <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 60% at 10% 50%, rgba(255,255,255,0.08) 0%, transparent 50%)' }} />
      <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 70% at 85% 85%, rgba(255,255,255,0.14) 0%, transparent 55%)' }} />

      {/* MAIN LAYOUT — split like homepage */}
      <div className="relative z-10 min-h-screen flex items-start lg:items-center" style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 w-full py-2 lg:py-0">
          <div className="grid lg:grid-cols-[1fr_520px] gap-6 lg:gap-16 items-center">

            {/* LEFT — Branding (hidden on mobile, shown on desktop) */}
            <div className="hidden lg:block" style={{
              opacity: entered ? 1 : 0,
              transform: entered ? 'translateX(0)' : 'translateX(-40px)',
              transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s',
            }}>
              <div className="flex items-start gap-8">
                <div className="flex-shrink-0">
                  <img src={partnerLandingLogo || "/carryon-logo.png"} alt={partnerLandingCompany || "CarryOn"} className="w-[220px] h-auto" />
                </div>
                <div className="flex-1 pt-2">
                  <h1 className="text-5xl font-bold text-white leading-[1.08] mb-3" style={{ fontFamily: 'var(--sans)' }}>
                    Join {partnerLandingCompany || 'CarryOn'}.
                    <span className="block text-[#d4af37] mt-1">Protect Your Estate Plan.</span>
                  </h1>
                  <p className="text-[#7b879e] text-base max-w-sm leading-relaxed mb-6">
                    Create your account in seconds. Your family's readiness starts here.
                  </p>

                  <div className="flex items-center gap-4">
                    {['AES-256 Encrypted', 'Zero-Knowledge', '2FA Protected'].map(badge => (
                      <div key={badge} className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                        <span className="text-[#525c72] text-xs">{badge}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* MOBILE-ONLY — Compact header */}
            <div className="lg:hidden text-center mb-2" style={{
              opacity: entered ? 1 : 0,
              transition: 'opacity 0.6s ease 0.1s',
            }}>
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight mb-0.5" style={{ fontFamily: 'var(--sans)' }}>
                Join {partnerLandingCompany || 'CarryOn'}. <span className="text-[#d4af37]">Protect Your Estate Plan.</span>
              </h1>
              <p className="text-[#6b7a90] text-xs">Create your account in seconds</p>
            </div>

            {/* RIGHT — Wizard Card */}
            <div className="flex justify-center lg:justify-end" style={{
              opacity: entered ? 1 : 0,
              transform: entered ? 'translateX(0)' : 'translateX(40px)',
              transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1) 0.3s',
            }}>
              <div className="w-full max-w-[100vw] rounded-2xl relative overflow-hidden" style={{
                background: 'linear-gradient(160deg, rgba(18,28,48,0.97), rgba(12,20,38,0.99))',
                border: '1px solid rgba(var(--gold-rgb), 0.12)',
                boxShadow: '0 8px 80px rgba(0,0,0,0.5), 0 0 50px rgba(var(--gold-rgb), 0.02)',
              }}>
                {/* Gold top accent */}
                <div className="absolute top-0 left-8 right-8 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #d4af37, transparent)' }} />

                {/* Progress Bar */}
                <div className="px-5 sm:px-7 pt-5 sm:pt-7 pb-2">
                  <div className="flex items-center gap-0 mb-3 overflow-hidden">
                    {STEPS.map((s, i) => (
                      <div key={s.id} className="flex items-center flex-1 min-w-0">
                        <button
                          onClick={() => { if (i < step) goTo(i); }}
                          className="flex-shrink-0"
                          style={{ cursor: i < step ? 'pointer' : 'default' }}
                          data-testid={`signup-step-${i}`}
                        >
                          <div className={`${STEPS.length > 8 ? 'w-6 h-6 text-xs' : 'w-7 h-7 text-sm'} sm:w-9 sm:h-9 sm:text-base rounded-full flex items-center justify-center font-bold transition-all duration-500`} style={{
                            background: i <= step ? 'linear-gradient(135deg, #d4af37, #b8962e)' : 'rgba(255,255,255,0.05)',
                            color: i <= step ? '#080e1a' : '#3a4a63',
                            boxShadow: i === step ? '0 0 16px rgba(var(--gold-rgb), 0.4)' : 'none',
                          }}>
                            {i + 1}
                          </div>
                        </button>
                        {i < STEPS.length - 1 && (
                          <div className={`flex-1 h-[2px] ${STEPS.length > 8 ? 'mx-0.5' : 'mx-1'} sm:mx-1.5 rounded-full transition-all duration-700 min-w-[4px]`} style={{
                            background: i < step ? '#d4af37' : 'rgba(255,255,255,0.06)',
                          }} />
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-[#525c72] text-xs mb-3">Step {step + 1} of {STEPS.length}</p>
                </div>

                {/* Step Content */}
                <div className="px-4 sm:px-6 pb-5 sm:pb-7 flex flex-col" style={{ height: 540 }}>
                  <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-hide px-3 pt-2" style={getSlideStyle()}>
                    {/* STEP 0: Name */}
                    {currentStep?.id === 'name' && (
                      <div className="space-y-4 sm:space-y-5">
                        <div>
                          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'var(--sans)' }}>What's your full legal name?</h2>
                          <p className="text-[#6b7a90] text-sm">Use the name your family knows you by.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="signup-firstname" className="text-[#7b879e] text-sm font-medium">First Name <span className="text-red-400">*</span></Label>
                            <Input id="signup-firstname" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                              autoComplete="given-name"
                              placeholder="John" className={inputClass} data-testid="signup-firstname-input" autoFocus />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="signup-middlename" className="text-[#7b879e] text-sm font-medium">Middle Name</Label>
                            <Input id="signup-middlename" type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value)}
                              autoComplete="additional-name"
                              placeholder="William" className={inputClass} data-testid="signup-middlename-input" />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="col-span-2 space-y-2">
                            <Label htmlFor="signup-lastname" className="text-[#7b879e] text-sm font-medium">Last Name <span className="text-red-400">*</span></Label>
                            <Input id="signup-lastname" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                              autoComplete="family-name"
                              placeholder="Mitchell" className={inputClass} data-testid="signup-lastname-input" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[#7b879e] text-sm font-medium">Suffix</Label>
                            <Select value={suffix} onValueChange={setSuffix}>
                              <SelectTrigger className={selectClass} data-testid="signup-suffix-select"><SelectValue placeholder="None" /></SelectTrigger>
                              <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                                {suffixOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">Gender</Label>
                            <Select value={gender} onValueChange={setGender}>
                              <SelectTrigger className={selectClass} data-testid="signup-gender-select"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                                {genderOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">Date of Birth</Label>
                            <DateMaskInput value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)}
                              className={inputClass} data-testid="signup-dob-input" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* STEP: Minor Blocked — invitation required */}
                    {currentStep?.id === 'minor_blocked' && (
                      <div className="space-y-4">
                        <div>
                          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'var(--sans)' }}>Invitation Required</h2>
                          <p className="text-[#6b7a90] text-sm">Accounts for family members under 18 are created through an invitation from a benefactor.</p>
                        </div>
                        <div className="rounded-xl p-4" style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}>
                          <p className="text-[#60A5FA] text-sm leading-relaxed flex items-start gap-2">
                            <Users className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            Ask your parent or guardian to add you as a beneficiary from their CarryOn dashboard. They'll send you an invitation link to create your account.
                          </p>
                        </div>
                        <div className="pt-2">
                          <Link to="/login" className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1">
                            Already have an invitation? Sign in here <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    )}

                    {/* STEP: Special Eligibility (benefactors only) */}
                    {currentStep?.id === 'eligibility' && (
                      <div className="space-y-3">
                        <div>
                          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'var(--sans)' }}>Special Eligibility</h2>
                          <p className="text-[#94a3b8] text-sm">Select if any apply for discounted pricing.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          {[
                            { id: 'military', label: 'Active Duty Military', icon: Shield, color: '#F59E0B' },
                            { id: 'federal_agent', label: 'Federal / State Operator', icon: Shield, color: '#3B82F6' },
                            { id: 'first_responder', label: 'First Responder', icon: Shield, color: '#EF4444' },
                            { id: 'veteran', label: 'Veteran', icon: Award, color: '#059669' },
                            { id: 'hospice', label: 'Hospice Patient', icon: Heart, color: '#ec4899' },
                            { id: 'enterprise', label: 'Employer / B2B', icon: Users, color: '#8B5CF6' },
                          ].map(s => {
                            const active = specialStatus.includes(s.id);
                            const SIcon = s.icon;
                            return (
                              <button key={s.id} type="button"
                                onClick={() => setSpecialStatus(prev =>
                                  prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                                )}
                                className="flex items-center gap-2.5 px-3 py-3.5 rounded-xl text-left transition-all"
                                style={{
                                  background: active ? `${s.color}15` : 'rgba(255,255,255,0.03)',
                                  border: active ? `2px solid ${s.color}60` : '1px solid rgba(255,255,255,0.08)',
                                }}
                                data-testid={`special-status-${s.id}`}
                              >
                                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                                  style={{ background: active ? `${s.color}25` : 'rgba(255,255,255,0.05)' }}>
                                  <SIcon className="w-4 h-4" style={{ color: active ? s.color : '#64748b' }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-bold leading-tight block"
                                    style={{ color: active ? s.color : '#cbd5e1' }}>
                                    {s.label}
                                  </span>
                                  {active && s.id !== 'enterprise' && (
                                    <span className="text-[11px] block mt-0.5" style={{ color: `${s.color}aa` }}>Verification required</span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* B2B code input — shown when enterprise is selected */}
                        {specialStatus.includes('enterprise') && (
                          <div className="p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                            <Label className="text-[#a78bfa] text-xs font-bold mb-1.5 block">Partner Access Code <span className="text-red-400">*</span></Label>
                            <Input
                              value={b2bCodeSignup}
                              onChange={(e) => setB2bCodeSignup(e.target.value.toUpperCase())}
                              placeholder="Enter code from your employer"
                              className={inputClass}
                              data-testid="signup-b2b-code"
                            />
                          </div>
                        )}

                        {!specialStatus.includes('enterprise') && specialStatus.length > 0 && (
                          <p className="text-[#64748b] text-xs text-center pt-2">Selections are optional.</p>
                        )}
                      </div>
                    )}

                    {/* STEP: Credentials */}
                    {currentStep?.id === 'credentials' && (
                      <div className="space-y-4 sm:space-y-5">
                        <div>
                          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'var(--sans)' }}>Secure your account</h2>
                          <p className="text-[#6b7a90] text-sm">Choose a unique username and strong password to protect your family&apos;s data.</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="signup-username" className="text-[#7b879e] text-sm font-medium">Username <span className="text-red-400">*</span></Label>
                          <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a4a63]" />
                            <Input id="signup-username" type="text" value={username}
                              autoComplete="username"
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
                                setUsername(val);
                                setUsernameError('');
                              }}
                              onBlur={async () => {
                                if (!username.trim()) return;
                                if (username.length < 3) { setUsernameError('Username must be at least 3 characters'); return; }
                                setUsernameChecking(true);
                                try {
                                  const res = await apiClient.post(`${API_URL}/auth/check-username`, { username });
                                  if (!res.data.available) setUsernameError(res.data.message || 'Username is already taken');
                                  else setUsernameError('');
                                } catch { setUsernameError(''); }
                                setUsernameChecking(false);
                              }}
                              placeholder={`${firstName.toLowerCase().replace(/[^a-z0-9]/g, '')}${lastName.toLowerCase().replace(/[^a-z0-9]/g, '')}` || 'Choose a username'}
                              className={`${inputClass} pl-12 ${usernameError ? 'border-red-500 focus:border-red-500 focus:ring-red-500/30' : ''}`}
                              data-testid="signup-username-input" autoFocus />
                            {usernameChecking && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a4a63] animate-spin" />}
                            {!usernameChecking && username.trim() && !usernameError && (
                              <Check className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                            )}
                          </div>
                          {usernameError ? (
                            <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {usernameError}</p>
                          ) : (
                            <p className="text-[#525c72] text-[11px]">This is how you&apos;ll sign in. Letters, numbers, and underscores only.</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="signup-email" className="text-[#7b879e] text-sm font-medium">Email <span className="text-red-400">*</span></Label>
                          <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a4a63]" />
                            <Input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                              autoComplete="email"
                              placeholder="john@example.com" className={`${inputClass} pl-12`}
                              data-testid="signup-email-input" />
                          </div>
                          <p className="text-[#525c72] text-[11px]">For verification codes and notifications. Can be shared with family members.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="signup-password" className="text-[#7b879e] text-sm font-medium">Password <span className="text-red-400">*</span></Label>
                            <div className="relative">
                              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a4a63]" />
                              <Input id="signup-password" type={showPassword ? 'text' : 'password'} value={password}
                                autoComplete="new-password"
                                onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters"
                                className={`${inputClass} pl-12 pr-12`} data-testid="signup-password-input" />
                              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3a4a63] hover:text-[#7b879e] transition-colors">
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="signup-confirm-password" className="text-[#7b879e] text-sm font-medium">Confirm <span className="text-red-400">*</span></Label>
                            <div className="relative">
                              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a4a63]" />
                              <Input id="signup-confirm-password" type={showPassword ? 'text' : 'password'} value={confirmPassword}
                                autoComplete="new-password"
                                onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter"
                                className={`${inputClass} pl-12 ${confirmPassword && password !== confirmPassword ? 'border-red-500 focus:border-red-500 focus:ring-red-500/30' : ''}`} data-testid="signup-confirm-password-input" />
                            </div>
                            {confirmPassword && password !== confirmPassword && (
                              <p className="text-red-400 text-xs flex items-center gap-1">
                                <span className="text-red-400">*</span> Passwords do not match
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Password strength rule checklist — informational only */}
                        {password.length > 0 && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5 -mt-1" data-testid="password-strength-meter">
                            {[
                              { id: 'len', label: '8+ characters', ok: password.length >= 8 },
                              { id: 'upper', label: 'Uppercase', ok: /[A-Z]/.test(password) },
                              { id: 'num', label: 'Number', ok: /[0-9]/.test(password) },
                              { id: 'sym', label: 'Symbol', ok: /[^A-Za-z0-9]/.test(password) },
                            ].map(rule => (
                              <div key={rule.id} className="flex items-center gap-1.5 text-[11px]"
                                data-testid={`password-rule-${rule.id}`}
                                style={{ color: rule.ok ? '#22C993' : '#525c72' }}>
                                {rule.ok ? (
                                  <Check className="w-3 h-3" strokeWidth={3} />
                                ) : (
                                  <span className="w-3 h-3 rounded-full border border-[#525c72] flex-shrink-0" />
                                )}
                                <span>{rule.label}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Consent */}
                        <div className="flex items-start gap-3">
                          <button type="button" onClick={() => setSmsConsent(!smsConsent)}
                            className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${
                              smsConsent ? 'bg-[#d4af37] border-[#d4af37]' : 'border-[#3a4a63] hover:border-[#7b879e]'
                            }`} data-testid="sms-consent-checkbox">
                            {smsConsent && <CheckSquare className="w-4 h-4 text-[#080e1a]" />}
                          </button>
                          <label onClick={() => setSmsConsent(!smsConsent)}
                            className="text-[#7b879e] text-xs leading-relaxed cursor-pointer select-none" data-testid="sms-consent-label">
                            I agree to receive text messages from CarryOn&trade; for account verification. Message and data rates may apply. I also agree to the{' '}
                            <Link to="/terms" className="text-[#d4af37] hover:text-[#fcd34d] underline underline-offset-2" data-testid="signup-terms-link">Terms</Link> and{' '}
                            <Link to="/privacy" className="text-[#d4af37] hover:text-[#fcd34d] underline underline-offset-2" data-testid="signup-privacy-link">Privacy Policy</Link>.
                          </label>
                        </div>
                      </div>
                    )}

                    {/* STEP: Partner / Enterprise Code (final tile) */}
                    {currentStep?.id === 'partner_code' && (
                      <div className="space-y-5" data-testid="signup-partner-code-step">
                        <div>
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-3"
                            style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)' }}>
                            <Sparkles className="w-3.5 h-3.5 text-[#a78bfa]" />
                            <span className="text-[#a78bfa] text-[11px] font-bold tracking-wider uppercase">Last step</span>
                          </div>
                          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'var(--sans)' }}>
                            Enterprise Access Code
                          </h2>
                          <p className="text-[#94a3b8] text-sm leading-relaxed">
                            {partnerLandingCompany ? (
                              <>Enter the code <span className="text-white font-semibold">{partnerLandingCompany}</span> shared with you to unlock your custom CarryOn experience. No code? Tap <span className="text-[#d4af37] font-semibold">Skip</span> below.</>
                            ) : (
                              <>If you arrived from a CarryOn partner&apos;s portal, enter your access code below. Otherwise tap <span className="text-[#d4af37] font-semibold">Skip</span> to continue.</>
                            )}
                          </p>
                        </div>

                        {partnerCodeApplied ? (
                          <div className="rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.35)' }} data-testid="partner-code-applied-banner">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(16,185,129,0.18)' }}>
                                <Check className="w-5 h-5 text-[#34d399]" strokeWidth={3} />
                              </div>
                              <div className="flex-1">
                                <p className="text-[#34d399] text-sm font-bold">
                                  {partnerCodeApplied.company_name} access unlocked
                                </p>
                                <p className="text-[#94a3b8] text-xs mt-1">
                                  Your custom feature set is now active. Taking you to your dashboard…
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="partner-code-input" className="text-[#7b879e] text-sm font-medium">
                                Access Code
                              </Label>
                              <div className="relative">
                                <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a4a63]" />
                                <Input
                                  id="partner-code-input"
                                  type="text"
                                  value={partnerCodeInput}
                                  onChange={(e) => {
                                    setPartnerCodeInput(e.target.value.toUpperCase());
                                    setPartnerCodeError('');
                                  }}
                                  placeholder="ACME2026"
                                  autoComplete="off"
                                  autoCapitalize="characters"
                                  className={`${inputClass} pl-12 font-mono tracking-wider ${partnerCodeError ? 'border-red-500 focus:border-red-500 focus:ring-red-500/30' : ''}`}
                                  data-testid="partner-code-input"
                                />
                              </div>
                              {partnerCodeError && (
                                <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
                                  data-testid="partner-code-error">
                                  <AlertCircle className="w-4 h-4 text-[#fca5a5] flex-shrink-0 mt-0.5" />
                                  <p className="text-[#fca5a5] text-xs leading-relaxed">
                                    We couldn&apos;t find that code. Please confirm with{' '}
                                    <span className="text-white font-semibold">
                                      {partnerLandingCompany || 'your CarryOn partner'}
                                    </span>{' '}
                                    for their correct access code, or tap Skip to continue without one.
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="rounded-xl p-3.5" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)' }}>
                              <p className="text-[#a78bfa] text-xs leading-relaxed flex items-start gap-2">
                                <Briefcase className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <span>
                                  An enterprise code unlocks the custom feature set your B2B partner negotiated with CarryOn. You can skip this and add a code later from your profile.
                                </span>
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => { finishToDashboard(); }}
                              className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors"
                              data-testid="partner-code-skip-btn"
                            >
                              I don&apos;t have a code — skip
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Navigation Buttons — pinned to bottom */}
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-between pt-4 sm:pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {currentStep?.id === 'partner_code' ? (
                      // Account is already created on this step — no
                      // "Back" path. Empty slot keeps the primary CTA
                      // right-aligned via flex justify-between.
                      <span />
                    ) : step > 0 ? (
                      <button onClick={() => goTo(step - 1)}
                        className="flex items-center gap-2 text-[#6b7a90] text-sm font-medium hover:text-white transition-colors"
                        data-testid="signup-back-btn">
                        <ArrowLeft className="w-4 h-4" /> Back
                      </button>
                    ) : (
                      <Link to="/login" className="flex items-center gap-2 text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Sign In
                      </Link>
                    )}

                    <Button onClick={handleNext} disabled={loading || usernameChecking || applyingPartnerCode}
                      className="h-11 sm:h-12 px-6 sm:px-8 rounded-xl font-semibold text-sm"
                      style={{
                        background: canAdvance() ? 'linear-gradient(135deg, #d4af37, #b8962e)' : 'rgba(var(--gold-rgb), 0.15)',
                        color: canAdvance() ? '#080e1a' : '#d4af3780',
                        boxShadow: canAdvance() ? '0 4px 24px rgba(var(--gold-rgb), 0.3)' : 'none',
                        transition: 'all 0.3s',
                      }}
                      data-testid="signup-next-btn"
                    >
                      {loading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
                      ) : applyingPartnerCode ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Applying...</>
                      ) : usernameChecking && currentStep?.id === 'credentials' ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Checking username...</>
                      ) : currentStep?.id === 'credentials' ? (
                        <>Create Account <ChevronRight className="w-4 h-4 ml-1" /></>
                      ) : currentStep?.id === 'partner_code' ? (
                        partnerCodeApplied ? (
                          <>Continue <ArrowRight className="w-4 h-4 ml-1" /></>
                        ) : partnerCodeInput.trim() ? (
                          <>Apply Code <ChevronRight className="w-4 h-4 ml-1" /></>
                        ) : (
                          <>Skip — No Code <ArrowRight className="w-4 h-4 ml-1" /></>
                        )
                      ) : currentStep?.id === 'eligibility' && specialStatus.length === 0 ? (
                        <>Skip — None Apply <ArrowRight className="w-4 h-4 ml-1" /></>
                      ) : (
                        <>Continue <ArrowRight className="w-4 h-4 ml-1" /></>
                      )}
                    </Button>
                    </div>

                    {/* Security footer inside card */}
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-[#10b981]" />
                      <span className="text-[#3a4a63] text-xs">AES-256 encryption &middot; Per-estate keys &middot; TLS 1.3</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* OTP Modal */}
      <Dialog open={showOtpModal} onOpenChange={setShowOtpModal}>
        <DialogContent className="sm:max-w-md border-0 p-0 bg-transparent shadow-none">
          <div className="rounded-2xl p-8" style={{
            background: 'linear-gradient(145deg, rgba(20,30,52,0.98), rgba(15,22,41,1))',
            border: '1px solid rgba(var(--gold-rgb), 0.15)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          }}>
            <DialogHeader>
              <DialogTitle className="text-white text-xl font-semibold" style={{ fontFamily: 'var(--sans)' }}>
                Verify Your Email
              </DialogTitle>
              <DialogDescription className="text-[#7b879e] text-base mt-1">
                Enter the 6-digit code sent to {registeredEmail}
                {otpHint && <span className="block mt-1 text-[#d4af37] text-sm">(Hint: starts with {otpHint})</span>}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center py-6">
              <Input type="text" inputMode="numeric" maxLength={6} value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="h-14 text-center text-2xl tracking-[0.4em] font-mono bg-[#0b1322] border-[#1a2a42] text-white focus:border-[#d4af37] rounded-xl w-full"
                data-testid="signup-otp-input" autoFocus />
              <p className="text-[#3a4a63] text-sm mt-2">{otp.length}/6 digits entered</p>
              <Button onClick={handleVerifyOtp} disabled={loading || otp.length !== 6}
                className="mt-6 w-full h-12 rounded-xl font-semibold"
                style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
                data-testid="signup-otp-verify-button">
                {loading ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Verifying...</> : 'Verify & Continue'}
              </Button>
              <button onClick={handleResendOtp} disabled={resendCooldown > 0}
                className={`mt-3 text-sm transition-colors ${resendCooldown > 0 ? 'text-[#3a4a63] cursor-not-allowed' : 'text-[#d4af37] hover:text-[#e8c54a]'}`}
                data-testid="signup-otp-resend-button">
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SignupPage;
