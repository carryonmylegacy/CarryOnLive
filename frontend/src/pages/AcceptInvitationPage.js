import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  Lock, Eye, EyeOff, Loader2, CheckCircle, AlertCircle,
  Heart, Shield, Users, FileText, ChevronRight
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AcceptInvitationPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [invitationData, setInvitationData] = useState(null);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [step, setStep] = useState(1); // 1=intro, 2=create account

  useEffect(() => {
    fetchInvitationDetails();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchInvitationDetails = async () => {
    try {
      const response = await axios.get(`${API_URL}/invitations/${token}`);
      setInvitationData(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid or expired invitation link');
    } finally {
      setLoading(false);
    }
  };

  const validatePassword = () => {
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return false;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      toast.error('Password must contain uppercase, lowercase, and a number');
      return false;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return false;
    }
    return true;
  };

  const handleAccept = async () => {
    if (!validatePassword()) return;
    
    setSubmitting(true);
    try {
      const response = await axios.post(`${API_URL}/invitations/accept`, {
        token,
        password,
        phone: phone ? `+1${phone.replace(/\D/g, '')}` : null
      });
      
      setAccepted(true);
      toast.success('Welcome to CarryOn!');
      
      setTimeout(() => {
        login(response.data.access_token, response.data.user);
        navigate('/beneficiary');
      }, 3000);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" 
        style={{ background: 'linear-gradient(135deg, #0B1628 0%, #1A2A4A 50%, #0D1B2E 100%)' }}>
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-[#d4af37] animate-spin mx-auto mb-4" />
          <p className="text-[#94a3b8]">Loading your invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #0B1628 0%, #1A2A4A 50%, #0D1B2E 100%)' }}>
        <Card className="glass-card max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-[#ef4444] mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Invalid Invitation</h2>
            <p className="text-[#94a3b8] mb-6">{error}</p>
            <Button onClick={() => navigate('/login')} className="gold-button">Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #0B1628 0%, #1A2A4A 50%, #0D1B2E 100%)' }}>
        <Card className="glass-card max-w-lg w-full">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-[#10b981]/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-[#10b981]" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Welcome to CarryOn, {invitationData?.beneficiary?.first_name}
            </h2>
            <p className="text-[#94a3b8] mb-2">
              Your account has been created. You're now connected to {invitationData?.benefactor_name}'s estate plan.
            </p>
            <p className="text-xs text-[#64748b] mb-6">
              This is a private, secure connection. Take your time getting familiar with the platform.
            </p>
            <Loader2 className="w-6 h-6 text-[#d4af37] animate-spin mx-auto" />
            <p className="text-xs text-[#64748b] mt-2">Taking you to your dashboard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0B1628 0%, #1A2A4A 50%, #0D1B2E 100%)' }}>
      <Card className="glass-card max-w-lg w-full" data-testid="accept-invitation-card">
        <CardContent className="p-6 sm:p-8">
          {step === 1 ? (
            /* Step 1: Warm Introduction */
            <div className="space-y-6">
              {/* Header */}
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-[#d4af37]/15 flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-8 h-8 text-[#d4af37]" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Someone special is thinking of you
                </h1>
                <p className="text-[#94a3b8] text-sm">
                  <span className="text-[#d4af37] font-semibold">{invitationData?.benefactor_name}</span> has included you in their estate plan on CarryOn
                </p>
              </div>

              {/* What This Means */}
              <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                <p className="text-sm text-white font-medium">What does this mean?</p>
                <p className="text-sm text-[#94a3b8] leading-relaxed">
                  Estate planning is one of the most thoughtful things someone can do for the people they love. 
                  By including you, {invitationData?.benefactor_name?.split(' ')[0]} is making sure that if anything ever happens, 
                  you'll have access to important documents, messages, and guidance — all in one secure place.
                </p>
                <p className="text-sm text-[#94a3b8] leading-relaxed">
                  <span className="text-white font-medium">There's nothing you need to do right now</span> except create your account. 
                  Everything is handled quietly in the background.
                </p>
              </div>

              {/* What You'll Have Access To */}
              <div className="space-y-2">
                <p className="text-xs text-[#64748b] uppercase font-medium tracking-wider">When the time comes, you'll have</p>
                {[
                  { icon: FileText, label: 'Important documents — securely stored and encrypted', color: '#3b82f6' },
                  { icon: Heart, label: 'Personal messages — written just for you', color: '#ec4899' },
                  { icon: Users, label: 'A clear action checklist — so nothing falls through the cracks', color: '#f59e0b' },
                  { icon: Shield, label: 'Bank-grade security — AES-256 encrypted, zero-knowledge', color: '#10b981' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--s)]">
                    <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: item.color }} />
                    <span className="text-sm text-[#94a3b8]">{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Your Information */}
              <div className="p-4 rounded-xl bg-[var(--s)]">
                <p className="text-xs text-[#64748b] uppercase mb-2">Your Information</p>
                <p className="text-white font-medium">
                  {invitationData?.beneficiary?.first_name} {invitationData?.beneficiary?.last_name}
                </p>
                <p className="text-sm text-[#94a3b8]">{invitationData?.beneficiary?.email}</p>
                <p className="text-xs text-[#d4af37] mt-1 capitalize">{invitationData?.beneficiary?.relation}</p>
              </div>

              <Button
                onClick={() => setStep(2)}
                className="gold-button w-full"
                data-testid="continue-to-account-btn"
              >
                Continue to Create Account
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>

              <p className="text-[10px] text-center text-[#64748b] leading-relaxed">
                Your privacy is our priority. All data is AES-256 encrypted with zero-knowledge architecture. 
                We will never share your information. No one — not even us — can read your data.
              </p>
            </div>
          ) : (
            /* Step 2: Create Account */
            <div className="space-y-5">
              <div className="text-center mb-2">
                <button onClick={() => setStep(1)} className="text-xs text-[#64748b] hover:text-white mb-3 inline-block">
                  &larr; Back
                </button>
                <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Create Your Secure Account
                </h1>
                <p className="text-sm text-[#94a3b8] mt-1">
                  Your credentials are never stored in plain text
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[#94a3b8] text-sm">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 8 chars, upper + lower + number"
                      className="input-field pl-10 pr-10"
                      data-testid="invitation-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Password strength indicator */}
                  {password && (
                    <div className="flex gap-1 mt-1">
                      {[
                        { test: password.length >= 8, label: '8+ chars' },
                        { test: /[A-Z]/.test(password), label: 'Uppercase' },
                        { test: /[a-z]/.test(password), label: 'Lowercase' },
                        { test: /[0-9]/.test(password), label: 'Number' },
                      ].map((req, i) => (
                        <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${req.test ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-[var(--s)] text-[#64748b]'}`}>
                          {req.test ? '\u2713' : ''} {req.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-[#94a3b8] text-sm">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      className="input-field pl-10"
                      data-testid="invitation-confirm-password-input"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[#94a3b8] text-sm">Phone (Optional)</Label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                      let formatted = digits;
                      if (digits.length > 6) formatted = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
                      else if (digits.length > 3) formatted = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
                      else if (digits.length > 0) formatted = `(${digits}`;
                      setPhone(formatted);
                    }}
                    placeholder="(123) 456-7890"
                    className="input-field"
                  />
                </div>
              </div>

              <Button
                onClick={handleAccept}
                disabled={submitting || !password || !confirmPassword}
                className="gold-button w-full"
                data-testid="accept-invitation-submit"
              >
                {submitting ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Creating Account...</>
                ) : (
                  <><CheckCircle className="w-5 h-5 mr-2" />Create Account & Connect</>
                )}
              </Button>

              <div className="flex items-center gap-2 justify-center">
                <Shield className="w-3 h-3 text-[#10b981]" />
                <p className="text-[10px] text-[#64748b]">
                  AES-256 encrypted | Zero-knowledge | 2FA Protected
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AcceptInvitationPage;
