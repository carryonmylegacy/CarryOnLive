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
  Clock
} from 'lucide-react';
import EstateSelector from '../components/estate/EstateSelector';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DashboardPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [estates, setEstates] = useState([]);
  const [estate, setEstate] = useState(null);
  const [checklists, setChecklists] = useState([]);
  const [stats, setStats] = useState({ documents: 0, messages: 0, beneficiaries: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchEstates(); }, []);
  useEffect(() => { if (estate) fetchEstateData(estate.id); }, [estate]);

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
      const [docsRes, msgsRes, bensRes, checklistRes] = await Promise.all([
        axios.get(`${API_URL}/documents/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/messages/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/beneficiaries/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/checklists/${estateId}`, getAuthHeaders())
      ]);
      setStats({ documents: docsRes.data.length, messages: msgsRes.data.length, beneficiaries: bensRes.data.length });
      setChecklists(checklistRes.data);
    } catch (error) { console.error('Fetch estate data error:', error); }
  };

  const handleEstateChange = (newEstate) => { 
    setEstate(newEstate); 
    localStorage.setItem('selected_estate_id', newEstate.id); 
  };

  const completedTasks = checklists.filter(c => c.is_completed).length;
  const totalTasks = checklists.length || 5;
  const readinessScore = estate?.readiness_score || 0;

  // Calculate percentages for the gauge breakdown
  const docsPercent = Math.min(100, stats.documents * 10);
  const msgsPercent = Math.min(100, stats.messages * 15);
  const checklistPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

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
    const angle = (score / 100) * 180 - 90; // -90 to 90 degrees
    
    return (
      <div className="relative w-48 h-32 mx-auto">
        <svg viewBox="0 0 200 110" className="w-full h-full">
          {/* Gradient definition */}
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="25%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="75%" stopColor="#84cc16" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          
          {/* Background arc */}
          <path
            d="M 20 95 A 80 80 0 0 1 180 95"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="18"
            strokeLinecap="round"
          />
          
          {/* Colored arc */}
          <path
            d="M 20 95 A 80 80 0 0 1 180 95"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          
          {/* Needle */}
          <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '100px 95px', transition: 'transform 0.5s ease-out' }}>
            <line
              x1="100"
              y1="95"
              x2="100"
              y2="30"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="100" cy="95" r="8" fill="white" />
            <circle cx="100" cy="95" r="4" fill="var(--bg)" />
          </g>
        </svg>
        
        {/* Score display - positioned below the gauge */}
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-center">
          <div className="text-4xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {score}
          </div>
          <div className="text-base font-semibold" style={{ color: scoreInfo.color }}>
            {scoreInfo.label}
          </div>
        </div>
      </div>
    );
  };

  // Stat card component with gradients
  const StatCard = ({ icon: Icon, value, label, gradient, onClick, className = '' }) => (
    <div 
      className={`rounded-2xl p-4 lg:p-6 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] ${className}`}
      style={{ background: gradient }}
      onClick={onClick}
      data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Icon className="w-6 h-6 lg:w-8 lg:h-8 text-white/80 mb-2 lg:mb-4" />
      <div className="text-2xl lg:text-4xl font-bold text-white mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
        {value}
      </div>
      <div className="text-white/80 text-xs lg:text-sm font-medium leading-tight">
        {label}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="p-4 lg:p-8 pt-20 lg:pt-8 animate-fade-in">
        <div className="h-8 w-64 bg-white/5 rounded-lg mb-4 animate-pulse" />
        <div className="h-5 w-80 bg-white/5 rounded-lg mb-6 animate-pulse" />
        <div className="h-48 bg-white/5 rounded-2xl mb-4 animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="h-28 bg-white/5 rounded-2xl animate-pulse" />)}
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
          <h2 className="text-xl lg:text-2xl font-bold text-white mb-3">Create Your First Estate</h2>
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
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl lg:text-4xl font-bold text-white mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Welcome back, {getUserFirstName()}
        </h1>
        <p className="text-[var(--t4)] text-sm lg:text-lg">
          Your legacy is taking shape. Here's your overview.
        </p>
      </div>

      {/* Estate Selector - Mobile shows full width */}
      <div className="mb-6">
        <EstateSelector 
          currentEstate={estate} 
          estates={estates} 
          onEstateChange={handleEstateChange} 
          onEstatesUpdate={fetchEstates} 
        />
      </div>

      {/* Estate Readiness Score Card */}
      <div className="glass-card p-6 lg:p-8 mb-4" data-testid="readiness-card">
        <h3 className="text-center text-xs lg:text-sm font-semibold text-[var(--t4)] uppercase tracking-wider mb-4 lg:mb-6">
          Estate Readiness Score
        </h3>
        
        <SpeedometerGauge score={readinessScore} />
        
        {/* Percentage breakdown */}
        <div className="flex justify-center gap-4 lg:gap-8 mt-14 lg:mt-16">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 lg:w-3 lg:h-3 rounded-full bg-[#3b82f6]" />
            <span className="text-[var(--t3)] text-xs lg:text-sm">{docsPercent}% Docs</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 lg:w-3 lg:h-3 rounded-full bg-[#14b8a6]" />
            <span className="text-[var(--t3)] text-xs lg:text-sm">{msgsPercent}% Messages</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 lg:w-3 lg:h-3 rounded-full bg-[#f59e0b]" />
            <span className="text-[var(--t3)] text-xs lg:text-sm">{checklistPercent}% Checklist</span>
          </div>
        </div>
      </div>

      {/* Stat Cards - Mobile: 3 in row, then full-width Beneficiaries */}
      {/* Desktop: 4 in row */}
      <div className="grid grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4 mb-4">
        <StatCard 
          icon={FolderLock}
          value={stats.documents}
          label="Secure Document Vault"
          gradient="linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)"
          onClick={() => navigate('/vault')}
        />
        <StatCard 
          icon={MessageSquare}
          value={stats.messages}
          label="Milestone Messages"
          gradient="linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)"
          onClick={() => navigate('/messages')}
        />
        <StatCard 
          icon={CheckSquare}
          value={totalTasks}
          label="Immediate Action Checklist"
          gradient="linear-gradient(135deg, #f97316 0%, #ea580c 100%)"
          onClick={() => navigate('/checklist')}
        />
        {/* Desktop only - 4th card in same row */}
        <StatCard 
          icon={Users}
          value={stats.beneficiaries}
          label="Beneficiaries"
          gradient="linear-gradient(135deg, #22c55e 0%, #16a34a 100%)"
          onClick={() => navigate('/beneficiaries')}
          className="hidden lg:block"
        />
      </div>

      {/* Mobile only - Beneficiaries full width */}
      <div className="lg:hidden mb-4">
        <div 
          className="rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-4"
          style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}
          onClick={() => navigate('/beneficiaries')}
          data-testid="stat-card-beneficiaries-mobile"
        >
          <Users className="w-8 h-8 text-white/80" />
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {stats.beneficiaries}
            </span>
            <span className="text-white/80 text-sm font-medium">Beneficiaries</span>
          </div>
        </div>
      </div>

      {/* Bottom Section - Vault & Messages Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Secure Document Vault Preview */}
        <div className="glass-card p-4 lg:p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base lg:text-lg font-semibold text-white">Secure Document Vault</h3>
            <span className="text-[var(--t4)] text-xs lg:text-sm">
              {stats.documents > 0 ? `${(stats.documents * 0.5).toFixed(0)} MB` : '0 MB'} / 10 GB
            </span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#3b82f6] to-[#1d4ed8] rounded-full transition-all"
              style={{ width: `${Math.min(100, (stats.documents * 0.5 / 10000) * 100)}%` }}
            />
          </div>
          <button 
            onClick={() => navigate('/vault')}
            className="mt-3 text-[var(--gold)] hover:text-[var(--gold2)] text-sm font-medium flex items-center gap-1"
          >
            View All Documents <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Milestone Messages Preview */}
        <div className="glass-card p-4 lg:p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base lg:text-lg font-semibold text-white">Milestone Messages</h3>
            <span className="text-[var(--t4)] text-xs lg:text-sm">
              {stats.messages} message{stats.messages !== 1 ? 's' : ''}
            </span>
          </div>
          {stats.messages > 0 ? (
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <MessageSquare className="w-5 h-5 text-[#14b8a6]" />
              <span className="text-[var(--t3)] text-sm">Messages ready for your loved ones</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <Clock className="w-5 h-5 text-[var(--t5)]" />
              <span className="text-[var(--t4)] text-sm">No messages yet</span>
            </div>
          )}
          <button 
            onClick={() => navigate('/messages')}
            className="mt-3 text-[var(--gold)] hover:text-[var(--gold2)] text-sm font-medium flex items-center gap-1"
          >
            Create Message <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
