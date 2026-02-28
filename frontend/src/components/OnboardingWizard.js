import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  FolderLock, Users, FileUp, MessageSquare, BarChart3,
  Check, ChevronRight, X, Sparkles
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STEP_CONFIG = {
  create_estate: { icon: FolderLock, color: '#d4af37', route: '/dashboard', label: 'Create Your Estate' },
  add_beneficiary: { icon: Users, color: '#3b82f6', route: '/beneficiaries', label: 'Add a Beneficiary' },
  upload_document: { icon: FileUp, color: '#10b981', route: '/vault', label: 'Upload a Document' },
  create_message: { icon: MessageSquare, color: '#8b5cf6', route: '/messages', label: 'Create a Message' },
  review_readiness: { icon: BarChart3, color: '#f59e0b', route: '/dashboard', label: 'Review Readiness' },
};

const OnboardingWizard = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (user?.role === 'benefactor') fetchProgress();
    else setLoading(false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProgress = async () => {
    try {
      const res = await axios.get(`${API_URL}/onboarding/progress`, getAuthHeaders());
      setProgress(res.data);
      setDismissed(res.data.dismissed);
    } catch (err) { console.error('Onboarding fetch error:', err); }
    finally { setLoading(false); }
  };

  const handleDismiss = async () => {
    setDismissed(true);
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

  if (loading || dismissed || !progress || progress.all_complete) return null;

  return (
    <div style={{ minHeight: 0 }}>
    <Card className="border border-[#d4af37]/30 bg-gradient-to-r from-[#d4af37]/5 to-transparent mb-6" data-testid="onboarding-wizard">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#d4af37]/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[#d4af37]" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Get Started with CarryOn</h3>
              <p className="text-[#94a3b8] text-xs">{progress.completed_count} of {progress.total_steps} steps complete</p>
            </div>
          </div>
          <button onClick={handleDismiss} className="text-[#64748b] hover:text-white transition-colors" data-testid="onboarding-dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>

        <Progress value={progress.progress_pct} className="h-1.5 mb-4 bg-[var(--s)]" />

        <div className="space-y-2">
          {progress.steps.map((step) => {
            const config = STEP_CONFIG[step.key];
            const Icon = config.icon;
            return (
              <button
                key={step.key}
                onClick={() => handleStepClick(step)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left ${
                  step.completed
                    ? 'bg-[var(--s)] opacity-60'
                    : 'bg-[var(--s)] hover:bg-[var(--s)] cursor-pointer'
                }`}
                data-testid={`onboarding-step-${step.key}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  step.completed ? 'bg-[#10b981]/20' : 'bg-[var(--s)]'
                }`}>
                  {step.completed ? (
                    <Check className="w-4 h-4 text-[#10b981]" />
                  ) : (
                    <Icon className="w-4 h-4" style={{ color: config.color }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${step.completed ? 'text-[#64748b] line-through' : 'text-white'}`}>
                    {config.label}
                  </p>
                  <p className="text-xs text-[#64748b] truncate">{step.description}</p>
                </div>
                {!step.completed && <ChevronRight className="w-4 h-4 text-[#64748b] flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
    </div>
  );
};

export default OnboardingWizard;
