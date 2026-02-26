import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, Eye, EyeOff, Loader2, Phone, MessageSquare } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { toast } from 'sonner';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, verifyOtp, pendingEmail } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [otpMethod, setOtpMethod] = useState('email'); // 'email' or 'sms'
  const [phone, setPhone] = useState('');
  const [showPhoneInput, setShowPhoneInput] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    
    // If SMS is selected but no phone, show phone input first
    if (otpMethod === 'sms' && !phone && !showPhoneInput) {
      setShowPhoneInput(true);
      return;
    }
    
    if (otpMethod === 'sms' && !phone) {
      toast.error('Please enter your phone number for SMS verification');
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await login(email, password, otpMethod, phone);
      setOtpHint(result.otp_hint);
      if (result.dev_otp) setOtp(result.dev_otp);
      setShowOtpModal(true);
      setShowPhoneInput(false);
      toast.success(otpMethod === 'sms' 
        ? `OTP sent to ***${phone.slice(-4)}` 
        : 'OTP sent to your email');
    } catch (error) {
      console.error('Login error:', error);
      toast.error(error.response?.data?.detail || 'Invalid credentials');
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
      const user = await verifyOtp(email, otp);
      toast.success(`Welcome back, ${user.name}!`);
      
      // Redirect based on role
      if (user.role === 'admin') {
        navigate('/admin');
      } else if (user.role === 'beneficiary') {
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
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(145deg, #0F1629, #141C33 40%, #0F1629)'
      }}
    >
      {/* Background glow */}
      <div 
        className="fixed top-[10%] left-[15%] w-[400px] h-[400px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(37, 99, 180, 0.08), transparent 70%)',
          borderRadius: '50%'
        }}
      />
      
      <div className="w-full max-w-[400px] relative z-10 animate-fade-in">
        {/* Logo & Branding */}
        <div className="text-center mb-7">
          <img 
            src="/carryon-logo.jpg" 
            alt="CarryOn™ Logo" 
            className="w-[200px] h-auto mx-auto mb-4"
          />
          <div className="text-[#F1F3F8] text-[15px] font-semibold tracking-wide" style={{ letterSpacing: '0.04em' }}>
            <div>Every American Family.</div>
            <div>Ready.</div>
          </div>
          <div className="mt-3">
            <span className="text-[#525C72] text-[16.5px] tracking-[0.05em] uppercase">
              Benefactor Portal
            </span>
          </div>
        </div>

        {/* Login Form */}
        <div className="glass-card p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[#A0AABF] text-sm">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#525C72]" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="pete.mitchell@email.com"
                  className="input-field pl-11"
                  data-testid="login-email-input"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#A0AABF] text-sm">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#525C72]" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  className="input-field pl-11 pr-11"
                  data-testid="login-password-input"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#525C72] hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* OTP Method Toggle */}
            <div className="space-y-3">
              <Label className="text-[#7B879E] text-sm">Verification Method</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setOtpMethod('email'); setShowPhoneInput(false); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border transition-all ${
                    otpMethod === 'email' 
                      ? 'border-[#d4af37] bg-[#d4af37]/10 text-[#d4af37]' 
                      : 'border-white/10 text-[#7B879E] hover:border-white/20'
                  }`}
                >
                  <Mail className="w-4 h-4" />
                  <span className="text-sm font-medium">Email</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOtpMethod('sms')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border transition-all ${
                    otpMethod === 'sms' 
                      ? 'border-[#d4af37] bg-[#d4af37]/10 text-[#d4af37]' 
                      : 'border-white/10 text-[#7B879E] hover:border-white/20'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-sm font-medium">SMS</span>
                </button>
              </div>
              
              {/* Phone input for SMS */}
              {showPhoneInput && otpMethod === 'sms' && (
                <div className="space-y-2 animate-fade-in">
                  <Label className="text-[#7B879E] text-sm">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#525C72]" />
                    <Input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      className="input-field pl-10"
                      data-testid="phone-input"
                    />
                  </div>
                  <p className="text-xs text-[#525C72]">
                    Enter your phone number to receive verification code via SMS
                  </p>
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="gold-button w-full"
              data-testid="login-submit-button"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-[#7B879E] text-[15.5px]">New to CarryOn™? </span>
            <a href="/signup" className="text-[#7AABFD] text-[15.5px] font-semibold hover:text-[#A5C6FE] transition-colors cursor-pointer">
              Create Account
            </a>
          </div>
        </div>

        {/* Security Badge & Legal Links */}
        <div className="mt-6 text-center space-y-2">
          <p className="text-[#525C72] text-[16.5px]">
            AES-256 Encrypted · Zero-Knowledge · SOC 2
          </p>
          <div className="flex items-center justify-center gap-3">
            <a href="/privacy" className="text-[#7B879E] text-xs hover:text-[#A0AABF] transition-colors" data-testid="login-footer-privacy-link">Privacy Policy</a>
            <span className="text-[#525C72] text-xs">·</span>
            <a href="/terms" className="text-[#7B879E] text-xs hover:text-[#A0AABF] transition-colors" data-testid="login-footer-terms-link">Terms of Service</a>
          </div>
        </div>
      </div>

      {/* OTP Modal */}
      <Dialog open={showOtpModal} onOpenChange={setShowOtpModal}>
        <DialogContent className="glass-card border-white/10 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-semibold" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Two-Factor Authentication
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              Enter the 6-digit code sent to your email
              {otpHint && (
                <span className="block mt-1 text-[#d4af37]">
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
              data-testid="otp-input"
              autoFocus
            />
            <p className="text-[#64748b] text-sm mt-2">
              {otp.length}/6 digits entered
            </p>

            <Button
              onClick={handleVerifyOtp}
              disabled={loading || otp.length !== 6}
              className="gold-button mt-6 w-full"
              data-testid="otp-verify-button"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Sign In'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LoginPage;
