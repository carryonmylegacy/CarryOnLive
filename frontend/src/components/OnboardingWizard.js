import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  FolderLock, Users, FileUp, MessageSquare,
  ChevronRight, X, Sparkles, Check
} from 'lucide-react';
import { Progress } from '../components/ui/progress';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STEP_CONFIG = {
  create_estate: { icon: FolderLock, color: '#d4af37', bg: 'rgba(212,175,55,0.08)', border: 'rgba(212,175,55,0.2)', route: '/dashboard', label: 'Create Your Estate', desc: 'Set up your first estate to get started' },
  add_beneficiary: { icon: Users, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', route: '/beneficiaries', label: 'Add a Beneficiary', desc: 'Designate who receives your legacy' },
  upload_document: { icon: FileUp, color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', route: '/vault', label: 'Upload a Document', desc: 'Secure your important files in the vault' },
  create_message: { icon: MessageSquare, color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.2)', route: '/messages', label: 'Create a Message', desc: 'Record a milestone message for loved ones' },
  review_readiness: { icon: Sparkles, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', route: '/guardian', label: 'Consult the Estate Guardian', desc: 'Analyze your vault and populate your checklist' },
};

const OnboardingWizard = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [manuallyDismissed, setManuallyDismissed] = useState(() => {
    return localStorage.getItem('carryon_onboarding_dismissed') === 'true';
  });
  const [showAll, setShowAll] = useState(false);
  const [popping, setPopping] = useState({});
  const prevCompleted = useRef({});
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (user?.role === 'benefactor') fetchProgress();
    else setLoading(false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProgress = async () => {
    try {
      const res = await axios.get(`${API_URL}/onboarding/progress`, getAuthHeaders());

      // Process everything before setting state (single render)
      const steps = res.data.steps || [];
      const hasIncomplete = steps.some(s => !s.completed);

      if (hasIncomplete && !res.data.all_complete) {
        localStorage.removeItem('carryon_onboarding_dismissed');
        setManuallyDismissed(false);
      }

      if (!hasIncomplete && localStorage.getItem('carryon_onboarding_dismissed') !== 'true') {
        setShowAll(true);
      }

      // Pop animation only on return visits (not initial load)
      if (initialLoadDone.current) {
        const newPops = {};
        steps.forEach(step => {
          if (step.completed && !prevCompleted.current[step.key]) {
            newPops[step.key] = true;
          }
        });
        if (Object.keys(newPops).length > 0) {
          setPopping(prev => ({ ...prev, ...newPops }));
          setTimeout(() => {
            setPopping(prev => {
              const next = { ...prev };
              Object.keys(newPops).forEach(k => delete next[k]);
              return next;
            });
          }, 800);
        }
      }

      const completed = {};
      steps.forEach(s => { if (s.completed) completed[s.key] = true; });
      prevCompleted.current = completed;
      initialLoadDone.current = true;

      setProgress(res.data);
    } catch (err) { console.error('Onboarding fetch error:', err); }
    finally { setLoading(false); }
  };

  const handleDismiss = async () => {
    setManuallyDismissed(true);
    setShowAll(false);
    localStorage.setItem('carryon_onboarding_dismissed', 'true');
    try { await axios.post(`${API_URL}/onboarding/dismiss`, {}, getAuthHeaders()); }
    catch (err) { console.error(err); }
  };

  const handleStepClick = async (step) => {
    const config = STEP_CONFIG[step.key];
    if (step.key === 'review_readiness' && !step.completed) {
      try { await axios.post(`${API_URL}/onboarding/complete-step/review_readiness`, {}, getAuthHeaders()); }
      catch (err) { console.error(err); }
    }
    navigate(config.route);
  };

  if (loading || !progress) return null;
  if (manuallyDismissed && !showAll) return null;

  // Determine which steps to show
  const allSteps = progress.steps || [];
  const incompleteSteps = allSteps.filter(s => !s.completed || popping[s.key]);
  const stepsToShow = showAll ? allSteps : incompleteSteps;

  if (stepsToShow.length === 0) return null;

  return (
    <div className="mb-6 animate-slideDown" data-testid="onboarding-wizard">
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; max-height: 0; transform: translateY(-20px); margin-bottom: 0; }
          to { opacity: 1; max-height: 500px; transform: translateY(0); margin-bottom: 1.5rem; }
        }
        .animate-slideDown {
          animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.2)' }}>
            <Sparkles className="w-6 h-6 text-[#d4af37]" />
          </div>
          <div>
            <h3 className="text-[var(--t)] font-bold text-xl lg:text-2xl" style={{ fontFamily: 'Outfit, sans-serif' }}>Get Started with CarryOn</h3>
            <p className="text-[var(--t5)] text-base">{progress.completed_count} of {progress.total_steps} complete</p>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-[var(--t5)] hover:text-[var(--t)] transition-colors p-2" data-testid="onboarding-dismiss">
          <X className="w-6 h-6" />
        </button>
      </div>

      <Progress value={progress.progress_pct} className="h-2.5 mb-5 bg-[var(--s)]" />

      {/* Step Tiles */}
      <div className="space-y-3">
        {stepsToShow.map((step) => {
          const config = STEP_CONFIG[step.key];
          const Icon = config.icon;
          const isPop = popping[step.key];
          const isComplete = step.completed && !isPop;

          return (
            <div
              key={step.key}
              className="transition-all duration-500"
              style={{
                opacity: isPop ? 0 : 1,
                transform: isPop ? 'scale(1.15)' : 'scale(1)',
                maxHeight: isPop ? '0px' : '140px',
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => handleStepClick(step)}
                className="w-full rounded-2xl p-5 flex items-center gap-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] cursor-pointer"
                style={{
                  background: isComplete ? 'var(--s)' : config.bg,
                  border: `1px solid ${isComplete ? 'var(--b)' : config.border}`,
                  boxShadow: isComplete ? 'none' : `0 4px 16px -4px ${config.color}20`,
                  opacity: isComplete ? 0.5 : 1,
                }}
                data-testid={`onboarding-step-${step.key}`}
              >
                <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: isComplete ? 'rgba(16,185,129,0.1)' : `${config.color}15`,
                    border: `1px solid ${isComplete ? 'rgba(16,185,129,0.2)' : `${config.color}30`}`,
                  }}>
                  {isComplete ? (
                    <Check className="w-7 h-7 text-[#22C993]" />
                  ) : (
                    <Icon className="w-7 h-7" style={{ color: config.color }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-lg font-bold ${isComplete ? 'text-[var(--t5)] line-through' : 'text-[var(--t)]'}`}>{config.label}</p>
                  <p className={`text-base ${isComplete ? 'text-[var(--t5)]' : 'text-[var(--t4)]'}`}>{config.desc}</p>
                </div>
                {isComplete ? (
                  <span className="text-sm text-[#22C993] font-bold flex-shrink-0">Done</span>
                ) : (
                  <ChevronRight className="w-6 h-6 flex-shrink-0" style={{ color: config.color }} />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OnboardingWizard;
