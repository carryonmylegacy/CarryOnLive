import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
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

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const result = await login(email, password);
      setOtpHint(result.otp_hint);
      setShowOtpModal(true);
      toast.success('OTP sent to your email');
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
        background: 'linear-gradient(145deg, #0b1120, #0f1d35 40%, #0a1628)'
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
      
      <div className="w-full max-width-[400px] max-w-md relative z-10 animate-fade-in">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#d4af37] to-[#fcd34d] flex items-center justify-center gold-glow">
            <Shield className="w-10 h-10 text-[#0b1120]" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
            CarryOn™
          </h1>
          <p className="text-[#94a3b8] text-sm tracking-wider">
            Every American Family. Ready.
          </p>
          <div className="mt-3 px-4 py-1.5 bg-[#0f1d35]/60 backdrop-blur rounded-full inline-block">
            <span className="text-xs text-[#64748b] tracking-widest uppercase">
              Benefactor Portal
            </span>
          </div>
        </div>

        {/* Login Form */}
        <div className="glass-card p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[#94a3b8] text-sm">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748b]" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="pete@mitchell.com"
                  className="input-field pl-11"
                  data-testid="login-email-input"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#94a3b8] text-sm">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748b]" />
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
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
            <span className="text-[#64748b] text-sm">New to CarryOn™? </span>
            <button className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors">
              Create Account
            </button>
          </div>
        </div>

        {/* Security Badge */}
        <div className="mt-6 text-center">
          <p className="text-[#64748b] text-sm">
            AES-256 Encrypted · Zero-Knowledge · SOC 2
          </p>
        </div>

        {/* Test Credentials Hint */}
        <div className="mt-4 p-3 bg-[#0f1d35]/40 rounded-xl border border-white/5">
          <p className="text-xs text-[#64748b] text-center">
            <strong className="text-[#94a3b8]">Test Accounts:</strong><br />
            Benefactor: pete@mitchell.com / password123<br />
            Beneficiary: penny@mitchell.com / password123<br />
            Admin: admin@carryon.com / admin123
          </p>
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
