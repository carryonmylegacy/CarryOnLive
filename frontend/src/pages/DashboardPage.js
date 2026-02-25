import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  FileText,
  MessageSquare,
  Users,
  Bot,
  ChevronRight,
  Shield,
  CheckCircle2,
  AlertCircle,
  Plus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Skeleton } from '../components/ui/skeleton';
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

  useEffect(() => {
    fetchEstates();
  }, []);

  useEffect(() => {
    if (estate) {
      fetchEstateData(estate.id);
    }
  }, [estate]);

  const fetchEstates = async () => {
    try {
      const response = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      setEstates(response.data);
      if (response.data.length > 0) {
        const savedEstateId = localStorage.getItem('selected_estate_id');
        const savedEstate = response.data.find(e => e.id === savedEstateId);
        setEstate(savedEstate || response.data[0]);
      }
      setLoading(false);
    } catch (error) {
      console.error('Fetch estates error:', error);
      setLoading(false);
    }
  };

  const fetchEstateData = async (estateId) => {
    try {
      const [docsRes, msgsRes, bensRes, checklistRes] = await Promise.all([
        axios.get(`${API_URL}/documents/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/messages/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/beneficiaries/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/checklists/${estateId}`, getAuthHeaders())
      ]);
      
      setStats({
        documents: docsRes.data.length,
        messages: msgsRes.data.length,
        beneficiaries: bensRes.data.length
      });
      setChecklists(checklistRes.data);
    } catch (error) {
      console.error('Fetch estate data error:', error);
    }
  };

  const handleEstateChange = (newEstate) => {
    setEstate(newEstate);
    localStorage.setItem('selected_estate_id', newEstate.id);
  };

  const completedTasks = checklists.filter(c => c.is_completed).length;
  const totalTasks = checklists.length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const quickActions = [
    { label: 'Upload Document', icon: FileText, path: '/vault', color: '#3b82f6' },
    { label: 'Create Message', icon: MessageSquare, path: '/messages', color: '#10b981' },
    { label: 'Add Beneficiary', icon: Users, path: '/beneficiaries', color: '#8b5cf6' },
    { label: 'Ask Guardian', icon: Bot, path: '/guardian', color: '#d4af37' },
  ];

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-white/5" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32 bg-white/5 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 bg-white/5 rounded-2xl" />
      </div>
    );
  }

  if (!estate && estates.length === 0) {
    return (
      <div className="p-6 animate-fade-in">
        <Card className="glass-card max-w-lg mx-auto mt-12">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#d4af37]/20 flex items-center justify-center">
              <Plus className="w-10 h-10 text-[#d4af37]" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Create Your First Estate
            </h2>
            <p className="text-[#94a3b8] mb-6">
              Start organizing your legacy by creating an estate. You can add documents, messages, and beneficiaries.
            </p>
            <EstateSelector 
              currentEstate={null}
              estates={[]}
              onEstateChange={handleEstateChange}
              onEstatesUpdate={fetchEstates}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in" data-testid="benefactor-dashboard">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Welcome back, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-[#94a3b8] mt-1">
            {estate?.name || 'Your Estate'} · Last updated today
          </p>
        </div>
        <div className="flex items-center gap-3">
          <EstateSelector
            currentEstate={estate}
            estates={estates}
            onEstateChange={handleEstateChange}
            onEstatesUpdate={fetchEstates}
          />
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#10b981]" />
            <span className="text-sm text-[#10b981]">Secure</span>
          </div>
        </div>
      </div>

      {/* Readiness Score Card */}
      <Card className="glass-card overflow-hidden" data-testid="readiness-card">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Progress Arc */}
            <div className="relative w-48 h-48">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#1e293b" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="45" fill="none" stroke="url(#goldGradient)" strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(estate?.readiness_score || 0) * 2.83} 283`}
                  className="progress-arc"
                />
                <defs>
                  <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#d4af37" />
                    <stop offset="100%" stopColor="#fcd34d" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {estate?.readiness_score || 0}%
                </span>
                <span className="text-sm text-[#94a3b8]">Estate Ready</span>
              </div>
            </div>

            {/* Stats */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                  <FileText className="w-4 h-4 text-[#3b82f6]" />
                  <span className="text-2xl font-bold text-white">{stats.documents}</span>
                </div>
                <p className="text-sm text-[#64748b]">Documents</p>
              </div>
              <div className="text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                  <MessageSquare className="w-4 h-4 text-[#10b981]" />
                  <span className="text-2xl font-bold text-white">{stats.messages}</span>
                </div>
                <p className="text-sm text-[#64748b]">Messages</p>
              </div>
              <div className="text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                  <Users className="w-4 h-4 text-[#8b5cf6]" />
                  <span className="text-2xl font-bold text-white">{stats.beneficiaries}</span>
                </div>
                <p className="text-sm text-[#64748b]">Beneficiaries</p>
              </div>
              <div className="text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-[#d4af37]" />
                  <span className="text-2xl font-bold text-white">{completedTasks}/{totalTasks}</span>
                </div>
                <p className="text-sm text-[#64748b]">Tasks Done</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <Card
            key={action.label}
            className="glass-card cursor-pointer hover:border-white/20 transition-all hover:-translate-y-1"
            onClick={() => navigate(action.path)}
            data-testid={`quick-action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <CardContent className="p-5 flex flex-col items-center text-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${action.color}20` }}
              >
                <action.icon className="w-6 h-6" style={{ color: action.color }} />
              </div>
              <span className="text-white font-medium text-sm">{action.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Two Column Layout: Checklist + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Checklist Preview */}
        <Card className="glass-card" data-testid="checklist-preview">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Immediate Action Checklist
            </CardTitle>
            <Button variant="ghost" className="text-[#d4af37] hover:text-[#fcd34d]" onClick={() => navigate('/checklist')}>
              View All <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[#94a3b8] text-sm">{completedTasks} of {totalTasks} completed</span>
                <span className="text-[#d4af37] font-semibold">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2 bg-white/10" />
              
              <div className="mt-4 space-y-2">
                {checklists.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-xl ${
                      item.is_completed ? 'bg-[#10b981]/10' : 'bg-white/5'
                    }`}
                  >
                    {item.is_completed ? (
                      <CheckCircle2 className="w-5 h-5 text-[#10b981]" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-[#f59e0b]" />
                    )}
                    <span className={`flex-1 ${item.is_completed ? 'text-[#94a3b8] line-through' : 'text-white'}`}>
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Activity Timeline */}
        {estate && <ActivityTimeline estateId={estate.id} limit={10} />}
      </div>

      {/* Footer Security Badge */}
      <div className="flex items-center justify-center gap-4 py-4 text-[#64748b] text-sm">
        <Shield className="w-4 h-4" />
        <span>AES-256 Encrypted</span>
        <span>·</span>
        <span>Zero-Knowledge</span>
        <span>·</span>
        <span>SOC 2 Compliant</span>
      </div>
    </div>
  );
};

export default DashboardPage;
