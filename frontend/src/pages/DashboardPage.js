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

  // Get score label
  const getScoreLabel = (score) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Work';
  };

  const getUserFirstName = () => {
    if (user?.first_name) return user.first_name;
    if (user?.name) return user.name.split(' ')[0];
    return 'there';
  };

  // Speedometer gauge component
  const SpeedometerGauge = ({ score }) => {
    const angle = (score / 100) * 180 - 90; // -90 to 90 degrees
    
    return (
      <div className="relative w-64 h-40 mx-auto">
        {/* Gauge background arc */}
        <svg viewBox="0 0 200 120" className="w-full h-full">
          {/* Background segments */}
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="25%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="75%" stopColor="#84cc16" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          
          {/* Outer arc background */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="16"
            strokeLinecap="round"
          />
          
          {/* Gray track behind */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="20"
            strokeLinecap="round"
            style={{ transform: 'translateY(2px)' }}
          />
          
          {/* Needle */}
          <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '100px 100px' }}>
            <line
              x1="100"
              y1="100"
              x2="100"
              y2="35"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="100" cy="100" r="8" fill="white" />
          </g>
        </svg>
        
        {/* Score display */}
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-center">
          <div className="text-5xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {score}
          </div>
          <div className="text-lg font-medium" style={{ color: score >= 60 ? '#22c55e' : score >= 40 ? '#eab308' : '#ef4444' }}>
            {getScoreLabel(score)}
          </div>
        </div>
      </div>
    );
  };

  // Stat card component with gradients
  const StatCard = ({ icon: Icon, value, label, gradient, onClick }) => (
    <div 
      className="rounded-2xl p-6 cursor-pointer transition-all hover:scale-105 hover:shadow-xl"
      style={{ background: gradient }}
      onClick={onClick}
      data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Icon className="w-8 h-8 text-white/80 mb-4" />
      <div className="text-4xl font-bold text-white mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
        {value}
      </div>
      <div className="text-white/80 text-sm font-medium">
        {label}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="p-8 animate-fade-in">
        <div className="h-10 w-80 bg-white/5 rounded-lg mb-4 animate-pulse" />
        <div className="h-6 w-96 bg-white/5 rounded-lg mb-8 animate-pulse" />
        <div className="h-64 bg-white/5 rounded-2xl mb-6 animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-40 bg-white/5 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!estate && estates.length === 0) {
    return (
      <div className="p-8 animate-fade-in">
        <div className="glass-card max-w-lg mx-auto mt-12 p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--gold)]/20 flex items-center justify-center">
            <FolderLock className="w-10 h-10 text-[var(--gold)]" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Create Your First Estate</h2>
          <p className="text-[var(--t4)] mb-6">Start organizing your legacy by creating an estate.</p>
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
    <div className="p-6 lg:p-8 animate-fade-in" data-testid="benefactor-dashboard">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Welcome back, {getUserFirstName()}
          </h1>
          <p className="text-[var(--t4)] text-lg">
            Your legacy is taking shape. Here's your overview.
          </p>
        </div>
        <EstateSelector 
          currentEstate={estate} 
          estates={estates} 
          onEstateChange={handleEstateChange} 
          onEstatesUpdate={fetchEstates} 
        />
      </div>

      {/* Estate Readiness Score Card */}
      <div className="glass-card p-8 mb-6" data-testid="readiness-card">
        <h3 className="text-center text-sm font-semibold text-[var(--t4)] uppercase tracking-wider mb-6">
          Estate Readiness Score
        </h3>
        
        <SpeedometerGauge score={readinessScore} />
        
        {/* Percentage breakdown */}
        <div className="flex justify-center gap-8 mt-6">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#3b82f6]" />
            <span className="text-[var(--t3)] text-sm">{docsPercent}% Docs</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#14b8a6]" />
            <span className="text-[var(--t3)] text-sm">{msgsPercent}% Messages</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#f59e0b]" />
            <span className="text-[var(--t3)] text-sm">{checklistPercent}% Checklist</span>
          </div>
        </div>
      </div>

      {/* Colorful Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
          gradient="linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)"
          onClick={() => navigate('/messages')}
        />
        <StatCard 
          icon={CheckSquare}
          value={totalTasks}
          label="Immediate Action Checklist"
          gradient="linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)"
          onClick={() => navigate('/checklist')}
        />
        <StatCard 
          icon={Users}
          value={stats.beneficiaries}
          label="Beneficiaries"
          gradient="linear-gradient(135deg, #f97316 0%, #22c55e 100%)"
          onClick={() => navigate('/beneficiaries')}
        />
      </div>

      {/* Bottom Section - Vault & Messages Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Secure Document Vault Preview */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Secure Document Vault</h3>
            <span className="text-[var(--t4)] text-sm">
              {stats.documents > 0 ? `${(stats.documents * 0.5).toFixed(1)} MB / 10 GB` : '0 MB / 10 GB'}
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
            className="mt-4 text-[var(--gold)] hover:text-[var(--gold2)] text-sm font-medium flex items-center gap-1"
          >
            View All Documents <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Milestone Messages Preview */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Milestone Messages</h3>
            <span className="text-[var(--t4)] text-sm">
              {stats.messages} message{stats.messages !== 1 ? 's' : ''}
            </span>
          </div>
          {stats.messages > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                <MessageSquare className="w-5 h-5 text-[#14b8a6]" />
                <span className="text-[var(--t3)] text-sm">Messages ready for your loved ones</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <Clock className="w-5 h-5 text-[var(--t5)]" />
              <span className="text-[var(--t4)] text-sm">No messages yet</span>
            </div>
          )}
          <button 
            onClick={() => navigate('/messages')}
            className="mt-4 text-[var(--gold)] hover:text-[var(--gold2)] text-sm font-medium flex items-center gap-1"
          >
            Create Message <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
