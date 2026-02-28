import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, Eye, EyeOff, Loader2, Shield, FileText, Users, ChevronRight, ChevronDown, Lock as LockIcon, Sparkles, FileCheck, UserCheck, Trash2, ClipboardCheck, MessageSquare } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';

/* ─── scroll-reveal hook ─── */
const useReveal = (threshold = 0.15) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, visible];
};

const RevealSection = ({ children, className = '', delay = 0, direction = 'up', ...props }) => {
  const [ref, visible] = useReveal(0.12);
  const transforms = { up: 'translateY(60px)', down: 'translateY(-60px)', left: 'translateX(60px)', right: 'translateX(-60px)' };
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translate(0)' : transforms[direction],
      transition: `opacity 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
    }} {...props}>
      {children}
    </div>
  );
};

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, verifyOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [flagOpacity, setFlagOpacity] = useState(1);
  const [exiting, setExiting] = useState(false);

  const navigateWithFade = (path) => {
    setExiting(true);
    setTimeout(() => navigate(path), 500);
  };

  /* flag fade on scroll + dismiss Safari autofill */
  useEffect(() => {
    const handleScroll = () => {
      const fade = Math.max(0, 1 - window.scrollY / 600);
      setFlagOpacity(fade);
      // Blur focused inputs to dismiss Safari autofill dropdown
      if (document.activeElement && (document.activeElement.tagName === 'INPUT')) {
        document.activeElement.blur();
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  return (
    <div className="min-h-screen" style={{ background: '#080e1a' }}>

      {/* NAV BAR */}
      <nav className="fixed top-0 w-full z-50" style={{ borderBottom: '1px solid rgba(212,175,55,0.08)', background: 'rgba(8,14,26,0.85)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <img src="/carryon-logo.jpg" alt="CarryOn" className="h-12" />
          <div className="hidden md:flex items-center gap-8">
            {[
              { label: 'Features', href: '#features' },
              { label: 'Security', href: '#security' },
              { label: 'How It Works', href: '#steps' },
              { label: 'About', href: '/about' },
            ].map(item => (
              <a key={item.label} href={item.href} className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors duration-300">{item.label}</a>
            ))}
          </div>
          <a href="/signup" className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1">
            Open Account <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </nav>

      {/* ═══════════════════ HERO — FLAG BG + LOGO + LOGIN ═══════════════════ */}
      <section className="min-h-screen flex items-center pt-16 relative overflow-hidden">
        {/* Flag background that fades on scroll */}
        <div className="absolute inset-0 z-0" style={{ opacity: flagOpacity * 0.5 }}>
          <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" />
        </div>
        {/* Dark gradient overlay */}
        <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(8,14,26,0.4) 0%, rgba(8,14,26,0.85) 70%, #080e1a 100%)' }} />
        {/* Radial accent */}
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 70% 50% at 35% 50%, rgba(212,175,55,0.04) 0%, transparent 70%)' }} />

        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 w-full relative z-10">
          <div className="grid lg:grid-cols-[1fr_420px] gap-10 lg:gap-14 items-center">

            {/* LEFT — Logo + Tagline */}
            <RevealSection delay={0.1}>
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 lg:gap-8">
                <div className="flex-shrink-0">
                  <img src="/carryon-logo.jpg" alt="CarryOn" className="w-[200px] lg:w-[260px] h-auto" />
                </div>
                <div className="text-center sm:text-left flex-1 sm:pt-2">
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-[1.08] mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    Every American Family.
                    <span className="block text-[#d4af37] mt-1">Ready.</span>
                  </h1>
                  <p className="text-[#7b879e] text-sm lg:text-base max-w-sm leading-relaxed mb-5">
                    Secure your legacy with AI-powered estate planning. Protect what matters, guide who you love.
                  </p>
                  <div className="flex items-center gap-4 justify-center sm:justify-start mb-4">
                    {['AES-256 Encrypted', 'Zero-Knowledge', 'SOC 2'].map(badge => (
                      <div key={badge} className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                        <span className="text-[#525c72] text-xs">{badge}</span>
                      </div>
                    ))}
                  </div>
                  <a href="#about" className="inline-flex items-center gap-2 text-[#525c72] text-sm hover:text-[#d4af37] transition-colors">
                    Scroll to explore <ChevronDown className="w-4 h-4 animate-bounce" />
                  </a>
                </div>
              </div>
            </RevealSection>

            {/* RIGHT — Login Card */}
            <RevealSection delay={0.3} direction="right">
              <div className="flex justify-center lg:justify-end">
                <div className="w-full rounded-2xl p-8 relative login-card-glow" style={{
                  background: 'linear-gradient(160deg, rgba(18,28,48,0.97), rgba(12,20,38,0.99))',
                  border: '1px solid rgba(212,175,55,0.12)',
                  boxShadow: '0 8px 80px rgba(0,0,0,0.5), 0 0 50px rgba(212,175,55,0.02)',
                }}>
                  <div className="absolute top-0 left-8 right-8 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #d4af37, transparent)' }} />
                  <h2 className="text-white text-xl font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Sign In</h2>
                  <p className="text-[#525c72] text-sm mb-6">Access your CarryOn account</p>
                  <form onSubmit={handleLogin} className="space-y-4" autoComplete="off" data-lpignore="true">
                    <div>
                      <label className="text-[#7b879e] text-xs font-medium mb-1.5 block">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a4a63]" />
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required autoComplete="username"
                          className="h-11 pl-10 bg-[#0b1322] border-[#1a2a42] text-white placeholder:text-[#2d3d55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg" data-testid="login-email-input" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[#7b879e] text-xs font-medium mb-1.5 block">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a4a63]" />
                        <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" required autoComplete="current-password"
                          className="h-11 pl-10 pr-10 bg-[#0b1322] border-[#1a2a42] text-white placeholder:text-[#2d3d55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg" data-testid="login-password-input" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a4a63] hover:text-[#7b879e] transition-colors">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" disabled={loading} className="w-full h-11 rounded-lg font-semibold text-sm" data-testid="login-submit-button"
                      style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}>
                      {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing In...</> : 'Sign In'}
                    </Button>
                  </form>
                  <div className="mt-5 flex items-center justify-between">
                    <a href="/signup" className="text-[#d4af37] text-sm font-medium hover:text-[#fcd34d] transition-colors">Create Account</a>
                    <span className="text-[#3a4a63] text-xs cursor-pointer hover:text-[#7b879e] transition-colors">Forgot Password?</span>
                  </div>
                  <div className="mt-6 pt-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <div className="flex items-center justify-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-[#10b981]" />
                      <span className="text-[#525c72] text-xs">Bank-grade security &middot; 256-bit SSL</span>
                    </div>
                  </div>
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ═══════════════════ ABOUT — family roots ═══════════════════ */}
      <section id="about" className="relative z-10 -mt-2">
        <div className="rounded-t-[2.5rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#080e1a', boxShadow: '0 -20px 60px rgba(0,0,0,0.5)' }}>
          <div className="absolute inset-0 opacity-[0.2]" style={{ backgroundImage: 'url(/texture-roots.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(212,175,55,0.03) 0%, transparent 60%), linear-gradient(180deg, rgba(8,14,26,0.5) 0%, rgba(8,14,26,0.95) 100%)' }} />
          <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Your Family.<br />Ready for Anything.
            </h2>
            <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed mb-8">
              CarryOn&#8482; is the first platform designed to ensure family readiness for all American families &mdash; an affordable, secure digital infrastructure that organizes your estate documents, automates critical checklists, delivers milestone messages, and provides AI-powered document intelligence so your family is prepared, not searching.
            </p>
            <a href="/signup" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-sm transition-all hover:brightness-110 hover:scale-105 active:scale-95"
              style={{ background: '#d4af37', color: '#080e1a', transition: 'all 0.3s' }}>
              Get Started <ChevronRight className="w-4 h-4" />
            </a>
            <RevealSection delay={0.2}>
              <p className="mt-10 text-[#d4af37] text-sm lg:text-base italic font-medium">
                76% of American families have no estate plan. CarryOn ensures yours isn&apos;t one of them.
              </p>
            </RevealSection>
          </RevealSection>
        </div>
      </section>

      {/* ═══════════════════ REFRAME — slides over previous ═══════════════════ */}
      <section className="relative z-20 -mt-1">
        <div className="rounded-t-[2rem] py-20 lg:py-28 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a1628, #080e1a)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-warmth.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,22,40,0.6) 0%, rgba(8,14,26,0.95) 100%)' }} />
          <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Family Readiness Isn&apos;t Planning for Death.<br />
              <span className="text-[#d4af37]">It&apos;s Planning for Your Family.</span>
            </h2>
            <p className="text-[#7b879e] text-base leading-relaxed mb-8">
              Every family faces transitions &mdash; some expected, some sudden. Family readiness means your documents are organized, your wishes are clear, your checklists are built, and your loved ones know exactly what to do and where to look. CarryOn&#8482; is the secure digital infrastructure that makes all of this possible &mdash; in one place, on one platform, protected by zero-knowledge encryption.
            </p>
            <RevealSection delay={0.15}>
              <p className="text-white text-base lg:text-lg font-semibold italic leading-relaxed">
                You don&apos;t buy life insurance because you plan to die. You buy it because you plan to take care of your family. CarryOn works the same way.
              </p>
            </RevealSection>
          </RevealSection>
        </div>
      </section>

      {/* ═══════════════════ FOUR FEATURES — staggered cards ═══════════════════ */}
      <section id="features" className="relative z-30 -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#080e1a', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'url(/texture-circuit.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,14,26,0.55) 0%, rgba(8,14,26,0.9) 100%)' }} />
          <div className="max-w-[1100px] mx-auto px-6 relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white text-center mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Four Features.
              </h2>
              <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#d4af37] text-center mb-14" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Total Family Readiness.
              </h3>
            </RevealSection>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  icon: Sparkles, title: 'Estate Guardian\u2122 AI',
                  bold: 'An air-gapped AI analyst that lives inside your Secure Document Vault \u2014 with zero internet access.',
                  desc: 'Estate Guardian is a fully air-gapped AI powered by U.S. estate law across all 50 states and territories. It lives inside your Secure Document Vault \u2014 encrypted with AES-256 zero-knowledge encryption. Its only input is your documents. Its only output is briefing you on what it finds \u2014 contradictions, gaps, outdated provisions, and missing pieces in your estate plan. It also auto-populates your Immediate Action Checklist with critical details like claim phone numbers, executor contacts, and filing deadlines. No internet. No data leaves the vault. Ever.',
                },
                {
                  icon: ClipboardCheck, title: 'Immediate Action Checklist',
                  bold: 'A step-by-step guide your family can follow on the hardest day of their lives.',
                  desc: 'Partially auto-populated by Estate Guardian and fully customizable by you. When the time comes, your family opens the checklist and knows exactly what to do, who to call, where to find every document, and what deadlines matter. No guessing. No searching. No overwhelm. Just clarity.',
                },
                {
                  icon: MessageSquare, title: 'Milestone Messages',
                  bold: 'Your voice at their wedding. Your words at their graduation. Your love \u2014 delivered exactly when it matters.',
                  desc: 'Record written, voice, or video messages for the milestones you want to be part of \u2014 even if you can\'t be there. Weddings, births, graduations, birthdays, first homes, or any moment you choose. Messages are securely stored and automatically delivered when your beneficiary reports the milestone. No team reads them. No human touches them. Just your words, arriving exactly when and where you intended.',
                },
                {
                  icon: UserCheck, title: 'Designated Trustee Services',
                  bold: 'Some things shouldn\'t follow you. Let a trusted team handle what you can\'t.',
                  desc: 'Accounts to close. Subscriptions to cancel. Sensitive content to destroy. Financial transfers to execute. Things you\'d rather handle yourself \u2014 if you could. CarryOn\'s Designated Trustee Services lets you authorize specific, line-item tasks to be carried out confidentially after your verified transition. Each task is quoted, approved by you, and executed by our Trustee Services Team. Every record \u2014 instructions, credentials, payment logs \u2014 is permanently destroyed after completion.',
                },
              ].map(({ icon: Icon, title, bold, desc }, i) => (
                <RevealSection key={title} delay={i * 0.12} direction={i % 2 === 0 ? 'left' : 'right'}>
                  <div className="rounded-xl p-6 lg:p-8 h-full transition-all duration-500 hover:border-[#d4af37]/30 hover:-translate-y-1 hover:shadow-[0_8px_40px_rgba(212,175,55,0.06)] feature-card"
                    style={{ background: 'rgba(15,24,42,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-transform duration-500 hover:scale-110" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.15)' }}>
                      <Icon className="w-5 h-5 text-[#d4af37]" />
                    </div>
                    <h4 className="text-white text-lg font-semibold mb-2">{title}</h4>
                    <p className="text-[#d4af37] text-sm font-medium mb-3 leading-relaxed">{bold}</p>
                    <p className="text-[#6b7a90] text-sm leading-relaxed">{desc}</p>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ THREE STEPS — slides over ═══════════════════ */}
      <section id="steps" className="relative z-40 -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a1628, #080e1a)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.2]" style={{ backgroundImage: 'url(/texture-pathway.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 30%, rgba(212,175,55,0.03) 0%, transparent 70%)' }} />
          <div className="max-w-[800px] mx-auto px-6 text-center relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-14" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Readiness in Three Steps.
              </h2>
            </RevealSection>
            <div className="space-y-8 text-left">
              {[
                { step: '1', title: 'Build Your Vault', desc: 'Upload your estate documents and let Estate Guardian\u2122 analyze your plan for gaps, contradictions, and missing information. Your checklist begins auto-populating immediately.' },
                { step: '2', title: 'Prepare Your Family', desc: 'Invite your beneficiaries, record milestone messages, customize your checklist, and set permissions for who can access what \u2014 and when.' },
                { step: '3', title: 'Live Your Life', desc: 'Your family\'s readiness infrastructure is built. Update it whenever you want. When the time comes \u2014 whether that\'s decades from now or tomorrow \u2014 your family will never be left searching.' },
              ].map(({ step, title, desc }, i) => (
                <RevealSection key={step} delay={i * 0.15}>
                  <div className="flex gap-5 group">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-base transition-all duration-500 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(212,175,55,0.3)]" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.25)' }}>
                      {step}
                    </div>
                    <div>
                      <p className="text-white text-base leading-relaxed">
                        <span className="font-bold">Step {step} &mdash; {title}.</span>{' '}
                        <span className="text-[#7b879e]">{desc}</span>
                      </p>
                    </div>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ SECURITY — slides over ═══════════════════ */}
      <section id="security" className="relative z-50 -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#080e1a', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.3]" style={{ backgroundImage: 'url(/texture-family.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,14,26,0.5) 0%, rgba(8,14,26,0.85) 100%)' }} />
          <div className="max-w-[1100px] mx-auto px-6 text-center relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Security That Doesn&apos;t Compromise. Ever.
              </h2>
              <p className="text-[#7b879e] text-base max-w-[700px] mx-auto mb-14 leading-relaxed">
                CarryOn&#8482; is not &ldquo;death tech.&rdquo; We&apos;re a family readiness platform &mdash; built for the living, used by the living, valued by the living. Our security architecture reflects that: your data is yours alone.
              </p>
            </RevealSection>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                { icon: LockIcon, text: 'AES-256 zero-knowledge encryption \u2014 CarryOn cannot access your data' },
                { icon: Sparkles, text: 'Air-gapped Estate Guardian\u2122 AI \u2014 zero internet connectivity, ever' },
                { icon: FileText, text: 'PDF-only document uploads \u2014 optimized for AI analysis' },
                { icon: Users, text: 'Transition verification by human team \u2014 not algorithms, not AI' },
                { icon: Trash2, text: 'Post-execution record destruction \u2014 DTS records are permanently eliminated' },
                { icon: FileCheck, text: 'Compliance roadmap: SOC2, HIPAA, GDPR' },
              ].map(({ icon: Icon, text }, i) => (
                <RevealSection key={i} delay={i * 0.08}>
                  <div className="rounded-xl p-6 text-center h-full transition-all duration-500 hover:border-[#d4af37]/20 hover:-translate-y-1"
                    style={{ background: 'rgba(15,24,42,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <Icon className="w-6 h-6 text-[#7b879e] mx-auto mb-4 transition-colors duration-300 group-hover:text-[#d4af37]" />
                    <p className="text-[#94a3b8] text-sm leading-relaxed">{text}</p>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ HOSPICE ═══════════════════ */}
      <section className="relative z-[60] -mt-1">
        <div className="rounded-t-[2rem] py-20 lg:py-24 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a1628, #080e1a)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-pulse.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,22,40,0.7) 0%, rgba(8,14,26,0.8) 100%)' }} />
          <RevealSection className="max-w-[800px] mx-auto px-6 relative z-10">
            <div className="rounded-2xl p-8 lg:p-12 text-center transition-all duration-700 hover:border-[#d4af37]/40" style={{ border: '1px solid rgba(212,175,55,0.25)', background: 'rgba(212,175,55,0.03)' }}>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#d4af37] mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Free for Every American in Hospice Care.
              </h2>
              <p className="text-[#7b879e] text-base leading-relaxed mb-6">
                At any given time, over 300,000 Americans are in hospice &mdash; and the vast majority have no estate plan. CarryOn&#8482; is offered at no cost to all U.S. citizens and resident aliens enrolled in certified hospice care. Full platform access. No exceptions.
              </p>
              <p className="text-white text-base font-semibold italic leading-relaxed">
                No one approaching the end of life should be denied the ability to organize their affairs and prepare their family &mdash; simply because they can&apos;t afford to.
              </p>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ═══════════════════ FINAL CTA ═══════════════════ */}
      <section className="relative z-[70] -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32" style={{ background: '#080e1a', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <RevealSection className="max-w-[600px] mx-auto px-6 text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Readiness Starts Today.
            </h2>
            <p className="text-[#7b879e] text-base mb-8">
              Join CarryOn and be among the first families to achieve total readiness.
            </p>
            <a href="/signup" className="inline-flex items-center gap-2 px-10 py-4 rounded-lg font-semibold text-base transition-all hover:brightness-110 hover:scale-105 active:scale-95"
              style={{ background: '#d4af37', color: '#080e1a', transition: 'all 0.3s' }}>
              Get Started &mdash; It&apos;s Free <ChevronRight className="w-4 h-4" />
            </a>
          </RevealSection>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-[80] py-10" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <img src="/carryon-logo.jpg" alt="CarryOn" className="h-8 opacity-60" />
            <div className="flex items-center gap-6">
              <a href="/privacy" className="text-[#3a4a63] text-xs hover:text-[#7b879e] transition-colors" data-testid="login-footer-privacy-link">Privacy Policy</a>
              <a href="/terms" className="text-[#3a4a63] text-xs hover:text-[#7b879e] transition-colors" data-testid="login-footer-terms-link">Terms of Service</a>
              <span className="text-[#3a4a63] text-xs">Accessibility</span>
            </div>
            <div className="text-right text-[#3a4a63] text-xs leading-relaxed">
              <p>1550 Wilson Boulevard 7th Floor</p>
              <p>Arlington, VA 22209 U.S.A.</p>
              <p>(703) 884-1527</p>
            </div>
          </div>
          <p className="text-center text-[#2d3d55] text-xs mt-6">&copy; {new Date().getFullYear()} CarryOn Technologies. All rights reserved.</p>
        </div>
      </footer>

      {/* OTP MODAL */}
      {showOtpModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl p-8" style={{ background: 'linear-gradient(145deg, rgba(20,30,52,0.98), rgba(15,22,41,1))', border: '1px solid rgba(212,175,55,0.15)' }}>
            <h3 className="text-white text-xl font-semibold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Two-Factor Authentication</h3>
            <p className="text-[#6b7a90] text-sm mb-6">Enter the 6-digit code sent to your email</p>
            <Input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000" className="h-14 text-center text-2xl tracking-[0.4em] font-mono bg-[#0d1526] border-[#1e2d45] text-white focus:border-[#d4af37] rounded-lg mb-4" data-testid="otp-input" autoFocus />
            <Button onClick={handleVerifyOtp} disabled={loading || otp.length !== 6} className="w-full h-11 rounded-lg font-semibold" data-testid="otp-verify-button"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Sign In'}
            </Button>
            <button onClick={() => setShowOtpModal(false)} className="w-full mt-3 text-[#6b7a90] text-sm hover:text-white transition-colors">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
