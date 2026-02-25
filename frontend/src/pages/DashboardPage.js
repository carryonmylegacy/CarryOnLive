import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  FileText, 
  MessageSquare, 
  Users, 
  Sparkles, 
  ChevronRight, 
  Shield, 
  CheckCircle2, 
  AlertCircle, 
  Plus,
  FolderLock,
  Clock
} from 'lucide-react';
import EstateSelector from '../components/estate/EstateSelector';
import ActivityTimeline from '../components/estate/ActivityTimeline';

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
  const totalTasks = checklists.length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const readinessScore = estate?.readiness_score || 0;
  const circumference = 2 * Math.PI * 70;
  const strokeDashoffset = circumference - (readinessScore / 100) * circumference;

  const quickActions = [
    { label: 'Upload Document', icon: FolderLock, path: '/vault', color: 'var(--bl)', bg: 'var(--blbg)' },
    { label: 'Create Message', icon: MessageSquare, path: '/messages', color: 'var(--gn)', bg: 'var(--gnbg)' },
    { label: 'Add Beneficiary', icon: Users, path: '/beneficiaries', color: 'var(--pr)', bg: 'var(--prbg)' },
    { label: 'Ask Guardian', icon: Sparkles, path: '/guardian', color: 'var(--gold)', bg: 'var(--seal-bg)' },
  ];

  const getUserFirstName = () => {
    if (user?.first_name) return user.first_name;
    if (user?.name) return user.name.split(' ')[0];
    return 'there';
  };

  if (loading) {
    return (
      <div className="page animate-fade-in">
        <div className="h-8 w-64 bg-[var(--s)] rounded-lg mb-8 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 bg-[var(--s)] rounded-2xl animate-pulse" />
          <div className="h-64 bg-[var(--s)] rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!estate && estates.length === 0) {
    return (
      <div className="page animate-fade-in">
        <div className="glass-card max-w-lg mx-auto mt-12">
          <div className="card-content text-center py-12">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--seal-bg)] flex items-center justify-center">
              <Plus className="w-10 h-10 text-[var(--gold)]" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--t)] mb-3">Create Your First Estate</h2>
            <p className="text-[var(--t4)] mb-6">Start organizing your legacy by creating an estate.</p>
            <EstateSelector 
              currentEstate={null} 
              estates={[]} 
              onEstateChange={handleEstateChange} 
              onEstatesUpdate={fetchEstates} 
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page animate-fade-in" data-testid="benefactor-dashboard">
      {/* Page Header */}
      <div className="page-header">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1>Welcome back, {getUserFirstName()}</h1>
            <p>{estate?.name || 'Your Estate'} · Last updated today</p>
          </div>
          <div className="flex items-center gap-3">
            <EstateSelector 
              currentEstate={estate} 
              estates={estates} 
              onEstateChange={handleEstateChange} 
              onEstatesUpdate={fetchEstates} 
            />
          </div>
        </div>
      </div>

      {/* Main Grid - Bento Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Readiness Gauge Card */}
        <div className="glass-card lg:col-span-1" data-testid="readiness-card">
          <div className="card-content flex flex-col items-center py-8">
            <h3 className="text-sm font-semibold text-[var(--t4)] uppercase tracking-wider mb-6">
              Estate Readiness
            </h3>
            
            {/* Gauge */}
            <div className="readiness-gauge mb-6">
              <svg viewBox="0 0 160 160" className="w-full h-full">
                <circle 
                  cx="80" cy="80" r="70" 
                  className="gauge-bg"
                />
                <circle 
                  cx="80" cy="80" r="70" 
                  className="gauge-fill"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <div className="gauge-center">
                <span className="gauge-score">{readinessScore}</span>
                <span className="gauge-label">Score</span>
              </div>
            </div>

            {/* Factors */}
            <div className="w-full space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--bl)]" />
                  <span className="text-[var(--t3)]">Documents</span>
                </div>
                <span className="text-[var(--t)]">{stats.documents}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--gn)]" />
                  <span className="text-[var(--t3)]">Messages</span>
                </div>
                <span className="text-[var(--t)]">{stats.messages}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--pr)]" />
                  <span className="text-[var(--t3)]">Beneficiaries</span>
                </div>
                <span className="text-[var(--t)]">{stats.beneficiaries}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--gold)]" />
                  <span className="text-[var(--t3)]">Tasks Completed</span>
                </div>
                <span className="text-[var(--t)]">{completedTasks}/{totalTasks}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-[var(--t4)] uppercase tracking-wider mb-4">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <div 
                key={action.label} 
                className="quick-action"
                onClick={() => navigate(action.path)}
                data-testid={`quick-action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div 
                  className="quick-action-icon" 
                  style={{ backgroundColor: action.bg }}
                >
                  <action.icon className="w-6 h-6" style={{ color: action.color }} />
                </div>
                <span className="quick-action-label">{action.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Checklist & Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Checklist Card */}
        <div className="glass-card" data-testid="checklist-preview">
          <div className="card-header flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--t)]">Immediate Action Checklist</h3>
            <button 
              className="flex items-center gap-1 text-sm text-[var(--gold)] hover:text-[var(--gold2)] transition-colors"
              onClick={() => navigate('/checklist')}
            >
              View All <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="card-content">
            {/* Progress Bar */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-[var(--t4)]">{completedTasks} of {totalTasks} completed</span>
              <span className="text-sm font-semibold text-[var(--gold)]">{progressPercent}%</span>
            </div>
            <div className="progress-bar mb-4">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            
            {/* Checklist Items */}
            <div className="space-y-2">
              {checklists.length === 0 ? (
                <div className="text-center py-6 text-[var(--t4)]">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No tasks yet. Create your first action item.</p>
                </div>
              ) : (
                checklists.slice(0, 4).map((item) => (
                  <div 
                    key={item.id} 
                    className={`checklist-item ${item.is_completed ? 'completed' : ''}`}
                  >
                    {item.is_completed ? (
                      <CheckCircle2 className="w-5 h-5 text-[var(--gn)] flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-[var(--yw)] flex-shrink-0" />
                    )}
                    <span className={`flex-1 ${item.is_completed ? 'text-[var(--t4)] line-through' : 'text-[var(--t)]'}`}>
                      {item.title}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Activity Timeline */}
        {estate && <ActivityTimeline estateId={estate.id} limit={10} />}
      </div>

      {/* Security Footer */}
      <div className="flex items-center justify-center gap-4 py-6 text-[var(--t5)]">
        <div className="security-badge">
          <Shield className="w-4 h-4" />
          <span>AES-256 Encrypted</span>
        </div>
        <span>·</span>
        <span className="text-sm">Zero-Knowledge</span>
        <span>·</span>
        <span className="text-sm">SOC 2 Compliant</span>
      </div>
    </div>
  );
};

export default DashboardPage;
