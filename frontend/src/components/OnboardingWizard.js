import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  FolderLock, Users, FileUp, MessageSquare, BarChart3,
  ChevronRight, X, Sparkles
} from 'lucide-react';
import { Progress } from '../components/ui/progress';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STEP_CONFIG = {
  create_estate: { icon: FolderLock, color: '#d4af37', bg: 'rgba(212,175,55,0.08)', border: 'rgba(212,175,55,0.2)', route: '/dashboard', label: 'Create Your Estate', desc: 'Set up your first estate to get started' },
  add_beneficiary: { icon: Users, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', route: '/beneficiaries', label: 'Add a Beneficiary', desc: 'Designate who receives your legacy' },
  upload_document: { icon: FileUp, color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', route: '/vault', label: 'Upload a Document', desc: 'Secure your important files in the vault' },
  create_message: { icon: MessageSquare, color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.2)', route: '/messages', label: 'Create a Message', desc: 'Record a milestone message for loved ones' },
  review_readiness: { icon: BarChart3, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', route: '/guardian', label: 'Consult the Estate Guardian', desc: 'Analyze your vault and populate your checklist' },
};

const OnboardingWizard = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('carryon_onboarding_dismissed') === 'true';
  });
  const [popping, setPopping] = useState({});
  const prevCompleted = useRef({});

  useEffect(() => {
    if (user?.role === 'benefactor') fetchProgress();
    else setLoading(false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProgress = async () => {
    try {
      const res = await axios.get(`${API_URL}/onboarding/progress`, getAuthHeaders());
      setProgress(res.data);

      // Detect newly completed steps and trigger pop animation
      if (res.data.steps) {
        const newPops = {};
        res.data.steps.forEach(step => {
          if (step.completed && !prevCompleted.current[step.key]) {
            newPops[step.key] = true;
          }
        });
        if (Object.keys(newPops).length > 0) {
          setPopping(prev => ({ ...prev, ...newPops }));
          // Remove popped steps after animation
          setTimeout(() => {
            setPopping(prev => {
              const next = { ...prev };
              Object.keys(newPops).forEach(k => delete next[k]);
              return next;
            });
          }, 800);
        }
        // Update ref
        const completed = {};
        res.data.steps.forEach(s => { if (s.completed) completed[s.key] = true; });
        prevCompleted.current = completed;
      }

      if (res.data.dismissed || res.data.all_complete) {
        setDismissed(true);
        localStorage.setItem('carryon_onboarding_dismissed', 'true');
      }
    } catch (err) { console.error('Onboarding fetch error:', err); }
    finally { setLoading(false); }
  };

  const handleDismiss = async () => {
    setDismissed(true);
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

  if (dismissed) return null;
  if (loading || !progress) return null;

  const incompleteSteps = progress.steps.filter(s => !s.completed || popping[s.key]);

  if (incompleteSteps.length === 0) return null;

  return (
    <div className="mb-6" data-testid="onboarding-wizard">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.2)' }}>
            <Sparkles className="w-5 h-5 text-[#d4af37]" />
          </div>
          <div>
            <h3 className="text-[var(--t)] font-bold text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>Get Started with CarryOn</h3>
            <p className="text-[var(--t5)] text-sm">{progress.completed_count} of {progress.total_steps} complete</p>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-[var(--t5)] hover:text-[var(--t)] transition-colors p-1" data-testid="onboarding-dismiss">
          <X className="w-5 h-5" />
        </button>
      </div>

      <Progress value={progress.progress_pct} className="h-2 mb-5 bg-[var(--s)]" />

      {/* Step Tiles */}
      <div className="space-y-3">
        {incompleteSteps.map((step) => {
          const config = STEP_CONFIG[step.key];
          const Icon = config.icon;
          const isPop = popping[step.key];

          return (
            <div
              key={step.key}
              className="transition-all duration-500"
              style={{
                opacity: isPop ? 0 : 1,
                transform: isPop ? 'scale(1.15)' : 'scale(1)',
                maxHeight: isPop ? '0px' : '120px',
                marginBottom: isPop ? '0px' : undefined,
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => handleStepClick(step)}
                className="w-full rounded-2xl p-5 flex items-center gap-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] cursor-pointer"
                style={{
                  background: config.bg,
                  border: `1px solid ${config.border}`,
                  boxShadow: `0 4px 16px -4px ${config.color}20`,
                }}
                data-testid={`onboarding-step-${step.key}`}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200"
                  style={{ background: `${config.color}15`, border: `1px solid ${config.color}30` }}>
                  <Icon className="w-6 h-6" style={{ color: config.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-[var(--t)]">{config.label}</p>
                  <p className="text-sm text-[var(--t5)]">{config.desc}</p>
                </div>
                <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: config.color }} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OnboardingWizard;
