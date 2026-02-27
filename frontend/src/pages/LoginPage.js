import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, Eye, EyeOff, Loader2, Shield, FileText, Users, Brain, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, verifyOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.direct) {
        toast.success(`Welcome back, ${result.user.name}!`);
        if (result.user.role === 'admin') navigate('/admin');
        else if (result.user.role === 'beneficiary') navigate('/beneficiary');
        else navigate('/dashboard');
      } else {
        setShowOtpModal(true);
        toast.success('OTP sent to your email');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { toast.error('Enter a valid 6-digit OTP'); return; }
    setLoading(true);
    try {
      const user = await verifyOtp(email, otp);
      toast.success(`Welcome back, ${user.name}!`);
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'beneficiary') navigate('/beneficiary');
      else navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Shield, label: 'Vault Storage', desc: 'Encrypted document vault for wills, trusts & policies' },
    { icon: Users, label: 'Beneficiary Hub', desc: 'Manage & notify loved ones seamlessly' },
    { icon: Brain, label: 'AI Guardian', desc: 'Estate law AI covering all 50 states' },
    { icon: FileText, label: 'Legal Readiness', desc: 'Checklists, compliance & transition planning' },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#0a1220' }}>
      {/* ── NAV BAR ── */}
      <nav className="border-b" style={{ borderColor: 'rgba(212,175,55,0.12)', background: 'rgba(10,18,32,0.95)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <img src="/carryon-logo.jpg" alt="CarryOn" className="h-10" />
            <div className="hidden md:flex items-center gap-6">
              {['Estate Planning', 'AI Guardian', 'Pricing', 'About'].map(item => (
                <span key={item} className="text-[#8896ab] text-sm font-medium hover:text-[#d4af37] transition-colors cursor-pointer">{item}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline text-[#8896ab] text-sm">Need help?</span>
            <a href="/signup" className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors">
              Open an Account <ChevronRight className="w-3 h-3 inline" />
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO SECTION ── */}
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center min-h-[calc(100vh-10rem)] py-12">

          {/* LEFT — Branding & Animation */}
          <div className="order-2 lg:order-1">
            {/* Animated Logo Container */}
            <div className="relative mb-10">
              <div className="logo-glow-container relative w-[280px] h-[280px] mx-auto lg:mx-0">
                {/* Orbiting light */}
                <div className="absolute inset-0">
                  <div className="logo-orbit" />
                </div>
                {/* Logo */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <img src="/carryon-logo.jpg" alt="CarryOn" className="w-[200px] h-auto relative z-10" />
                </div>
                {/* Ambient glow */}
                <div className="absolute inset-0 rounded-full" style={{
                  background: 'radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)',
                }} />
              </div>
            </div>

            <div className="text-center lg:text-left">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.1] mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Every American Family.
                <span className="block text-[#d4af37]">Ready.</span>
              </h1>
              <p className="text-[#8896ab] text-lg lg:text-xl max-w-lg mb-6 leading-relaxed">
                Secure your legacy with AI-powered estate planning. 
                Protect what matters, guide who you love.
              </p>
              <div className="flex items-center gap-6 justify-center lg:justify-start">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                  <span className="text-[#6b7a90] text-xs">AES-256 Encrypted</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                  <span className="text-[#6b7a90] text-xs">Zero-Knowledge</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                  <span className="text-[#6b7a90] text-xs">SOC 2</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — Login Card */}
          <div className="order-1 lg:order-2 flex justify-center lg:justify-end">
            <div className="w-full max-w-[400px] rounded-2xl p-8 relative" style={{
              background: 'linear-gradient(145deg, rgba(20,30,52,0.95), rgba(15,22,41,0.98))',
              border: '1px solid rgba(212,175,55,0.15)',
              boxShadow: '0 4px 60px rgba(0,0,0,0.4), 0 0 40px rgba(212,175,55,0.03)',
            }}>
              {/* Card accent line */}
              <div className="absolute top-0 left-8 right-8 h-[2px]" style={{
                background: 'linear-gradient(90deg, transparent, #d4af37, transparent)',
              }} />

              <h2 className="text-white text-xl font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Benefactor Sign In
              </h2>
              <p className="text-[#6b7a90] text-sm mb-6">Access your estate planning portal</p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-[#8896ab] text-xs font-medium mb-1.5 block">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4a5568]" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      className="h-11 pl-10 bg-[#0d1526] border-[#1e2d45] text-white placeholder:text-[#3a4a63] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg"
                      data-testid="login-email-input"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[#8896ab] text-xs font-medium mb-1.5 block">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4a5568]" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="h-11 pl-10 pr-10 bg-[#0d1526] border-[#1e2d45] text-white placeholder:text-[#3a4a63] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg"
                      data-testid="login-password-input"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4a5568] hover:text-[#8896ab] transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-lg font-semibold text-sm"
                  data-testid="login-submit-button"
                  style={{
                    background: 'linear-gradient(135deg, #d4af37, #b8962e)',
                    color: '#0a1220',
                  }}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing In...</>
                  ) : 'Sign In'}
                </Button>
              </form>

              <div className="mt-5 flex items-center justify-between">
                <a href="/signup" className="text-[#d4af37] text-sm font-medium hover:text-[#fcd34d] transition-colors">
                  Create Account
                </a>
                <span className="text-[#4a5568] text-xs">Forgot Password?</span>
              </div>

              <div className="mt-6 pt-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-[#10b981]" />
                  <span className="text-[#6b7a90] text-xs">Bank-grade security · 256-bit SSL</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FEATURES BAR ── */}
      <div style={{ background: 'rgba(15,22,38,0.6)', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="max-w-[1400px] mx-auto px-6 py-12">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="text-center group cursor-pointer">
                <div className="w-14 h-14 rounded-xl mx-auto mb-3 flex items-center justify-center transition-all group-hover:scale-105"
                  style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.12)' }}>
                  <Icon className="w-6 h-6 text-[#d4af37]" />
                </div>
                <h3 className="text-white text-sm font-semibold mb-1">{label}</h3>
                <p className="text-[#6b7a90] text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <a href="/privacy" className="text-[#4a5568] text-xs hover:text-[#8896ab] transition-colors" data-testid="login-footer-privacy-link">Privacy Policy</a>
            <a href="/terms" className="text-[#4a5568] text-xs hover:text-[#8896ab] transition-colors" data-testid="login-footer-terms-link">Terms of Service</a>
            <span className="text-[#4a5568] text-xs">Accessibility</span>
          </div>
          <p className="text-[#3a4a63] text-xs">
            &copy; {new Date().getFullYear()} CarryOn Technologies. All rights reserved.
          </p>
        </div>
      </footer>

      {/* ── OTP MODAL ── */}
      {showOtpModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl p-8" style={{
            background: 'linear-gradient(145deg, rgba(20,30,52,0.98), rgba(15,22,41,1))',
            border: '1px solid rgba(212,175,55,0.15)',
          }}>
            <h3 className="text-white text-xl font-semibold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Two-Factor Authentication
            </h3>
            <p className="text-[#6b7a90] text-sm mb-6">Enter the 6-digit code sent to your email</p>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="h-14 text-center text-2xl tracking-[0.4em] font-mono bg-[#0d1526] border-[#1e2d45] text-white focus:border-[#d4af37] rounded-lg mb-4"
              data-testid="otp-input"
              autoFocus
            />
            <Button
              onClick={handleVerifyOtp}
              disabled={loading || otp.length !== 6}
              className="w-full h-11 rounded-lg font-semibold"
              data-testid="otp-verify-button"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a1220' }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Sign In'}
            </Button>
            <button onClick={() => setShowOtpModal(false)} className="w-full mt-3 text-[#6b7a90] text-sm hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── CSS ANIMATIONS ── */}
      <style>{`
        .logo-glow-container {
          position: relative;
        }
        .logo-orbit {
          position: absolute;
          width: 12px;
          height: 12px;
          background: #d4af37;
          border-radius: 50%;
          box-shadow: 0 0 20px 8px rgba(212,175,55,0.4), 0 0 60px 20px rgba(212,175,55,0.15);
          animation: orbit 4s linear infinite;
          offset-path: path('M140,20 C220,20 260,80 260,140 C260,200 220,260 140,260 C60,260 20,200 20,140 C20,80 60,20 140,20');
          offset-distance: 0%;
        }
        @keyframes orbit {
          0% { offset-distance: 0%; opacity: 0.9; }
          50% { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0.9; }
        }
        @supports not (offset-path: path('M0,0')) {
          .logo-orbit {
            animation: orbit-fallback 4s linear infinite;
          }
          @keyframes orbit-fallback {
            0% { transform: rotate(0deg) translateX(120px) rotate(0deg); }
            100% { transform: rotate(360deg) translateX(120px) rotate(-360deg); }
          }
        }
      `}</style>
    </div>
  );
};

export default LoginPage;
