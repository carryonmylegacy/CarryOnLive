import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, FolderLock, MessageSquare, CheckSquare, ChevronRight, ChevronLeft } from 'lucide-react';
import { Skeleton } from '../../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BeneficiaryDashboardPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [estate, setEstate] = useState(null);
  const [stats, setStats] = useState({ documents: 0, messages: 0, checklists: 0, checklistsDone: 0 });
  const [checklists, setChecklists] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const estateId = localStorage.getItem('beneficiary_estate_id');
      if (!estateId) { navigate('/beneficiary'); return; }
      const estateRes = await axios.get(`${API_URL}/estates/${estateId}`, getAuthHeaders());
      if (estateRes.data.status !== 'transitioned') { navigate('/beneficiary/pre'); return; }
      setEstate(estateRes.data);

      const [docsRes, msgsRes, clRes] = await Promise.all([
        axios.get(`${API_URL}/documents/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/messages/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/checklists/${estateId}`, getAuthHeaders()),
      ]);
      setDocuments(docsRes.data);
      setMessages(msgsRes.data);
      setChecklists(clRes.data);
      setStats({
        documents: docsRes.data.length,
        messages: msgsRes.data.length,
        checklists: clRes.data.length,
        checklistsDone: clRes.data.filter(c => c.is_completed).length,
      });
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const firstName = user?.name?.split(' ')[0] || 'there';
  const benefactorFirst = estate?.name?.split(' ')[0] || 'Your benefactor';
  const fB = (b) => { if (!b) return '0 B'; const k = 1024; const s = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(b) / Math.log(k)); return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i]; };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-10 w-64 bg-[var(--s)]" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 bg-[var(--s)] rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 animate-fade-in" data-testid="beneficiary-dashboard">
      {/* Sealed Banner */}
      <div className="glass-card p-4 mb-5 flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--seal-bg, rgba(217,119,6,0.12))' }}>
          <Lock className="w-5 h-5 text-[var(--gold)]" />
        </div>
        <div>
          <div className="font-bold text-[var(--gold)] text-sm">Benefactor Account Sealed</div>
          <p className="text-xs text-[var(--t3)] leading-relaxed">
            {estate?.name}'s account was verified and sealed. This vault is immutable and read-only.
          </p>
        </div>
      </div>

      {/* Back to Estates */}
      <button
        onClick={() => navigate('/beneficiary')}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl mb-4 text-sm font-bold transition-all"
        style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.35)', color: '#60A5FA' }}
        data-testid="back-to-estates"
      >
        <ChevronLeft className="w-4 h-4" /> Back to My Estates
      </button>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-[var(--t)] mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
          {firstName}, we're here for you
        </h1>
        <p className="text-[var(--t4)] text-sm lg:text-base">
          {benefactorFirst} prepared these resources to help guide you.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-3 lg:gap-4 mb-5">
        <div
          className="rounded-2xl p-4 lg:p-6 cursor-pointer transition-all hover:scale-[1.02] flex flex-col items-center justify-center text-white"
          style={{ background: 'linear-gradient(135deg, #78350F, #B45309, #D97706)', boxShadow: '0 12px 48px -4px rgba(217,119,6,0.5), 0 2px 0 0 rgba(255,210,130,0.25) inset, 0 -6px 16px rgba(0,0,0,0.3) inset', border: '1px solid rgba(251,191,36,0.2)' }}
          onClick={() => navigate('/beneficiary/checklist')}
          data-testid="stat-checklist"
        >
          <CheckSquare className="w-6 h-6 lg:w-8 lg:h-8 opacity-70 mb-2" />
          <div className="text-2xl lg:text-4xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {stats.checklistsDone}/{stats.checklists}
          </div>
          <div className="text-xs lg:text-sm opacity-85 text-center font-bold">Immediate Action<br />Checklist</div>
        </div>
        <div
          className="rounded-2xl p-4 lg:p-6 cursor-pointer transition-all hover:scale-[1.02] flex flex-col items-center justify-center text-white"
          style={{ background: 'linear-gradient(135deg, #1E3A8A, #1D4ED8, #2563EB)', boxShadow: '0 12px 48px -4px rgba(37,99,235,0.5), 0 2px 0 0 rgba(147,197,253,0.25) inset, 0 -6px 16px rgba(0,0,0,0.3) inset', border: '1px solid rgba(96,165,250,0.2)' }}
          onClick={() => navigate('/beneficiary/vault')}
          data-testid="stat-vault"
        >
          <FolderLock className="w-6 h-6 lg:w-8 lg:h-8 opacity-70 mb-2" />
          <div className="text-2xl lg:text-4xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {stats.documents}
          </div>
          <div className="text-xs lg:text-sm opacity-85 text-center font-bold">Secure Document<br />Vault</div>
        </div>
        <div
          className="rounded-2xl p-4 lg:p-6 cursor-pointer transition-all hover:scale-[1.02] flex flex-col items-center justify-center text-white"
          style={{ background: 'linear-gradient(135deg, #4C1D95, #6D28D9, #7C3AED)', boxShadow: '0 8px 36px rgba(124,58,237,0.35), 0 1px 0 0 rgba(255,255,255,0.15) inset, 0 -2px 8px rgba(0,0,0,0.2) inset' }}
          onClick={() => navigate('/beneficiary/messages')}
          data-testid="stat-messages"
        >
          <MessageSquare className="w-6 h-6 lg:w-8 lg:h-8 opacity-70 mb-2" />
          <div className="text-2xl lg:text-4xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {stats.messages}
          </div>
          <div className="text-xs lg:text-sm opacity-85 text-center font-bold">Milestone<br />Messages</div>
        </div>
      </div>

      {/* Preview Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Checklist Preview */}
        <div className="glass-card p-4 lg:p-5" style={{ borderLeft: '3px solid var(--yw)' }}>
          <h3 className="font-bold text-[var(--yw)] mb-3">Immediate Action Checklist</h3>
          <div className="h-2 bg-[var(--b)] rounded-full overflow-hidden mb-3">
            <div className="h-full rounded-full" style={{ width: `${stats.checklists > 0 ? (stats.checklistsDone / stats.checklists) * 100 : 0}%`, background: 'linear-gradient(90deg, #10B981, #34D399)' }} />
          </div>
          {checklists.filter(c => !c.is_completed).slice(0, 4).map(c => (
            <div key={c.id} className="flex items-center gap-2 py-2 text-sm" style={{ borderBottom: '1px solid var(--b)' }}>
              <CheckSquare className="w-4 h-4 text-[var(--t5)] flex-shrink-0" />
              <span className="text-[var(--t2)] flex-1 truncate">{c.title}</span>
            </div>
          ))}
          <button onClick={() => navigate('/beneficiary/checklist')} className="mt-2 text-sm text-[var(--bl3)] font-bold flex items-center gap-1">
            View All <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Vault Preview */}
        <div className="glass-card p-4 lg:p-5" style={{ borderLeft: '3px solid var(--bl2)' }}>
          <div className="flex justify-between mb-3">
            <h3 className="font-bold text-[var(--bl2)]">Secure Document Vault</h3>
            <span className="text-xs text-[var(--t5)]">{stats.documents} sealed documents</span>
          </div>
          {documents.slice(0, 4).map(d => (
            <div key={d.id} className="flex items-center gap-2 py-2 text-sm cursor-pointer" style={{ borderBottom: '1px solid var(--b)' }} onClick={() => navigate('/beneficiary/vault')}>
              <FolderLock className="w-4 h-4 text-[var(--t5)] flex-shrink-0" />
              <span className="text-[var(--t2)] flex-1 truncate">{d.name}</span>
              <span className="text-xs text-[var(--t5)]">{fB(d.file_size)}</span>
            </div>
          ))}
          <button onClick={() => navigate('/beneficiary/vault')} className="mt-2 text-sm text-[var(--bl3)] font-bold flex items-center gap-1">
            View All <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Messages Preview */}
        <div className="glass-card p-4 lg:p-5 lg:col-span-2" style={{ borderLeft: '3px solid var(--pr2)' }}>
          <div className="flex justify-between mb-3">
            <h3 className="font-bold text-[var(--pr2)]">Milestone Messages</h3>
            <span className="text-xs text-[var(--t5)]">{stats.messages} messages</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {messages.slice(0, 4).map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} onClick={() => navigate('/beneficiary/messages')}>
                <MessageSquare className="w-4 h-4 text-[var(--pr2)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[var(--t2)] truncate">{m.title}</div>
                  <div className="text-xs text-[var(--pr2)] capitalize">{m.trigger_type?.replace(/_/g, ' ')}</div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => navigate('/beneficiary/messages')} className="mt-3 text-sm text-[var(--bl3)] font-bold flex items-center gap-1">
            View All <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default BeneficiaryDashboardPage;
