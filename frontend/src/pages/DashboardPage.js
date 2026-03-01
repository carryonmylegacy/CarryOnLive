import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  FolderLock, 
  MessageSquare, 
  Users, 
  CheckSquare,
  ChevronRight,
  Clock,
  CheckCircle2,
  Circle
} from 'lucide-react';
import EstateSelector from '../components/estate/EstateSelector';
import TrialBanner from '../components/TrialBanner';
import OnboardingWizard from '../components/OnboardingWizard';

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
  const [hoveredSection, setHoveredSection] = useState(null);
  const [showPaywall, setShowPaywall] = useState(false);

  // Sync hovered section to root element for sidebar CSS targeting
  useEffect(() => {
    if (hoveredSection) {
      document.documentElement.dataset.hoverSection = hoveredSection;
    } else {
      delete document.documentElement.dataset.hoverSection;
    }
    return () => { delete document.documentElement.dataset.hoverSection; };
  }, [hoveredSection]);

  useEffect(() => { fetchEstates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (estate) fetchEstateData(estate.id); }, [estate]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchEstates = async () => {
    try {
      const response = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      setEstates(response.data);
      if (response.data.length > 0) {
        const savedEstateId = localStorage.getItem('selected_estate_id');
        const savedEstate = response.data.find(e => e.id === savedEstateId);
        setEstate(savedEstate || response.data[0]);
      }
    } catch (error) { console.error('Fetch estates error:', error); }
    finally { setLoading(false); }
  };

  const fetchEstateData = async (estateId) => {
    try {
      const [docsRes, msgsRes, bensRes, checklistRes, readinessRes] = await Promise.all([
        axios.get(`${API_URL}/documents/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/messages/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/beneficiaries/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/checklists/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/estate/${estateId}/readiness`, getAuthHeaders())
      ]);
      setStats({ documents: docsRes.data.length, messages: msgsRes.data.length, beneficiaries: bensRes.data.length });
      setChecklists(checklistRes.data);
      setReadiness(readinessRes.data);
      // Update estate's readiness_score locally to match
      setEstate(prev => prev ? { ...prev, readiness_score: readinessRes.data.overall_score } : prev);
    } catch (error) { console.error('Fetch estate data error:', error); }
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
    if (score >= 80) return { label: 'Excellent', color: '#22c55e' };
    if (score >= 60) return { label: 'Good', color: '#22c55e' };
    if (score >= 40) return { label: 'Fair', color: '#eab308' };
    if (score >= 20) return { label: 'Needs Work', color: '#f97316' };
    return { label: 'Needs Work', color: '#ef4444' };
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
          <div className="text-3xl lg:text-5xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {score}%
          </div>
          <div className="text-base lg:text-2xl font-bold" style={{ color: scoreInfo.color }}>
            {scoreInfo.label}
          </div>
        </div>
      </div>
    );
  };

  // Stat card component - uses CSS class for theme-adaptive colors
  const StatCard = ({ icon: Icon, value, label, cardClass, onClick, className = '', sectionKey }) => (
    <div 
      className={`${cardClass} rounded-2xl p-4 lg:p-6 cursor-pointer transition-all duration-300 hover:scale-[1.05] hover:shadow-xl active:scale-[0.98] flex flex-col items-center justify-center ${hoveredSection === sectionKey ? 'scale-[1.05] shadow-xl' : ''} ${className}`}
      onClick={onClick}
      onMouseEnter={() => setHoveredSection(sectionKey)}
      onMouseLeave={() => setHoveredSection(null)}
      data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Icon className="stat-icon w-6 h-6 lg:w-8 lg:h-8 opacity-70 mb-2 lg:mb-4" />
      <div className="text-3xl lg:text-5xl font-bold mb-2 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>
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
      <div className="p-4 lg:p-8 pt-20 lg:pt-8 animate-fade-in">
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
      <div className="p-4 lg:p-8 pt-20 lg:pt-8 animate-fade-in">
        <div className="glass-card max-w-lg mx-auto mt-8 p-8 lg:p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--gold)]/20 flex items-center justify-center">
            <FolderLock className="w-8 h-8 text-[var(--gold)]" />
          </div>
          <h2 className="text-xl lg:text-2xl font-bold text-[var(--t)] mb-3">Create Your First Estate</h2>
          <p className="text-[var(--t4)] mb-6 text-sm lg:text-base">Start organizing your legacy by creating an estate.</p>
          <EstateSelector 
            currentEstate={null} 
            estates={[]} 
            onEstateChange={handleEstateChange} 
            onEstatesUpdate={fetchEstates} 
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 pt-20 lg:pt-8 pb-24 lg:pb-8 animate-fade-in" data-testid="benefactor-dashboard">
      {/* Trial Banner */}
      <div className="mb-4">
        <TrialBanner onUpgrade={() => setShowPaywall(true)} />
      </div>

      {/* Header + Estate Selector */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl lg:text-4xl font-bold text-[var(--t)] mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Welcome back, {getUserFirstName()}
          </h1>
          <p className="text-[var(--t4)] text-base lg:text-xl">
            Your legacy is taking shape. Here's your overview.
          </p>
        </div>
        <div className="sm:mt-1">
          <EstateSelector 
            currentEstate={estate} 
            estates={estates} 
            onEstateChange={handleEstateChange} 
            onEstatesUpdate={fetchEstates} 
          />
        </div>
      </div>

      {/* Onboarding Wizard — shown early so it's visible on mobile */}
      <OnboardingWizard />

      {/* Estate Readiness Score */}
      <div className="rounded-2xl p-5 lg:p-6 mb-4" style={{ background: 'linear-gradient(168deg, rgba(26,36,64,0.7), rgba(15,22,41,0.9))', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} data-testid="readiness-card">
        {/* Title */}
        <h2 className="text-center text-lg lg:text-2xl font-bold text-[var(--t)] uppercase tracking-[0.15em] mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Estate Readiness Score
        </h2>

        {/* Gauge centered */}
        <SpeedometerGauge score={readinessScore} />

        {/* Three mini stat pills + key — horizontal row */}
        <div className="flex items-center justify-between gap-2 mt-6 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex gap-2 flex-1">
            <div className="stat-card-vault rounded-xl px-3 py-2.5 cursor-pointer transition-all hover:scale-[1.05] active:scale-[0.98] flex items-center gap-2 flex-1"
              onClick={() => navigate('/vault')} data-testid="stat-card-vault-mini">
              <FolderLock className="stat-icon w-4 h-4 opacity-70 shrink-0" />
              <div>
                <div className="text-lg font-bold leading-none" style={{ fontFamily: 'Outfit, sans-serif' }}>{stats.documents}</div>
                <div className="opacity-70 text-[9px] font-bold mt-0.5">Documents</div>
              </div>
            </div>
            <div className="stat-card-messages rounded-xl px-3 py-2.5 cursor-pointer transition-all hover:scale-[1.05] active:scale-[0.98] flex items-center gap-2 flex-1"
              onClick={() => navigate('/messages')} data-testid="stat-card-messages-mini">
              <MessageSquare className="stat-icon w-4 h-4 opacity-70 shrink-0" />
              <div>
                <div className="text-lg font-bold leading-none" style={{ fontFamily: 'Outfit, sans-serif' }}>{stats.messages}</div>
                <div className="opacity-70 text-[9px] font-bold mt-0.5">Messages</div>
              </div>
            </div>
            <div className="stat-card-checklist rounded-xl px-3 py-2.5 cursor-pointer transition-all hover:scale-[1.05] active:scale-[0.98] flex items-center gap-2 flex-1"
              onClick={() => navigate('/checklist')} data-testid="stat-card-checklist-mini">
              <CheckSquare className="stat-icon w-4 h-4 opacity-70 shrink-0" />
              <div>
                <div className="text-lg font-bold leading-none" style={{ fontFamily: 'Outfit, sans-serif' }}>{totalTasks}</div>
                <div className="opacity-70 text-[9px] font-bold mt-0.5">Checklist</div>
              </div>
            </div>
          </div>
          {/* Key */}
          <div className="flex flex-col gap-1 pl-3 shrink-0" style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#2563eb]" /><span className="text-[var(--t4)] text-[10px]">{docsPercent}%</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#8b5cf6]" /><span className="text-[var(--t4)] text-[10px]">{msgsPercent}%</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#f97316]" /><span className="text-[var(--t4)] text-[10px]">{checklistPercent}%</span></div>
          </div>
        </div>
      </div>

      {/* Beneficiaries bar */}
      <div 
        className="stat-card-beneficiaries rounded-xl p-3.5 mb-4 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-3"
        onClick={() => navigate('/beneficiaries')}
        data-testid="stat-card-beneficiaries-inline"
      >
        <Users className="stat-icon w-6 h-6 opacity-80" />
        <span className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{stats.beneficiaries}</span>
        <span className="opacity-90 text-base font-bold">Beneficiaries</span>
      </div>

      {/* Bottom Section - Vault, Messages & Checklist Previews */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Secure Document Vault Preview - Blue */}
        <div 
          className={`glass-card p-4 lg:p-6 border-l-4 border-l-[#2563eb] transition-all duration-300 cursor-pointer ${hoveredSection === 'vault' ? 'shadow-[0_12px_36px_-6px_rgba(37,99,235,0.3)] scale-[1.02] border-l-[6px]' : ''}`}
          data-testid="preview-vault"
          onMouseEnter={() => setHoveredSection('vault')}
          onMouseLeave={() => setHoveredSection(null)}
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
          className={`glass-card p-4 lg:p-6 border-l-4 border-l-[#8b5cf6] transition-all duration-300 cursor-pointer ${hoveredSection === 'messages' ? 'shadow-[0_12px_36px_-6px_rgba(139,92,246,0.3)] scale-[1.02] border-l-[6px]' : ''}`}
          data-testid="preview-messages"
          onMouseEnter={() => setHoveredSection('messages')}
          onMouseLeave={() => setHoveredSection(null)}
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
          className={`glass-card p-4 lg:p-6 border-l-4 border-l-[#f97316] transition-all duration-300 cursor-pointer ${hoveredSection === 'checklist' ? 'shadow-[0_12px_36px_-6px_rgba(249,115,22,0.3)] scale-[1.02] border-l-[6px]' : ''}`}
          data-testid="preview-checklist"
          onMouseEnter={() => setHoveredSection('checklist')}
          onMouseLeave={() => setHoveredSection(null)}
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
    </div>
  );
};

export default DashboardPage;
