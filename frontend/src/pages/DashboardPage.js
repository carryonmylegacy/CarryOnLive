import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { cachedGet } from '../utils/apiCache';
import { 
  FolderLock, 
  MessageSquare, 
  Users, 
  CheckSquare,
  ChevronRight,
  Clock,
  CheckCircle2,
  Circle,
  X,
  Sparkles,
  KeyRound,
  ArrowLeftRight
} from 'lucide-react';
import TrialBanner from '../components/TrialBanner';
import OnboardingWizard from '../components/OnboardingWizard';
import { ActivationCelebration } from '../components/GuidedActivation';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DashboardPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [estates, setEstates] = useState([]);
  const [estate, setEstate] = useState(null);
  const [checklists, setChecklists] = useState([]);
  const [stats, setStats] = useState({ documents: 0, messages: 0, beneficiaries: 0 });
  const [readiness, setReadiness] = useState({ documents: { score: 0 }, messages: { score: 0 }, checklist: { score: 0 } });
  const [loading, setLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [justCompletedActivation, setJustCompletedActivation] = useState(false);
  const [showGuidedFlow, setShowGuidedFlow] = useState(false);
  const [guidedStep, setGuidedStep] = useState(null);
  const [showWelcomeStep, setShowWelcomeStep] = useState(false);
  const [dashboardReady, setDashboardReady] = useState(false);
  const guidedDismissedRef = useRef(false);

  const handleCelebrationDismiss = () => {
    setShowCelebration(false);
    setJustCompletedActivation(true);
    setTimeout(() => sessionStorage.setItem('carryon_first_explore', 'done'), 100);
  };

  useEffect(() => { fetchEstates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (estate?.id) fetchEstateData(estate.id); }, [estate?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefetch likely next routes after dashboard loads
  useEffect(() => {
    if (!loading) {
      import('./VaultPage').catch(() => {});
      import('./MessagesPage').catch(() => {});
    }
  }, [loading]);

  const fetchEstates = async () => {
    try {
      const response = await cachedGet(axios, `${API_URL}/estates`, getAuthHeaders());
      // In dashboard (benefactor) view, only show estates the user OWNS
      const ownedEstates = response.data.filter(
        e => e.user_role_in_estate === 'owner' || (!e.user_role_in_estate && !e.is_beneficiary_estate)
      );
      setEstates(ownedEstates);
      if (ownedEstates.length > 0) {
        const savedEstateId = localStorage.getItem('selected_estate_id');
        const savedEstate = ownedEstates.find(e => e.id === savedEstateId);
        setEstate(savedEstate || ownedEstates[0]);
      }
    } catch (error) { console.error('Fetch estates error:', error); setLoading(false); }
  };

  const fetchEstateData = async (estateId) => {
    try {
      // Always fetch estate data AND onboarding progress in parallel
      const [docsRes, msgsRes, bensRes, checklistRes, readinessRes, progressRes] = await Promise.all([
        axios.get(`${API_URL}/documents/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/messages/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/beneficiaries/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/checklists/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/estate/${estateId}/readiness`, getAuthHeaders()),
        axios.get(`${API_URL}/onboarding/progress`, getAuthHeaders()).catch(() => null),
      ]);
      setStats({ documents: docsRes.data.length, messages: msgsRes.data.length, beneficiaries: bensRes.data.length });
      setChecklists(checklistRes.data);
      setReadiness(readinessRes.data);
      setEstate(prev => prev ? { ...prev, readiness_score: readinessRes.data.overall_score } : prev);

      // Show guided flow overlay if there are incomplete steps and user hasn't dismissed this visit
      if (!guidedDismissedRef.current && progressRes?.data) {
        // If user already graduated (celebration shown before), skip all guided flow
        if (progressRes.data?.already_graduated) {
          guidedDismissedRef.current = true;
        } else {
          const steps = progressRes.data?.steps || [];
          const nextIncomplete = steps.find(s => !s.completed);
          if (nextIncomplete && !progressRes.data?.all_complete) {
            setGuidedStep({ ...nextIncomplete, beneficiary_names: progressRes.data?.beneficiary_names || [] });
            // Show welcome step for multi-role users (beneficiary who also has own estate)
            if (user?.is_also_benefactor && user?.role === 'beneficiary' && !localStorage.getItem('carryon_welcome_guided_shown')) {
              setShowWelcomeStep(true);
            }
            setShowGuidedFlow(true);
          } else if (progressRes.data?.all_complete && !progressRes.data?.celebration_shown) {
            // All steps complete — show celebration (one-time, persisted on backend)
            guidedDismissedRef.current = true;
            try { axios.post(`${API_URL}/onboarding/celebration-shown`, {}, getAuthHeaders()); } catch {}
            setTimeout(() => setShowCelebration(true), 600);
          }
        }
      }
    } catch (error) { console.error('Fetch estate data error:', error); }
    finally {
      setLoading(false);
      // Delay reveal until overlay is rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setDashboardReady(true));
      });
    }
  };

  const handleEstateChange = (newEstate) => { 
    setEstate(newEstate); 
    localStorage.setItem('selected_estate_id', newEstate.id); 
  };

  const completedTasks = checklists.filter(c => c.is_completed).length;
  const totalTasks = checklists.length || 5;
  const readinessScore = estate?.readiness_score || 0;

  // Use real readiness breakdown from API
  const docsPercent = readiness?.documents?.score ?? 0;
  const msgsPercent = readiness?.messages?.score ?? 0;
  const checklistPercent = readiness?.checklist?.score ?? 0;

  // Get score label and color
  const getScoreLabel = (score) => {
    if (score >= 80) return { label: 'Protected', color: '#14B8A6' };
    if (score >= 60) return { label: 'Strong', color: '#2DD4BF' };
    if (score >= 40) return { label: 'Building', color: '#FBBF24' };
    return { label: 'Getting Started', color: '#F59E0B' };
  };

  const scoreInfo = getScoreLabel(readinessScore);

  const getUserFirstName = () => {
    if (user?.first_name) return user.first_name;
    if (user?.name) return user.name.split(' ')[0];
    return 'there';
  };

  // Speedometer gauge component
  const SpeedometerGauge = ({ score }) => {
    const angle = (score / 100) * 180 - 90;
    
    return (
      <div className="relative w-48 h-32 lg:w-72 lg:h-48 mx-auto">
        <svg viewBox="0 0 200 110" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="25%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="75%" stopColor="#84cc16" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
            <linearGradient id="needleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#94a3b8" />
              <stop offset="30%" stopColor="#f1f5f9" />
              <stop offset="50%" stopColor="#ffffff" />
              <stop offset="70%" stopColor="#f1f5f9" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
            <radialGradient id="hubGradient" cx="35%" cy="25%" r="70%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="20%" stopColor="#e2e8f0" />
              <stop offset="45%" stopColor="#94a3b8" />
              <stop offset="70%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#334155" />
            </radialGradient>
          </defs>
          
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#gaugeGradient)" strokeWidth="28" strokeLinecap="round" />
          
          <g transform={`rotate(${angle}, 100, 100)`} style={{ transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <polygon points="100,18 96,88 92,125 100,130 108,125 104,88" fill="url(#needleGradient)" stroke="#64748b" strokeWidth="0.5" />
            <polygon points="100,18 97,42 100,46 103,42" fill="#dc2626" />
            <circle cx="100" cy="100" r="11" fill="url(#hubGradient)" stroke="#475569" strokeWidth="1.5" />
          </g>
        </svg>
        
        <div className="absolute -bottom-16 lg:-bottom-24 left-1/2 transform -translate-x-1/2 text-center">
          <div className="text-3xl lg:text-5xl font-bold text-[var(--t)]">
            {score}%
          </div>
          <div className="text-base lg:text-2xl font-bold whitespace-nowrap" style={{ color: scoreInfo.color }}>
            {scoreInfo.label}
          </div>
        </div>
      </div>
    );
  };

  // Stat card component - uses CSS class for theme-adaptive colors
  const StatCard = ({ icon: Icon, value, label, cardClass, onClick, className = '', sectionKey }) => (
    <div 
      className={`${cardClass} rounded-2xl p-4 lg:p-6 cursor-pointer transition-transform duration-150 active:scale-[0.96] lg:hover:scale-[1.03] lg:hover:shadow-xl flex flex-col items-center justify-center ${className}`}
      onClick={onClick}
      data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Icon className="stat-icon w-6 h-6 lg:w-8 lg:h-8 opacity-70 mb-2 lg:mb-4" />
      <div className="text-3xl lg:text-5xl font-bold mb-2 text-center">
        {value}
      </div>
      <div className="opacity-80 text-base lg:text-lg font-bold leading-tight text-center">
        {label.split(' ').length > 2 ? (
          <>
            {label.split(' ').slice(0, Math.ceil(label.split(' ').length / 2)).join(' ')}
            <br />
            {label.split(' ').slice(Math.ceil(label.split(' ').length / 2)).join(' ')}
          </>
        ) : (
          label
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="p-4 lg:p-8 pt-4 lg:pt-8 animate-fade-in">
        <div className="h-8 w-64 bg-[var(--s)] rounded-lg mb-4 animate-pulse" />
        <div className="h-5 w-80 bg-[var(--s)] rounded-lg mb-6 animate-pulse" />
        <div className="h-48 bg-[var(--s)] rounded-2xl mb-4 animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="h-28 bg-[var(--s)] rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!estate && estates.length === 0) {
    return (
      <div className="p-4 lg:p-8 pt-4 lg:pt-8 animate-fade-in">
        <div className="glass-card max-w-lg mx-auto mt-8 p-8 lg:p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--gold)]/20 flex items-center justify-center">
            <FolderLock className="w-8 h-8 text-[var(--gold)]" />
          </div>
          <h2 className="text-xl lg:text-2xl font-bold text-[var(--t)] mb-3">Create Your First Estate</h2>
          <p className="text-[var(--t4)] mb-6 text-sm lg:text-base">Start organizing your estate plan by creating an estate.</p>
          <button onClick={() => navigate('/create-estate')} className="gold-button px-6 py-3 rounded-xl font-bold" data-testid="create-first-estate">Create Estate</button>
        </div>
      </div>
    );
  }

  // Guided activation — frosted glass overlay on top of the dashboard
  const renderGuidedOverlay = () => {
    if (!showGuidedFlow || !guidedStep) return null;

    const STEP_ROUTES = {
      create_message: '/messages',
      upload_document: '/vault',
      designate_primary: '/beneficiaries',
      customize_checklist: '/checklist',
      add_credential: '/digital-wallet',
      review_readiness: '/guardian',
    };
    const STEP_ICONS = {
      create_message: MessageSquare,
      upload_document: FolderLock,
      designate_primary: Users,
      customize_checklist: CheckSquare,
      add_credential: KeyRound,
      review_readiness: Sparkles,
    };
    const STEP_COLORS = {
      create_message: '#8b5cf6',
      upload_document: '#10b981',
      designate_primary: '#3b82f6',
      customize_checklist: '#f59e0b',
      add_credential: '#06b6d4',
      review_readiness: '#d4af37',
    };
    const STEP_LABELS = {
      create_message: { title: 'Leave a Message for Your Loved Ones', desc: 'Record a video, voice, or written message for your beneficiaries. You can edit or re-record anytime.', step: 1 },
      upload_document: { title: 'Upload Your First Estate Document', desc: 'Securely store a will, trust, insurance policy, or other important document in your encrypted vault.', step: 2 },
      designate_primary: { title: 'Designate Your Primary Beneficiary', desc: 'Choose who will serve as trustee of your estate. After transition, they can add/remove beneficiaries, control what each beneficiary sees, and approve access requests.', step: 3 },
      customize_checklist: { title: 'Review Your Action Checklist', desc: 'Customize the steps your loved ones will follow when they need it most.', step: 4 },
      add_credential: { title: 'Store a Digital Account Credential', desc: 'Add one account login and password to your Digital Access Vault so your beneficiaries can manage your accounts.', step: 5 },
      review_readiness: { title: 'Consult the Estate Guardian', desc: 'Get an AI analysis of your estate plan and your personalized readiness score.', step: 6 },
    };
    const stepInfo = STEP_LABELS[guidedStep.key] || STEP_LABELS.create_message;
    const route = STEP_ROUTES[guidedStep.key];
    const StepIcon = STEP_ICONS[guidedStep.key] || Sparkles;
    const stepColor = STEP_COLORS[guidedStep.key] || '#d4af37';
    const totalSteps = 6;

    // Personalize step 1 with beneficiary names
    let title = stepInfo.title;
    if (guidedStep.key === 'create_message') {
      const benNames = guidedStep.beneficiary_names || [];
      if (benNames.length === 1) {
        title = `Leave a Message for ${benNames[0]}`;
      } else if (benNames.length === 2) {
        title = `Leave a Message for ${benNames[0]} and/or ${benNames[1]}`;
      } else if (benNames.length >= 3) {
        title = `Leave a Message for ${benNames[0]}, ${benNames[1]}, and/or ${benNames[2]}`;
      }
    }

    const dismissOverlay = () => {
      guidedDismissedRef.current = true;
      setShowGuidedFlow(false);
    };

    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center" data-testid="guided-overlay"
        style={{ animation: 'guidedOverlayIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
        <style>{`
          @keyframes guidedOverlayIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes bubbleIn {
            0% { opacity: 0; transform: scale(0.85) translateY(40px); }
            60% { transform: scale(1.02) translateY(-4px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes pulseRing {
            0% { box-shadow: 0 0 0 0 ${stepColor}40; }
            70% { box-shadow: 0 0 0 20px ${stepColor}00; }
            100% { box-shadow: 0 0 0 0 ${stepColor}00; }
          }
        `}</style>

        {/* Frosted glass backdrop — theme-aware */}
        <div className="absolute inset-0" style={{
          backdropFilter: 'blur(20px) saturate(130%)',
          WebkitBackdropFilter: 'blur(20px) saturate(130%)',
          background: 'var(--guided-overlay-bg, rgba(8,14,26,0.75))',
        }} />

        {/* Close X button — upper right */}
        <button onClick={dismissOverlay}
          className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all"
          style={{ color: 'var(--guided-muted, rgba(255,255,255,0.4))' }}
          data-testid="guided-close-btn">
          <X className="w-5 h-5" />
        </button>

        {/* Welcome step for multi-role users — shown before Step 1 */}
        {showWelcomeStep ? (
          <div className="relative max-w-md w-full mx-6 text-center"
            data-testid="welcome-step"
            style={{ animation: 'bubbleIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both' }}>
            <div className="w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{
                background: 'radial-gradient(circle, rgba(212,175,55,0.2) 0%, rgba(96,165,250,0.08) 70%)',
                border: '2px solid rgba(212,175,55,0.35)',
                animation: 'pulseRing 2.5s ease-in-out infinite',
              }}>
              <ArrowLeftRight className="w-14 h-14 text-[#d4af37]" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold mb-3"
              style={{ fontFamily: 'Outfit, sans-serif', color: '#ffffff' }}>
              Welcome to Your Estate
            </h1>
            <p className="text-sm lg:text-base mb-8 max-w-sm mx-auto leading-relaxed" style={{ color: '#94a3b8' }}>
              You now have both views — switch between your <strong style={{ color: '#d4af37' }}>Benefactor</strong> estate and your <strong style={{ color: '#60A5FA' }}>Beneficiary</strong> access anytime using the switcher in the sidebar.
            </p>
            <button onClick={() => { localStorage.setItem('carryon_welcome_guided_shown', 'true'); setShowWelcomeStep(false); }}
              className="w-full max-w-xs mx-auto py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a', boxShadow: '0 8px 32px rgba(212,175,55,0.3)' }}
              data-testid="welcome-step-continue">
              Let's Get Started <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        ) : (
        /* Center bubble — regular step */
        <div className="relative max-w-md w-full mx-6 text-center"
          style={{ animation: 'bubbleIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both' }}>

          {/* Step counter */}
          <p className="text-xl lg:text-2xl font-bold uppercase tracking-[0.2em] mb-6"
            style={{ color: stepColor }}>
            Step {stepInfo.step} of {totalSteps}
          </p>

          {/* Large icon bubble */}
          <div className="w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{
              background: `radial-gradient(circle, ${stepColor}20 0%, ${stepColor}08 70%)`,
              border: `2px solid ${stepColor}35`,
              animation: 'pulseRing 2.5s ease-in-out infinite',
            }}>
            <StepIcon className="w-14 h-14" style={{ color: stepColor }} />
          </div>

          {/* Title and description */}
          <h1 className="text-2xl lg:text-3xl font-bold mb-3"
            style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--guided-title, #ffffff)' }}>
            {title}
          </h1>
          <p className="text-sm lg:text-base mb-8 max-w-sm mx-auto leading-relaxed"
            style={{ color: 'var(--guided-desc, #94a3b8)' }}>
            {stepInfo.desc}
          </p>

          {/* CTA button */}
          <button onClick={() => { setShowGuidedFlow(false); navigate(route, { state: { fromGettingStarted: true } }); }}
            className="w-full max-w-xs mx-auto py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.97]"
            style={{ background: `linear-gradient(135deg, ${stepColor}, ${stepColor}cc)`, color: '#080e1a', boxShadow: `0 8px 32px ${stepColor}30` }}
            data-testid="guided-cta-btn">
            Let's Go <ChevronRight className="w-5 h-5" />
          </button>

          {/* Skip link */}
          <button onClick={dismissOverlay}
            className="mt-8 px-5 py-2 rounded-full text-xs transition-colors"
            style={{ color: 'var(--guided-skip, #64748b)', background: 'var(--guided-skip-bg, rgba(255,255,255,0.04))', border: '1px solid var(--guided-skip-border, rgba(255,255,255,0.06))' }}
            data-testid="guided-skip-btn">
            Skip this step for now
          </button>
        </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-8 pt-2 lg:pt-6 pb-24 lg:pb-8" data-testid="benefactor-dashboard"
      style={{
        opacity: dashboardReady ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }}>
      {/* Trial Banner */}
      <TrialBanner onUpgrade={() => navigate('/subscription')} />

      {/* Header + Estate Selector */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl lg:text-4xl font-bold text-[var(--t)] mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {justCompletedActivation
              ? <>{getUserFirstName()}, let's continue exploring CarryOn</>
              : <>Welcome back, {getUserFirstName()}</>}
          </h1>
          <p className="text-[var(--t4)] text-base lg:text-xl">
            {justCompletedActivation
              ? 'Click anywhere and have fun securing your family\'s future!'
              : 'Your estate plan is taking shape. Here\'s your overview.'}
          </p>
        </div>
        <div className="sm:mt-1">
        </div>
      </div>

      {/* Onboarding Wizard — shown early so it's visible on mobile */}
      <OnboardingWizard onAllComplete={() => {
        // Celebration is handled by fetchEstateData via backend flag — no-op here
      }} />

      {/* Estate Readiness Score Card */}
      <div className="glass-card p-4 lg:p-6 mb-4" data-testid="readiness-card">
        <h2 className="text-center text-base lg:text-2xl font-bold text-[var(--t4)] uppercase tracking-wider mb-2 lg:mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Estate Readiness Score
        </h2>
        
        <SpeedometerGauge score={readinessScore} />
        
        <div className="flex justify-center gap-3 lg:gap-8 mt-16 lg:mt-28">
          <div className="flex items-center gap-1.5 lg:gap-2">
            <span className="w-3 h-1.5 lg:w-4 lg:h-2 rounded-full bg-[#2563eb]" />
            <span className="text-[var(--t3)] text-xs lg:text-base font-semibold">{docsPercent}% Docs</span>
          </div>
          <div className="flex items-center gap-1.5 lg:gap-2">
            <span className="w-3 h-1.5 lg:w-4 lg:h-2 rounded-full bg-[#8b5cf6]" />
            <span className="text-[var(--t3)] text-xs lg:text-base font-semibold">{msgsPercent}% Messages</span>
          </div>
          <div className="flex items-center gap-1.5 lg:gap-2">
            <span className="w-3 h-1.5 lg:w-4 lg:h-2 rounded-full bg-[#f97316]" />
            <span className="text-[var(--t3)] text-xs lg:text-base font-semibold">{checklistPercent}% Checklist</span>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4 mb-4">
        <StatCard 
          icon={FolderLock}
          value={stats.documents}
          label="Secure Document Vault"
          cardClass="stat-card-vault"
          onClick={() => navigate('/vault')}
          sectionKey="vault"
        />
        <StatCard 
          icon={MessageSquare}
          value={stats.messages}
          label="Milestone Messages (MM)"
          cardClass="stat-card-messages"
          onClick={() => navigate('/messages')}
          sectionKey="messages"
        />
        <StatCard 
          icon={CheckSquare}
          value={totalTasks}
          label="Immediate Action Checklist (IAC)"
          cardClass="stat-card-checklist"
          onClick={() => navigate('/checklist')}
          sectionKey="checklist"
        />
        <StatCard 
          icon={Users}
          value={stats.beneficiaries}
          label="Beneficiaries"
          cardClass="stat-card-beneficiaries"
          onClick={() => navigate('/beneficiaries')}
          className="hidden lg:block"
          sectionKey="beneficiaries"
        />
      </div>

      {/* Mobile only - Beneficiaries full width */}
      <div className="lg:hidden mb-4">
        <div 
          className="stat-card-beneficiaries rounded-2xl p-4 cursor-pointer transition-transform duration-150 active:scale-[0.96] lg:hover:scale-[1.02] flex flex-col items-center justify-center"
          onClick={() => navigate('/beneficiaries')}
          data-testid="stat-card-beneficiaries-mobile"
        >
          <Users className="stat-icon w-8 h-8 opacity-70 mb-2" />
          <span className="text-3xl font-bold mb-1">
            {stats.beneficiaries}
          </span>
          <span className="opacity-80 text-base lg:text-lg font-bold text-center">Beneficiaries</span>
        </div>
      </div>

      {/* Bottom Section - Vault, Messages & Checklist Previews */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Secure Document Vault Preview - Blue */}
        <div 
          className="glass-card p-4 lg:p-6 border-l-4 border-l-[#2563eb] transition-transform duration-150 cursor-pointer active:scale-[0.98] lg:hover:scale-[1.02] lg:hover:shadow-[0_12px_36px_-6px_rgba(37,99,235,0.3)]"
          data-testid="preview-vault"
          onClick={() => navigate('/vault')}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FolderLock className="w-5 h-5 text-[#2563eb]" />
              <h3 className="text-lg lg:text-xl font-semibold text-[var(--t)]">Secure Document Vault</h3>
            </div>
            <span className="text-[var(--t4)] text-sm">
              {stats.documents > 0 ? `${(stats.documents * 0.5).toFixed(0)} MB` : '0 MB'} / 10 GB
            </span>
          </div>
          <div className="h-2 bg-[var(--b)] rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all"
              style={{ 
                background: 'linear-gradient(90deg, #2563eb, #1e3a8a)',
                width: `${Math.min(100, (stats.documents * 0.5 / 10000) * 100)}%` 
              }}
            />
          </div>
          <p className="text-[var(--t4)] text-sm mt-2">{stats.documents} document{stats.documents !== 1 ? 's' : ''} encrypted</p>
          <button 
            onClick={() => navigate('/vault')}
            className="mt-2 text-[#2563eb] hover:text-[#3b82f6] text-base font-medium flex items-center gap-1"
            data-testid="preview-vault-link"
          >
            View All Documents <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Milestone Messages Preview - Purple */}
        <div 
          className="glass-card p-4 lg:p-6 border-l-4 border-l-[#8b5cf6] transition-transform duration-150 cursor-pointer active:scale-[0.98] lg:hover:scale-[1.02] lg:hover:shadow-[0_12px_36px_-6px_rgba(139,92,246,0.3)]"
          data-testid="preview-messages"
          onClick={() => navigate('/messages')}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#8b5cf6]" />
              <h3 className="text-lg lg:text-xl font-semibold text-[var(--t)]">Milestone Messages (MM)</h3>
            </div>
            <span className="text-[var(--t4)] text-sm">
              {stats.messages} message{stats.messages !== 1 ? 's' : ''}
            </span>
          </div>
          {stats.messages > 0 ? (
            <div className="flex items-center gap-3 p-3 bg-[#8b5cf6]/10 rounded-lg">
              <MessageSquare className="w-5 h-5 text-[#8b5cf6]" />
              <span className="text-[var(--t3)] text-sm">Messages ready for your loved ones</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-[var(--s)] rounded-lg">
              <Clock className="w-5 h-5 text-[var(--t5)]" />
              <span className="text-[var(--t4)] text-sm">No messages yet</span>
            </div>
          )}
          <button 
            onClick={() => navigate('/messages')}
            className="mt-2 text-[#8b5cf6] hover:text-[#a78bfa] text-base font-medium flex items-center gap-1"
            data-testid="preview-messages-link"
          >
            Create Message <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Immediate Action Checklist Preview - Orange */}
        <div 
          className="glass-card p-4 lg:p-6 border-l-4 border-l-[#f97316] transition-transform duration-150 cursor-pointer active:scale-[0.98] lg:hover:scale-[1.02] lg:hover:shadow-[0_12px_36px_-6px_rgba(249,115,22,0.3)]"
          data-testid="preview-checklist"
          onClick={() => navigate('/checklist')}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-[#f97316]" />
              <h3 className="text-lg lg:text-xl font-semibold text-[var(--t)]">Action Checklist</h3>
            </div>
            <span className="text-[var(--t4)] text-sm">
              {completedTasks}/{totalTasks} done
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-2 bg-[var(--b)] rounded-full overflow-hidden mb-3">
            <div 
              className="h-full rounded-full transition-all"
              style={{ 
                background: 'linear-gradient(90deg, #f97316, #ea580c)',
                width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%` 
              }}
            />
          </div>
          {/* Recent checklist items */}
          <div className="space-y-1.5">
            {checklists.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                {item.is_completed ? (
                  <CheckCircle2 className="w-4 h-4 text-[#f97316] flex-shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-[var(--t5)] flex-shrink-0" />
                )}
                <span className={`truncate ${item.is_completed ? 'text-[var(--t4)] line-through' : 'text-[var(--t3)]'}`}>
                  {item.title}
                </span>
              </div>
            ))}
            {checklists.length === 0 && (
              <div className="flex items-center gap-3 p-3 bg-[var(--s)] rounded-lg">
                <Clock className="w-5 h-5 text-[var(--t5)]" />
                <span className="text-[var(--t4)] text-sm">No checklist items yet</span>
              </div>
            )}
          </div>
          <button 
            onClick={() => navigate('/checklist')}
            className="mt-2 text-[#f97316] hover:text-[#fb923c] text-base font-medium flex items-center gap-1"
            data-testid="preview-checklist-link"
          >
            View Full Checklist <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
      {showCelebration && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center" data-testid="celebration-overlay"
          style={{ animation: 'guidedOverlayIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
          <style>{`
            @keyframes celebrationBounce {
              0% { opacity: 0; transform: scale(0.7) translateY(40px); }
              50% { transform: scale(1.05) translateY(-10px); }
              100% { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
          <div className="absolute inset-0" style={{
            backdropFilter: 'blur(20px) saturate(130%)',
            WebkitBackdropFilter: 'blur(20px) saturate(130%)',
            background: 'var(--guided-overlay-bg, rgba(8,14,26,0.75))',
          }} />
          <button onClick={handleCelebrationDismiss}
            className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all"
            style={{ color: 'var(--guided-muted, rgba(255,255,255,0.4))' }}
            data-testid="celebration-close-btn">
            <X className="w-5 h-5" />
          </button>
          <div className="relative max-w-lg w-full mx-6 text-center p-8 rounded-3xl"
            style={{
              animation: 'celebrationBounce 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both',
              background: 'radial-gradient(ellipse at center, rgba(212,175,55,0.08) 0%, transparent 70%)',
              border: '1px solid rgba(212,175,55,0.15)',
            }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: 'rgba(212,175,55,0.12)', border: '2px solid rgba(212,175,55,0.3)' }}>
              <Sparkles className="w-10 h-10 text-[#d4af37]" />
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold mb-4"
              style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--guided-title, #ffffff)' }}>
              Congratulations!
            </h1>
            <p className="text-base lg:text-lg mb-2 max-w-sm mx-auto leading-relaxed"
              style={{ color: 'var(--guided-desc, #94a3b8)' }}>
              You have completed the initial creation of your estate plan. Welcome to CarryOn — continue exploring and building the security your family deserves!
            </p>
            <p className="text-xs mb-8 max-w-sm mx-auto"
              style={{ color: 'var(--guided-skip, #64748b)' }}>
              If you wish to view the Getting Started steps again, you can re-enable it in Settings.
            </p>
            <button onClick={handleCelebrationDismiss}
              className="w-full max-w-xs mx-auto py-4 rounded-2xl text-base font-bold transition-transform active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a', boxShadow: '0 8px 32px rgba(212,175,55,0.3)' }}
              data-testid="celebration-explore-btn">
              Explore Your Dashboard
            </button>
          </div>
        </div>
      )}
      {renderGuidedOverlay()}
    </div>
  );
};

export default DashboardPage;
