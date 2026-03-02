import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Mail, Lock, Eye, EyeOff, Loader2, ArrowLeft, ArrowRight,
  AlertCircle, CheckSquare, Shield, ChevronRight, User, Calendar,
  Users, Check, MapPin, Heart, Award
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { toast } from '../utils/toast';
import AddressAutocomplete from '../components/AddressAutocomplete';
import axios from 'axios';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

const maritalOptions = [
  { value: 'not_selected', label: 'Select...' },
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'domestic_partnership', label: 'Domestic Partnership' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'separated', label: 'Separated' },
];

const usStates = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

const STEPS = [
  { id: 'name', label: 'Name', icon: User, desc: 'As it appears on legal documents' },
  { id: 'personal', label: 'About You', icon: Heart, desc: 'Personal details for your estate plan' },
  { id: 'address', label: 'Address', icon: MapPin, desc: 'Your residential address' },
  { id: 'role', label: 'Role', icon: Users, desc: 'How will you use CarryOn?' },
  { id: 'eligibility', label: 'Eligibility', icon: Shield, desc: 'Special tier eligibility' },
  { id: 'credentials', label: 'Login', icon: Lock, desc: 'Email and password' },
];

const inputClass = "h-14 px-4 bg-[#0b1322] border border-[#1a2a42] text-white text-base placeholder:text-[#2d3d55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 focus:outline-none rounded-xl w-full";
const selectClass = "h-14 bg-[#0b1322] border-[#1a2a42] text-white text-base rounded-xl [&>span]:text-white";

const SignupPage = () => {
  const navigate = useNavigate();
  const { verifyOtp, resendOtp } = useAuth();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState('right');
  const [slidePhase, setSlidePhase] = useState('idle'); // 'idle' | 'exit' | 'enter'
  const [entered, setEntered] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('none');
  const [gender, setGender] = useState('not_selected');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('not_selected');
  const [dependentsOver18, setDependentsOver18] = useState(0);
  const [dependentsUnder18, setDependentsUnder18] = useState(0);
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressState, setAddressState] = useState('');
  const [addressZip, setAddressZip] = useState('');
  const [role, setRole] = useState('');
  const [specialStatus, setSpecialStatus] = useState([]);
  const [benefactorEmail, setBenefactorEmail] = useState('');
  const [b2bCodeSignup, setB2bCodeSignup] = useState('');
  const [email, setEmail] = useState('');
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

  const goTo = (nextStep) => {
    if (slidePhase !== 'idle' || nextStep === step) return;
    setDirection(nextStep > step ? 'right' : 'left');
    setSlidePhase('exit');
    setTimeout(() => {
      setStep(nextStep);
      setSlidePhase('enter');
      setTimeout(() => setSlidePhase('idle'), 350);
    }, 300);
  };

  const canAdvance = () => {
    if (step === 0) return firstName.trim() && lastName.trim();
    if (step === 1) return true; // optional fields
    if (step === 2) {
      // Read street directly from DOM (uncontrolled input)
      const streetVal = document.querySelector('[data-testid="signup-address-street"]')?.value || addressStreet;
      return streetVal.trim() && addressCity.trim() && addressState && addressZip.trim();
    }
    if (step === 3) {
      if (!role) return false;
      if (role === 'beneficiary' && !benefactorEmail.trim()) return false;
      return true;
    }
    if (step === 4) return true; // eligibility is optional
    if (step === 5) return email.trim() && password.length >= 8 && password === confirmPassword && smsConsent;
    return false;
  };

  const handleNext = () => {
    // Sync address from uncontrolled input before validation
    if (step === 2) {
      const streetInput = document.querySelector('[data-testid="signup-address-street"]');
      if (streetInput?.value) setAddressStreet(streetInput.value);
    }
    if (!canAdvance()) {
      if (step === 0) toast.error('Please enter your first and last name');
      if (step === 2) toast.error('Please enter your full address');
      if (step === 3) {
        if (!role) toast.error('Please select your role');
        else if (role === 'beneficiary' && !benefactorEmail.trim()) toast.error('Please enter your benefactor\'s email address');
      }
      if (step === 5) {
        if (!email.trim()) toast.error('Please enter your email');
        else if (password.length < 8) toast.error('Password must be at least 8 characters');
        else if (password !== confirmPassword) toast.error('Passwords do not match');
        else if (!smsConsent) toast.error('Please agree to the terms to continue');
      }
      return;
    }
    // Skip eligibility step for beneficiaries (they go straight to credentials)
    if (step === 3 && role === 'beneficiary') {
      goTo(5);
      return;
    }
    if (step < 5) goTo(step + 1);
    else handleSignup();
  };

  const handleSignup = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
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
        email, password, role,
        special_status: specialStatus.length > 0 ? specialStatus : null,
        benefactor_email: role === 'beneficiary' ? benefactorEmail : null,
        b2b_code: specialStatus.includes('enterprise') ? b2bCodeSignup : null,
      });
      setRegisteredEmail(email);
      setOtpHint(response.data.otp_hint);
      setShowOtpModal(true);
      // toast removed
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
      // toast removed
      navigate(user.role === 'beneficiary' ? '/beneficiary' : '/onboarding');
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
      background: '#080e1a',
      animation: 'signupPageEnter 0.6s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <style>{`
        @keyframes signupPageEnter {
          from { opacity: 0; transform: scale(1.02); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* NAV */}
      <nav className="fixed top-0 w-full z-50" style={{ borderBottom: '1px solid rgba(212,175,55,0.08)', background: 'rgba(8,14,26,0.85)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <Link to="/login"><img src="/carryon-logo.jpg" alt="CarryOn" className="h-12" /></Link>
          <Link to="/login" className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1">
            Sign In <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      {/* Flag background */}
      <div className="absolute inset-0 z-0" style={{ opacity: 0.35 }}>
        <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" />
      </div>
      <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(135deg, rgba(8,14,26,0.55) 0%, rgba(8,14,26,0.88) 50%, #080e1a 100%)' }} />
      <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 60% 50% at 30% 50%, rgba(212,175,55,0.04) 0%, transparent 60%)' }} />

      {/* MAIN LAYOUT — split like homepage */}
      <div className="relative z-10 min-h-screen flex items-start lg:items-center pt-16">
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
                  <img src="/carryon-logo.jpg" alt="CarryOn" className="w-[220px] h-auto" />
                </div>
                <div className="flex-1 pt-2">
                  <h1 className="text-5xl font-bold text-white leading-[1.08] mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    Join CarryOn.
                    <span className="block text-[#d4af37] mt-1">Protect Your Legacy.</span>
                  </h1>
                  <p className="text-[#7b879e] text-base max-w-sm leading-relaxed mb-6">
                    Create your account in seconds. Your family's readiness starts here.
                  </p>

                  <div className="p-4 rounded-xl mb-6 max-w-sm" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}>
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-4 h-4 text-[#d4af37] flex-shrink-0 mt-0.5" />
                      <p className="text-[#d4af37] text-xs leading-relaxed">
                        Please enter your name exactly as it appears on your legal documents for estate planning verification.
                      </p>
                    </div>
                  </div>

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
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight mb-0.5" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Join CarryOn. <span className="text-[#d4af37]">Protect Your Legacy.</span>
              </h1>
              <p className="text-[#6b7a90] text-xs">Create your account in seconds</p>
            </div>

            {/* RIGHT — Wizard Card */}
            <div className="flex justify-center lg:justify-end" style={{
              opacity: entered ? 1 : 0,
              transform: entered ? 'translateX(0)' : 'translateX(40px)',
              transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1) 0.3s',
            }}>
              <div className="w-full rounded-2xl relative" style={{
                background: 'linear-gradient(160deg, rgba(18,28,48,0.97), rgba(12,20,38,0.99))',
                border: '1px solid rgba(212,175,55,0.12)',
                boxShadow: '0 8px 80px rgba(0,0,0,0.5), 0 0 50px rgba(212,175,55,0.02)',
              }}>
                {/* Gold top accent */}
                <div className="absolute top-0 left-8 right-8 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #d4af37, transparent)' }} />

                {/* Progress Bar */}
                <div className="px-5 sm:px-7 pt-5 sm:pt-7 pb-2">
                  <div className="flex items-center gap-1 mb-3">
                    {STEPS.map((s, i) => (
                      <div key={s.id} className="flex items-center flex-1">
                        <button
                          onClick={() => { if (i < step) goTo(i); }}
                          className="flex items-center gap-1.5 sm:gap-2 group"
                          style={{ cursor: i < step ? 'pointer' : 'default' }}
                        >
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 flex-shrink-0" style={{
                            background: i <= step ? 'linear-gradient(135deg, #d4af37, #b8962e)' : 'rgba(255,255,255,0.05)',
                            color: i <= step ? '#080e1a' : '#3a4a63',
                            boxShadow: i === step ? '0 0 16px rgba(212,175,55,0.4)' : 'none',
                          }}>
                            {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                          </div>
                          <span className="hidden sm:block text-xs font-medium transition-colors" style={{ color: i <= step ? '#d4af37' : '#3a4a63' }}>
                            {s.label}
                          </span>
                        </button>
                        {i < STEPS.length - 1 && (
                          <div className="flex-1 h-[2px] mx-1.5 sm:mx-2 rounded-full transition-all duration-700" style={{
                            background: i < step ? '#d4af37' : 'rgba(255,255,255,0.06)',
                          }} />
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-[#525c72] text-xs mb-1">Step {step + 1} of {STEPS.length}</p>
                </div>

                {/* Step Content */}
                <div className="px-5 sm:px-7 pb-5 sm:pb-7 flex flex-col" style={{ height: 500 }}>
                  <div className="flex-1 overflow-hidden" style={getSlideStyle()}>
                    {/* STEP 0: Name */}
                    {step === 0 && (
                      <div className="space-y-4 sm:space-y-5">
                        <div>
                          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>What's your full legal name?</h2>
                          <p className="text-[#6b7a90] text-sm">This must match your legal documents exactly.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-[#7b879e] text-sm font-medium">First Name *</Label>
                            <Input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                              placeholder="John" className={inputClass} data-testid="signup-firstname-input" autoFocus />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[#7b879e] text-sm font-medium">Middle Name</Label>
                            <Input type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value)}
                              placeholder="William" className={inputClass} data-testid="signup-middlename-input" />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="col-span-2 space-y-2">
                            <Label className="text-[#7b879e] text-sm font-medium">Last Name *</Label>
                            <Input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                              placeholder="Mitchell" className={inputClass} data-testid="signup-lastname-input" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[#7b879e] text-sm font-medium">Suffix</Label>
                            <Select value={suffix} onValueChange={setSuffix}>
                              <SelectTrigger className={selectClass} data-testid="signup-suffix-select"><SelectValue placeholder="None" /></SelectTrigger>
                              <SelectContent className="bg-[#141C33] border-[#1a2a42]">
                                {suffixOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* STEP 1: Personal */}
                    {step === 1 && (
                      <div className="space-y-3 sm:space-y-4">
                        <div>
                          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Tell us about yourself</h2>
                          <p className="text-[#6b7a90] text-sm">Helps EGA analyze your estate under the right state laws.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">Gender</Label>
                            <Select value={gender} onValueChange={setGender}>
                              <SelectTrigger className={selectClass} data-testid="signup-gender-select"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent className="bg-[#141C33] border-[#1a2a42]">
                                {genderOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">Date of Birth</Label>
                            <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)}
                              className={inputClass} data-testid="signup-dob-input"
                              max={new Date().toISOString().split('T')[0]} />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[#7b879e] text-sm font-medium">Marital Status</Label>
                          <Select value={maritalStatus} onValueChange={setMaritalStatus}>
                            <SelectTrigger className={selectClass} data-testid="signup-marital-select"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent className="bg-[#141C33] border-[#1a2a42]">
                              {maritalOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">Dependents (18+)</Label>
                            <Select value={String(dependentsOver18)} onValueChange={(v) => setDependentsOver18(parseInt(v))}>
                              <SelectTrigger className={selectClass} data-testid="signup-dependents-over"><SelectValue placeholder="0" /></SelectTrigger>
                              <SelectContent className="bg-[#141C33] border-[#1a2a42]">
                                {[...Array(11)].map((_, i) => <SelectItem key={i} value={String(i)}>{i}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <p className="text-[#525c72] text-[10px]">Adult children, etc.</p>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">Dependents (Under 18)</Label>
                            <Select value={String(dependentsUnder18)} onValueChange={(v) => setDependentsUnder18(parseInt(v))}>
                              <SelectTrigger className={selectClass} data-testid="signup-dependents-under"><SelectValue placeholder="0" /></SelectTrigger>
                              <SelectContent className="bg-[#141C33] border-[#1a2a42]">
                                {[...Array(11)].map((_, i) => <SelectItem key={i} value={String(i)}>{i}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <p className="text-[#525c72] text-[10px]">Minor children</p>
                          </div>
                        </div>
                        <p className="text-[#3a4a63] text-xs">All fields optional — helps pre-populate your beneficiary list.</p>
                      </div>
                    )}

                    {/* STEP 2: Address */}
                    {step === 2 && (
                      <div className="space-y-4 sm:space-y-5">
                        <div>
                          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Your residential address</h2>
                          <p className="text-[#6b7a90] text-sm">Used by EGA to analyze estate law specific to your state.</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[#7b879e] text-sm font-medium">Street Address</Label>
                          <Input
                            value={addressStreet}
                            onChange={(e) => setAddressStreet(e.target.value)}
                            placeholder="123 Main Street, Apt 4B"
                            className={inputClass}
                            data-testid="signup-address-street"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">City</Label>
                            <Input value={addressCity} onChange={(e) => setAddressCity(e.target.value)}
                              placeholder="City" className={inputClass} data-testid="signup-address-city" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">State</Label>
                            <Select value={addressState} onValueChange={setAddressState}>
                              <SelectTrigger className={selectClass} data-testid="signup-address-state"><SelectValue placeholder="State" /></SelectTrigger>
                              <SelectContent className="bg-[#141C33] border-[#1a2a42] max-h-48">
                                {usStates.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">ZIP Code</Label>
                            <Input value={addressZip} onChange={(e) => setAddressZip(e.target.value)}
                              placeholder="ZIP" className={inputClass} maxLength={10} data-testid="signup-address-zip" />
                          </div>
                        </div>
                        <div className="p-3 rounded-xl" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.12)' }}>
                          <p className="text-[#d4af37] text-xs leading-relaxed flex items-start gap-2">
                            <Shield className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            Your address is encrypted and stored securely. It's only used for estate law analysis and is never shared.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* STEP 3: Role */}
                    {step === 3 && (
                      <div className="space-y-3">
                        <div>
                          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>How will you use CarryOn?</h2>
                          <p className="text-[#6b7a90] text-sm">Select your role{role === 'beneficiary' ? ' and link to your benefactor' : ''}.</p>
                        </div>
                        <div className="space-y-3">
                          {[
                            { value: 'benefactor', title: 'Benefactor', subtitle: 'Estate Owner', desc: 'I want to organize my estate, protect my documents, and prepare my family.', color: '#d4af37' },
                            { value: 'beneficiary', title: 'Beneficiary', subtitle: 'Family Member', desc: 'I was invited by a loved one to be part of their estate plan.', color: '#60A5FA' },
                          ].map(r => (
                            <button key={r.value} type="button" onClick={() => { setRole(r.value); if (r.value === 'benefactor') setBenefactorEmail(''); }}
                              className="w-full text-left p-4 sm:p-5 rounded-xl transition-all duration-300"
                              style={{
                                background: role === r.value ? `linear-gradient(135deg, ${r.color}12, ${r.color}05)` : 'rgba(255,255,255,0.02)',
                                border: role === r.value ? `2px solid ${r.color}50` : '1px solid rgba(255,255,255,0.06)',
                                boxShadow: role === r.value ? `0 4px 24px ${r.color}15` : 'none',
                              }}
                              data-testid={`signup-role-${r.value}`}
                            >
                              <div className="flex items-center gap-3 mb-2">
                                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                                  style={{ background: `${r.color}15`, border: `1px solid ${r.color}25` }}>
                                  {r.value === 'benefactor'
                                    ? <Shield className="w-5 h-5" style={{ color: r.color }} />
                                    : <Users className="w-5 h-5" style={{ color: r.color }} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-white font-bold text-base">{r.title}</h3>
                                  <p className="text-sm font-semibold" style={{ color: r.color }}>{r.subtitle}</p>
                                </div>
                                {role === r.value && (
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ background: r.color }}>
                                    <Check className="w-3.5 h-3.5 text-[#080e1a]" />
                                  </div>
                                )}
                              </div>
                              <p className="text-[#94a3b8] text-sm leading-relaxed pl-14">{r.desc}</p>
                            </button>
                          ))}
                        </div>

                        {/* Beneficiary: Benefactor email (required) */}
                        {role === 'beneficiary' && (
                          <div className="space-y-2 pt-1">
                            <Label className="text-[#7b879e] text-sm font-medium">Benefactor's Email *</Label>
                            <div className="relative">
                              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a4a63]" />
                              <Input
                                type="email"
                                value={benefactorEmail}
                                onChange={(e) => setBenefactorEmail(e.target.value)}
                                placeholder="Your benefactor's email address"
                                className={`${inputClass} pl-11`}
                                data-testid="signup-benefactor-email"
                              />
                            </div>
                            <p className="text-[#3a4a63] text-xs">This links your account to your benefactor's estate plan.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* STEP 4: Special Eligibility (benefactors only) */}
                    {step === 4 && (
                      <div className="space-y-4">
                        <div>
                          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Special Eligibility</h2>
                          <p className="text-[#94a3b8] text-sm">Select if any apply for discounted pricing.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          {[
                            { id: 'military', label: 'Active Duty Military', icon: Shield, color: '#F59E0B' },
                            { id: 'federal_agent', label: 'Federal / State Operator', icon: Shield, color: '#3B82F6' },
                            { id: 'first_responder', label: 'First Responder', icon: Shield, color: '#EF4444' },
                            { id: 'veteran', label: 'Veteran', icon: Award, color: '#059669' },
                            { id: 'hospice', label: 'Hospice Patient', icon: Heart, color: '#ec4899' },
                            { id: 'enterprise', label: 'Employer / B2B Partner', icon: Users, color: '#8B5CF6' },
                          ].map(s => {
                            const active = specialStatus.includes(s.id);
                            const SIcon = s.icon;
                            return (
                              <button key={s.id} type="button"
                                onClick={() => setSpecialStatus(prev =>
                                  prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                                )}
                                className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-all"
                                style={{
                                  background: active ? `${s.color}15` : 'rgba(255,255,255,0.03)',
                                  border: active ? `2px solid ${s.color}60` : '1px solid rgba(255,255,255,0.08)',
                                  boxShadow: active ? `0 4px 16px ${s.color}20` : 'none',
                                }}
                                data-testid={`special-status-${s.id}`}
                              >
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                                  style={{ background: active ? `${s.color}25` : 'rgba(255,255,255,0.05)' }}>
                                  <SIcon className="w-5 h-5" style={{ color: active ? s.color : '#64748b' }} />
                                </div>
                                <span className="text-sm font-bold leading-tight"
                                  style={{ color: active ? s.color : '#cbd5e1' }}>
                                  {s.label}
                                </span>
                                {active && s.id !== 'enterprise' && (
                                  <span className="text-[10px] font-semibold mt-0.5" style={{ color: `${s.color}cc` }}>
                                    Verification required
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* B2B code input — shown when enterprise is selected */}
                        {specialStatus.includes('enterprise') && (
                          <div className="p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                            <Label className="text-[#a78bfa] text-xs font-bold mb-1.5 block">Partner Access Code</Label>
                            <Input
                              value={b2bCodeSignup}
                              onChange={(e) => setB2bCodeSignup(e.target.value.toUpperCase())}
                              placeholder="Enter code from your employer or partner"
                              className={inputClass}
                              data-testid="signup-b2b-code"
                            />
                            <p className="text-[#7c6fbd] text-[10px] mt-1">Code will be verified when you complete registration.</p>
                          </div>
                        )}

                        <p className="text-[#64748b] text-xs text-center">Skip if none apply.</p>
                      </div>
                    )}

                    {/* STEP 5: Credentials */}
                    {step === 5 && (
                      <div className="space-y-4 sm:space-y-5">
                        <div>
                          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Secure your account</h2>
                          <p className="text-[#6b7a90] text-sm">Choose a strong password to protect your legacy.</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[#7b879e] text-sm font-medium">Email *</Label>
                          <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a4a63]" />
                            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                              placeholder="john@example.com" className={`${inputClass} pl-12`}
                              data-testid="signup-email-input" autoFocus />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-[#7b879e] text-sm font-medium">Password *</Label>
                            <div className="relative">
                              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a4a63]" />
                              <Input type={showPassword ? 'text' : 'password'} value={password}
                                onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters"
                                className={`${inputClass} pl-12 pr-12`} data-testid="signup-password-input" />
                              <button type="button" onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3a4a63] hover:text-[#7b879e] transition-colors">
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[#7b879e] text-sm font-medium">Confirm *</Label>
                            <div className="relative">
                              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a4a63]" />
                              <Input type={showPassword ? 'text' : 'password'} value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter"
                                className={`${inputClass} pl-12`} data-testid="signup-confirm-password-input" />
                            </div>
                          </div>
                        </div>

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
                  </div>

                  {/* Navigation Buttons — pinned to bottom */}
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-between pt-4 sm:pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {step > 0 ? (
                      <button onClick={() => {
                        // Beneficiaries skip eligibility step (4), go from credentials (5) back to role (3)
                        if (step === 5 && role === 'beneficiary') goTo(3);
                        else goTo(step - 1);
                      }}
                        className="flex items-center gap-2 text-[#6b7a90] text-sm font-medium hover:text-white transition-colors"
                        data-testid="signup-back-btn">
                        <ArrowLeft className="w-4 h-4" /> Back
                      </button>
                    ) : (
                      <Link to="/login" className="flex items-center gap-2 text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Sign In
                      </Link>
                    )}

                    <Button onClick={handleNext} disabled={loading}
                      className="h-11 sm:h-12 px-6 sm:px-8 rounded-xl font-semibold text-sm"
                      style={{
                        background: canAdvance() ? 'linear-gradient(135deg, #d4af37, #b8962e)' : 'rgba(212,175,55,0.15)',
                        color: canAdvance() ? '#080e1a' : '#d4af3780',
                        boxShadow: canAdvance() ? '0 4px 24px rgba(212,175,55,0.3)' : 'none',
                        transition: 'all 0.3s',
                      }}
                      data-testid="signup-next-btn"
                    >
                      {loading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
                      ) : step === 5 ? (
                        <>Create Account <ChevronRight className="w-4 h-4 ml-1" /></>
                      ) : (
                        <>Continue <ArrowRight className="w-4 h-4 ml-1" /></>
                      )}
                    </Button>
                    </div>

                    {/* Security footer inside card */}
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-[#10b981]" />
                      <span className="text-[#3a4a63] text-xs">Bank-grade security &middot; 256-bit SSL</span>
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
            border: '1px solid rgba(212,175,55,0.15)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          }}>
            <DialogHeader>
              <DialogTitle className="text-white text-xl font-semibold" style={{ fontFamily: 'Outfit, sans-serif' }}>
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
