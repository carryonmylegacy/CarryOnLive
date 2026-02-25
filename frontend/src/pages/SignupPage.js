import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Mail, Lock, Eye, EyeOff, Loader2, User, ArrowLeft, AlertCircle } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');

  const handleSignup = async (e) => {
    e.preventDefault();
    
    if (!firstName.trim()) {
      toast.error('Please enter your first name');
      return;
    }
    if (!lastName.trim()) {
      toast.error('Please enter your last name');
      return;
    }
    if (!email.trim()) {
      toast.error('Please enter your email');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        suffix: suffix === 'none' ? null : suffix,
        gender: gender === 'not_selected' ? null : gender,
        email,
        password,
        role
      });
      
      setRegisteredEmail(email);
      setOtpHint(response.data.otp_hint);
      setShowOtpModal(true);
      toast.success('Account created! Please verify with OTP.');
    } catch (error) {
      console.error('Signup error:', error);
      toast.error(error.response?.data?.detail || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }
    
    setLoading(true);
    try {
      const user = await verifyOtp(registeredEmail, otp);
      toast.success(`Welcome to CarryOn™, ${user.name}!`);
      
      if (user.role === 'beneficiary') {
        navigate('/beneficiary');
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('OTP error:', error);
      toast.error(error.response?.data?.detail || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 py-12"
      style={{
        background: 'linear-gradient(145deg, #08090F, #0D1018 40%, #08090F)'
      }}
    >
      <div 
        className="fixed top-[10%] left-[15%] w-[400px] h-[400px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(37, 99, 180, 0.08), transparent 70%)',
          borderRadius: '50%'
        }}
      />
      
      <div className="w-full max-w-lg relative z-10 animate-fade-in">
        {/* Back to Login */}
        <Link to="/login" className="inline-flex items-center gap-2 text-[#A0AABF] hover:text-white mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Login
        </Link>
        
        {/* Logo & Branding */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-[#E0AD2B] to-[#F0C95C] flex items-center justify-center gold-glow">
            <Shield className="w-8 h-8 text-[#08090F]" />
          </div>
          <h1 className="text-2xl font-bold text-[#F1F3F8] mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Create Your Account
          </h1>
          <p className="text-[#A0AABF] text-sm">
            Start securing your family's legacy today
          </p>
        </div>

        {/* Signup Form */}
        <div className="glass-card p-6">
          {/* Legal Disclaimer */}
          <div className="mb-6 p-3 bg-[#F5A623]/10 border border-[#F5A623]/20 rounded-xl">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-[#F5A623] flex-shrink-0 mt-0.5" />
              <p className="text-[#F5A623] text-xs">
                <strong>Important:</strong> Please enter your name exactly as it appears on your legal documents. 
                This ensures CarryOn™ can fully support your estate planning needs and legal document verification.
              </p>
            </div>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            {/* Name Fields Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-[#A0AABF] text-sm">First Name *</Label>
                <Input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  className="input-field"
                  data-testid="signup-firstname-input"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="middleName" className="text-[#A0AABF] text-sm">Middle Name</Label>
                <Input
                  id="middleName"
                  type="text"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                  placeholder="William"
                  className="input-field"
                  data-testid="signup-middlename-input"
                />
              </div>
            </div>

            {/* Last Name and Suffix Row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="lastName" className="text-[#A0AABF] text-sm">Last Name *</Label>
                <Input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Mitchell"
                  className="input-field"
                  data-testid="signup-lastname-input"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="suffix" className="text-[#A0AABF] text-sm">Suffix</Label>
                <Select value={suffix} onValueChange={setSuffix}>
                  <SelectTrigger className="input-field" data-testid="signup-suffix-select">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0D1018] border-white/[0.07]">
                    {suffixOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Gender */}
            <div className="space-y-2">
              <Label htmlFor="gender" className="text-[#A0AABF] text-sm">Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger className="input-field" data-testid="signup-gender-select">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0D1018] border-white/[0.07]">
                  {genderOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[#A0AABF] text-sm">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#525C72]" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="input-field pl-11"
                  data-testid="signup-email-input"
                  required
                />
              </div>
            </div>

            {/* Password Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#A0AABF] text-sm">Password *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#525C72]" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-field pl-11 pr-11"
                    data-testid="signup-password-input"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#525C72] hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-[#A0AABF] text-sm">Confirm *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#525C72]" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-field pl-11"
                    data-testid="signup-confirm-password-input"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label htmlFor="role" className="text-[#A0AABF] text-sm">I am a...</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="input-field" data-testid="signup-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0D1018] border-white/[0.07]">
                  <SelectItem value="benefactor">Benefactor (Estate Owner)</SelectItem>
                  <SelectItem value="beneficiary">Beneficiary (Family Member)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="gold-button w-full mt-4"
              data-testid="signup-submit-button"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <span className="text-[#7B879E] text-sm">Already have an account? </span>
            <Link to="/login" className="text-[#7AABFD] text-sm font-semibold hover:text-[#A5C6FE] transition-colors">
              Sign In
            </Link>
          </div>
        </div>

        {/* Security Badge */}
        <div className="mt-4 text-center">
          <p className="text-[#525C72] text-xs">
            AES-256 Encrypted · Zero-Knowledge · SOC 2
          </p>
        </div>
      </div>

      {/* OTP Modal */}
      <Dialog open={showOtpModal} onOpenChange={setShowOtpModal}>
        <DialogContent className="glass-card border-white/[0.07] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#F1F3F8] text-xl font-semibold" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Verify Your Email
            </DialogTitle>
            <DialogDescription className="text-[#A0AABF]">
              Enter the 6-digit code sent to {registeredEmail}
              {otpHint && (
                <span className="block mt-1 text-[#E0AD2B]">
                  (Hint: starts with {otpHint})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col items-center py-6">
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="input-field text-center text-3xl tracking-[0.5em] font-mono w-full"
              data-testid="signup-otp-input"
              autoFocus
            />
            <p className="text-[#525C72] text-sm mt-2">
              {otp.length}/6 digits entered
            </p>

            <Button
              onClick={handleVerifyOtp}
              disabled={loading || otp.length !== 6}
              className="gold-button mt-6 w-full"
              data-testid="signup-otp-verify-button"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Continue'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SignupPage;
