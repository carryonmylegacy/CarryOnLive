import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  Lock, Eye, EyeOff, Loader2, CheckCircle, AlertCircle,
  Heart, Shield, Users, FileText, ChevronRight, ArrowLeft
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from '../utils/toast';

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
  const [step, setStep] = useState(1);

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
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return false; }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) { toast.error('Password must contain uppercase, lowercase, and a number'); return false; }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return false; }
    return true;
  };

  const handleAccept = async () => {
    if (!validatePassword()) return;
    setSubmitting(true);
    try {
      const response = await axios.post(`${API_URL}/invitations/accept`, {
        token, password, phone: phone ? `+1${phone.replace(/\D/g, '')}` : null
      });
      setAccepted(true);
      setTimeout(() => { login(response.data.access_token, response.data.user); navigate('/beneficiary'); }, 3000);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to create account'); }
    finally { setSubmitting(false); }
  };

  const benefactorFirst = invitationData?.benefactor_name?.split(' ')[0] || 'Someone';

  // Shared background
  const bgStyle = {
    background: 'linear-gradient(168deg, #080e1a 0%, #0d1627 30%, #111d35 60%, #0a1122 100%)',
    minHeight: '100vh',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={bgStyle}>
        <Loader2 className="w-12 h-12 text-[#d4af37] animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-6" style={bgStyle}>
        <div className="rounded-2xl p-8 text-center max-w-md w-full" style={{ background: 'rgba(15,22,41,0.8)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <AlertCircle className="w-16 h-16 text-[#ef4444] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Invalid Invitation</h2>
          <p className="text-[#94a3b8] mb-6">{error}</p>
          <Button onClick={() => navigate('/login')} className="gold-button">Go to Login</Button>
        </div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="flex items-center justify-center p-6" style={bgStyle}>
        <div className="rounded-2xl p-8 text-center max-w-lg w-full" style={{ background: 'rgba(15,22,41,0.8)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <CheckCircle className="w-10 h-10 text-[#10b981]" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Welcome to CarryOn, {invitationData?.beneficiary?.first_name}
          </h2>
          <p className="text-[#94a3b8] mb-2">Your account has been created. You're now connected to {invitationData?.benefactor_name}'s estate plan.</p>
          <p className="text-xs text-[#525c72] mb-6">This is a private, secure connection. Take your time getting familiar.</p>
          <Loader2 className="w-6 h-6 text-[#d4af37] animate-spin mx-auto" />
          <p className="text-xs text-[#525c72] mt-2">Taking you to your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={bgStyle} className="relative overflow-hidden">
      {/* Background accents */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 50% at 20% 40%, rgba(212,175,55,0.04), transparent 60%), radial-gradient(ellipse 60% 40% at 80% 60%, rgba(59,130,246,0.03), transparent 50%)' }} />

      {/* Nav */}
      <nav className="fixed top-0 w-full z-50" style={{ borderBottom: '1px solid rgba(212,175,55,0.08)', background: 'rgba(8,14,26,0.85)', backdropFilter: 'blur(20px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <h1 className="text-lg font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
            <span className="text-[#d4af37]">CarryOn</span><span className="text-white text-xs align-top">™</span>
          </h1>
          <button onClick={() => navigate('/login')} className="text-[#6b7a90] text-sm font-medium">Sign In</button>
        </div>
      </nav>

      {step === 1 ? (
        /* ═══ STEP 1: Warm Introduction ═══ */
        <div className="pt-20 pb-12 px-4 sm:px-6" style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top, 0px))' }}>
          <div className="max-w-6xl mx-auto lg:grid lg:grid-cols-2 lg:gap-16 lg:items-start">
            
            {/* Left: Hero message */}
            <div className="mb-10 lg:mb-0 lg:sticky lg:top-24">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))', border: '1px solid rgba(212,175,55,0.2)' }}>
                <Heart className="w-8 h-8 text-[#d4af37]" />
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Someone special is<br />thinking of <span className="text-[#d4af37]">you</span>
              </h1>
              <p className="text-lg text-[#94a3b8] leading-relaxed mb-8">
                <span className="text-[#d4af37] font-semibold">{invitationData?.benefactor_name}</span> has included you in their estate plan on CarryOn™
              </p>

              {/* Feature pills — desktop only */}
              <div className="hidden lg:grid grid-cols-2 gap-3">
                {[
                  { icon: FileText, label: 'Secure Documents', desc: 'Encrypted & accessible', color: '#3b82f6' },
                  { icon: Heart, label: 'Personal Messages', desc: 'Written just for you', color: '#ec4899' },
                  { icon: Users, label: 'Action Checklist', desc: 'Nothing falls through', color: '#f59e0b' },
                  { icon: Shield, label: 'Bank-Grade Security', desc: 'AES-256 zero-knowledge', color: '#10b981' },
                ].map((f, i) => (
                  <div key={i} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <f.icon className="w-5 h-5 mb-2" style={{ color: f.color }} />
                    <div className="text-sm font-bold text-white">{f.label}</div>
                    <div className="text-xs text-[#64748b]">{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Glass card */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15,22,41,0.6)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
              <div className="p-6 sm:p-8 space-y-6">
                {/* What this means */}
                <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-sm text-white font-bold mb-3">What does this mean?</p>
                  <p className="text-sm text-[#94a3b8] leading-relaxed mb-3">
                    Estate planning is one of the most thoughtful things someone can do for the people they love. 
                    By including you, {benefactorFirst} is making sure that if anything ever happens, 
                    you'll have access to important documents, messages, and guidance — all in one secure place.
                  </p>
                  <p className="text-sm text-[#94a3b8] leading-relaxed">
                    <span className="text-white font-medium">There's nothing you need to do right now</span> except create your account. 
                    Everything is handled quietly in the background.
                  </p>
                </div>

                {/* Features — mobile only */}
                <div className="lg:hidden space-y-2">
                  <p className="text-[10px] text-[#525c72] uppercase font-bold tracking-wider">When the time comes, you'll have</p>
                  {[
                    { icon: FileText, label: 'Important documents — securely stored and encrypted', color: '#3b82f6' },
                    { icon: Heart, label: 'Personal messages — written just for you', color: '#ec4899' },
                    { icon: Users, label: 'A clear action checklist — so nothing falls through the cracks', color: '#f59e0b' },
                    { icon: Shield, label: 'Bank-grade security — AES-256 encrypted, zero-knowledge', color: '#10b981' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: item.color }} />
                      <span className="text-sm text-[#94a3b8]">{item.label}</span>
                    </div>
                  ))}
                </div>

                {/* Your info */}
                <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.1)' }}>
                  <p className="text-[10px] text-[#525c72] uppercase font-bold tracking-wider mb-2">Your Information</p>
                  <p className="text-white font-bold">{invitationData?.beneficiary?.first_name} {invitationData?.beneficiary?.last_name}</p>
                  <p className="text-sm text-[#94a3b8]">{invitationData?.beneficiary?.email}</p>
                  <p className="text-xs text-[#d4af37] mt-1 capitalize font-bold">{invitationData?.beneficiary?.relation}</p>
                </div>

                {/* CTA */}
                <Button onClick={() => setStep(2)} className="w-full h-12 text-base font-bold" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a', boxShadow: '0 4px 24px rgba(212,175,55,0.3)' }} data-testid="continue-to-account-btn">
                  Continue to Create Account <ChevronRight className="w-5 h-5 ml-2" />
                </Button>

                <p className="text-[10px] text-center text-[#525c72] leading-relaxed">
                  Your privacy is our priority. All data is AES-256 encrypted with zero-knowledge architecture. 
                  We will never share your information. No one — not even us — can read your data.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ═══ STEP 2: Create Account ═══ */
        <div className="pt-20 pb-12 px-4 sm:px-6" style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top, 0px))' }}>
          <div className="max-w-6xl mx-auto lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center">

            {/* Left: Reassurance */}
            <div className="hidden lg:block">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Shield className="w-7 h-7 text-[#10b981]" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Your security is<br />our foundation
              </h2>
              <p className="text-[#94a3b8] leading-relaxed mb-8">
                Your password is hashed with bcrypt and never stored in plain text. 
                Two-factor authentication protects every login. Your documents are encrypted with AES-256 — 
                the same standard used by banks and governments.
              </p>
              <div className="space-y-3">
                {['End-to-end encryption', 'Zero-knowledge architecture', 'SOC 2 compliance framework', '2FA on every login'].map((t, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-[#10b981]" />
                    <span className="text-sm text-[#94a3b8]">{t}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Form */}
            <div className="max-w-md mx-auto lg:max-w-none w-full">
              <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(15,22,41,0.6)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
                <button onClick={() => setStep(1)} className="flex items-center gap-1.5 text-sm text-[#6b7a90] font-medium mb-5">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <h1 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Create Your Secure Account</h1>
                <p className="text-sm text-[#64748b] mb-6">Your credentials are never stored in plain text</p>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-[#94a3b8] text-sm">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a4a63]" />
                      <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 8 chars, upper + lower + number"
                        className="h-12 bg-[#0b1322] border-[#1a2a42] text-white placeholder:text-[#2d3d55] focus:border-[#d4af37] rounded-xl pl-10 pr-10"
                        data-testid="invitation-password-input" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#3a4a63]">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {password && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {[
                          { test: password.length >= 8, label: '8+ chars' },
                          { test: /[A-Z]/.test(password), label: 'Uppercase' },
                          { test: /[a-z]/.test(password), label: 'Lowercase' },
                          { test: /[0-9]/.test(password), label: 'Number' },
                        ].map((req, i) => (
                          <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${req.test ? 'bg-[#10b981]/15 text-[#10b981]' : 'bg-[rgba(255,255,255,0.03)] text-[#3a4a63]'}`}>
                            {req.test ? '\u2713 ' : ''}{req.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[#94a3b8] text-sm">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a4a63]" />
                      <Input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your password"
                        className="h-12 bg-[#0b1322] border-[#1a2a42] text-white placeholder:text-[#2d3d55] focus:border-[#d4af37] rounded-xl pl-10"
                        data-testid="invitation-confirm-password-input" />
                    </div>
                    {password && confirmPassword && password !== confirmPassword && (
                      <p className="text-xs text-[#ef4444] mt-1">Passwords do not match</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[#94a3b8] text-sm">Phone (Optional)</Label>
                    <Input type="tel" value={phone}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                        let formatted = digits;
                        if (digits.length > 6) formatted = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
                        else if (digits.length > 3) formatted = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
                        else if (digits.length > 0) formatted = `(${digits}`;
                        setPhone(formatted);
                      }}
                      placeholder="(123) 456-7890"
                      className="h-12 bg-[#0b1322] border-[#1a2a42] text-white placeholder:text-[#2d3d55] focus:border-[#d4af37] rounded-xl" />
                  </div>
                </div>

                <Button onClick={handleAccept} disabled={submitting || !password || !confirmPassword}
                  className="w-full h-12 text-base font-bold mt-6"
                  style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a', boxShadow: '0 4px 24px rgba(212,175,55,0.3)' }}
                  data-testid="accept-invitation-submit">
                  {submitting ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Creating Account...</> : <><CheckCircle className="w-5 h-5 mr-2" />Create Account & Connect</>}
                </Button>

                <div className="flex items-center gap-2 justify-center mt-4">
                  <Shield className="w-3 h-3 text-[#10b981]" />
                  <p className="text-[10px] text-[#525c72]">AES-256 encrypted | Zero-knowledge | 2FA Protected</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AcceptInvitationPage;
