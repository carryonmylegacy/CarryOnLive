import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowLeft, AlertCircle, CheckSquare, Shield, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { toast } from 'sonner';
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

/* ─── reveal animation hook ─── */
const useReveal = (threshold = 0.1) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const timer = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);
  return [ref, visible];
};

const inputStyles = "h-12 bg-[#0b1322] border-[#1a2a42] text-white text-base placeholder:text-[#2d3d55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg";
const selectTriggerStyles = "h-12 bg-[#0b1322] border-[#1a2a42] text-white text-base rounded-lg [&>span]:text-white";

const SignupPage = () => {
  const navigate = useNavigate();
  const { verifyOtp } = useAuth();
  
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('none');
  const [gender, setGender] = useState('not_selected');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('benefactor');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);

  const [formRef, formVisible] = useReveal();

  const handleSignup = async (e) => {
    e.preventDefault();
    
    if (!firstName.trim()) { toast.error('Please enter your first name'); return; }
    if (!lastName.trim()) { toast.error('Please enter your last name'); return; }
    if (!email.trim()) { toast.error('Please enter your email'); return; }
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (!smsConsent) { toast.error('Please agree to the SMS and terms consent to continue'); return; }
    
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        suffix: suffix === 'none' ? null : suffix,
        gender: gender === 'not_selected' ? null : gender,
        date_of_birth: dateOfBirth || null,
        email,
        password,
        role
      });
      setRegisteredEmail(email);
      setOtpHint(response.data.otp_hint);
      setShowOtpModal(true);
      toast.success('Account created! Please verify with OTP.');
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
      toast.success(`Welcome to CarryOn, ${user.name}!`);
      if (user.role === 'beneficiary') navigate('/beneficiary');
      else navigate('/onboarding');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: '#080e1a' }}>

      {/* NAV BAR — matches home page */}
      <nav className="fixed top-0 w-full z-50" style={{ borderBottom: '1px solid rgba(212,175,55,0.08)', background: 'rgba(8,14,26,0.85)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <Link to="/login">
            <img src="/carryon-logo.jpg" alt="CarryOn" className="h-12" />
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link to="/login" className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors duration-300">Home</Link>
            <Link to="/about" className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors duration-300">About</Link>
          </div>
          <Link to="/login" className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1">
            Sign In <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      {/* Background effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div style={{ position: 'absolute', top: '10%', left: '10%', width: 500, height: 500, background: 'radial-gradient(circle, rgba(212,175,55,0.04) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '10%', width: 400, height: 400, background: 'radial-gradient(circle, rgba(37,99,180,0.05) 0%, transparent 70%)', borderRadius: '50%' }} />
      </div>

      {/* MAIN CONTENT */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-24">
        <div
          ref={formRef}
          className="w-full max-w-xl"
          style={{
            opacity: formVisible ? 1 : 0,
            transform: formVisible ? 'translateY(0)' : 'translateY(30px)',
            transition: 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          {/* Back link */}
          <Link to="/login" className="inline-flex items-center gap-2 text-[#6b7a90] hover:text-[#d4af37] mb-8 transition-colors text-sm font-medium">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>

          {/* Logo & Header */}
          <div className="text-center mb-8">
            <img src="/carryon-logo.jpg" alt="CarryOn" className="w-[180px] h-auto mx-auto mb-5" />
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Create Your Account
            </h1>
            <p className="text-[#7b879e] text-base">
              Start securing your family's legacy today
            </p>
          </div>

          {/* Form Card */}
          <div className="rounded-2xl p-7 sm:p-9 relative" style={{
            background: 'linear-gradient(160deg, rgba(18,28,48,0.97), rgba(12,20,38,0.99))',
            border: '1px solid rgba(212,175,55,0.12)',
            boxShadow: '0 8px 80px rgba(0,0,0,0.5), 0 0 50px rgba(212,175,55,0.02)',
          }}>
            {/* Gold accent line */}
            <div className="absolute top-0 left-8 right-8 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #d4af37, transparent)' }} />

            {/* Legal notice */}
            <div className="mb-7 p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}>
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#d4af37] flex-shrink-0 mt-0.5" />
                <p className="text-[#d4af37] text-sm leading-relaxed">
                  <strong>Important:</strong> Please enter your name exactly as it appears on your legal documents. 
                  This ensures CarryOn can fully support your estate planning needs.
                </p>
              </div>
            </div>

            <form onSubmit={handleSignup} className="space-y-5">
              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[#7b879e] text-sm font-medium">First Name *</Label>
                  <Input
                    type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John" className={inputStyles} data-testid="signup-firstname-input" required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#7b879e] text-sm font-medium">Middle Name</Label>
                  <Input
                    type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value)}
                    placeholder="William" className={inputStyles} data-testid="signup-middlename-input"
                  />
                </div>
              </div>

              {/* Last Name & Suffix */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label className="text-[#7b879e] text-sm font-medium">Last Name *</Label>
                  <Input
                    type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                    placeholder="Mitchell" className={inputStyles} data-testid="signup-lastname-input" required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#7b879e] text-sm font-medium">Suffix</Label>
                  <Select value={suffix} onValueChange={setSuffix}>
                    <SelectTrigger className={selectTriggerStyles} data-testid="signup-suffix-select">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141C33] border-[#1a2a42]">
                      {suffixOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Gender & DOB */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[#7b879e] text-sm font-medium">Gender</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger className={selectTriggerStyles} data-testid="signup-gender-select">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141C33] border-[#1a2a42]">
                      {genderOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#7b879e] text-sm font-medium">Date of Birth</Label>
                  <Input
                    type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)}
                    className={inputStyles} data-testid="signup-dob-input"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
              <p className="text-[#3a4a63] text-xs -mt-2">Date of birth determines age-based plan eligibility (e.g., New Adult tier for ages 18-25)</p>

              {/* Divider */}
              <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.15), transparent)' }} />

              {/* Email */}
              <div className="space-y-2">
                <Label className="text-[#7b879e] text-sm font-medium">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a4a63]" />
                  <Input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com" className={`${inputStyles} pl-11`}
                    data-testid="signup-email-input" required
                  />
                </div>
              </div>

              {/* Passwords */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[#7b879e] text-sm font-medium">Password *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a4a63]" />
                    <Input
                      type={showPassword ? 'text' : 'password'} value={password}
                      onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters"
                      className={`${inputStyles} pl-11 pr-11`}
                      data-testid="signup-password-input" required minLength={6}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a4a63] hover:text-[#7b879e] transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#7b879e] text-sm font-medium">Confirm *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a4a63]" />
                    <Input
                      type={showPassword ? 'text' : 'password'} value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password"
                      className={`${inputStyles} pl-11`}
                      data-testid="signup-confirm-password-input" required
                    />
                  </div>
                </div>
              </div>

              {/* Role */}
              <div className="space-y-2">
                <Label className="text-[#7b879e] text-sm font-medium">I am a...</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className={selectTriggerStyles} data-testid="signup-role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#141C33] border-[#1a2a42]">
                    <SelectItem value="benefactor">Benefactor (Estate Owner)</SelectItem>
                    <SelectItem value="beneficiary">Beneficiary (Family Member)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* SMS & Terms */}
              <div className="flex items-start gap-3 pt-1">
                <button
                  type="button" onClick={() => setSmsConsent(!smsConsent)}
                  className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${
                    smsConsent ? 'bg-[#d4af37] border-[#d4af37]' : 'border-[#3a4a63] hover:border-[#7b879e]'
                  }`}
                  data-testid="sms-consent-checkbox"
                >
                  {smsConsent && <CheckSquare className="w-4 h-4 text-[#080e1a]" />}
                </button>
                <label onClick={() => setSmsConsent(!smsConsent)}
                  className="text-[#7b879e] text-sm leading-relaxed cursor-pointer select-none"
                  data-testid="sms-consent-label"
                >
                  I agree to receive text messages from CarryOn&trade; for account verification and security purposes. Message and data rates may apply. Reply STOP to opt out. By creating an account, I also agree to the{' '}
                  <Link to="/terms" className="text-[#d4af37] hover:text-[#fcd34d] underline underline-offset-2" data-testid="signup-terms-link">Terms of Service</Link>{' '}and{' '}
                  <Link to="/privacy" className="text-[#d4af37] hover:text-[#fcd34d] underline underline-offset-2" data-testid="signup-privacy-link">Privacy Policy</Link>.
                </label>
              </div>

              {/* Submit */}
              <Button type="submit" disabled={loading}
                className="w-full h-12 rounded-lg font-semibold text-base mt-2"
                style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a', boxShadow: '0 4px 24px rgba(212,175,55,0.3)' }}
                data-testid="signup-submit-button"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Creating Account...</>
                ) : (
                  <>Create Account <ChevronRight className="w-4 h-4 ml-1" /></>
                )}
              </Button>
            </form>

            {/* Login link */}
            <div className="mt-6 pt-5 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="text-[#525c72] text-sm">Already have an account? </span>
              <Link to="/login" className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors">
                Sign In
              </Link>
            </div>
          </div>

          {/* Security footer */}
          <div className="mt-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Shield className="w-3.5 h-3.5 text-[#10b981]" />
              <span className="text-[#525c72] text-xs">Bank-grade security · 256-bit SSL</span>
            </div>
            <div className="flex items-center justify-center gap-4 mb-3">
              {['AES-256 Encrypted', 'Zero-Knowledge', 'SOC 2'].map(badge => (
                <div key={badge} className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                  <span className="text-[#3a4a63] text-xs">{badge}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3">
              <Link to="/privacy" className="text-[#3a4a63] text-xs hover:text-[#7b879e] transition-colors" data-testid="signup-footer-privacy-link">Privacy Policy</Link>
              <span className="text-[#2d3d55] text-xs">&middot;</span>
              <Link to="/terms" className="text-[#3a4a63] text-xs hover:text-[#7b879e] transition-colors" data-testid="signup-footer-terms-link">Terms of Service</Link>
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
                {otpHint && (
                  <span className="block mt-1 text-[#d4af37] text-sm">
                    (Hint: starts with {otpHint})
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex flex-col items-center py-6">
              <Input
                type="text" inputMode="numeric" maxLength={6} value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="h-14 text-center text-2xl tracking-[0.4em] font-mono bg-[#0b1322] border-[#1a2a42] text-white focus:border-[#d4af37] rounded-lg w-full"
                data-testid="signup-otp-input" autoFocus
              />
              <p className="text-[#3a4a63] text-sm mt-2">{otp.length}/6 digits entered</p>

              <Button onClick={handleVerifyOtp} disabled={loading || otp.length !== 6}
                className="mt-6 w-full h-12 rounded-lg font-semibold"
                style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
                data-testid="signup-otp-verify-button"
              >
                {loading ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Verifying...</> : 'Verify & Continue'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SignupPage;
