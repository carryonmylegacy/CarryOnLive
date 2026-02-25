import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { CheckSquare, CheckCircle2, ChevronLeft, Lock, Phone, Mail } from 'lucide-react';
import { Progress } from '../../components/ui/progress';
import { toast } from 'sonner';
import { Skeleton } from '../../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BeneficiaryChecklistPage = () => {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const estateId = localStorage.getItem('beneficiary_estate_id');
      if (!estateId) { navigate('/beneficiary'); return; }
      const res = await axios.get(`${API_URL}/checklists/${estateId}`, getAuthHeaders());
      setChecklists(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const toggleItem = async (itemId) => {
    setToggling(itemId);
    try {
      const res = await axios.patch(`${API_URL}/checklists/${itemId}/toggle`, {}, getAuthHeaders());
      setChecklists(prev => prev.map(c => c.id === itemId ? { ...c, is_completed: res.data.is_completed } : c));
    } catch (err) { toast.error('Failed to update'); }
    finally { setToggling(null); }
  };

  const done = checklists.filter(c => c.is_completed).length;
  const total = checklists.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const priColors = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e', immediate: '#ef4444', first_week: '#f97316', two_weeks: '#eab308', first_month: '#22c55e' };

  if (loading) {
    return <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-4"><Skeleton className="h-10 w-64 bg-[var(--s)]" /><Skeleton className="h-48 bg-[var(--s)] rounded-2xl" /></div>;
  }

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="beneficiary-checklist"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(245,158,11,0.12), transparent 55%)' }}>
      {/* Back */}
      <button onClick={() => navigate('/beneficiary/dashboard')} className="inline-flex items-center gap-1 text-sm font-bold text-[#60A5FA]">
        <ChevronLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.15))' }}>
          <CheckSquare className="w-5 h-5 text-[#F59E0B]" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Immediate Action Checklist</h1>
          <p className="text-xs text-[var(--t5)]">{total} items · Check off as you complete them</p>
        </div>
      </div>

      {/* Sealed notice */}
      <div className="glass-card p-4 flex items-start gap-3">
        <Lock className="w-5 h-5 text-[var(--gold)] flex-shrink-0 mt-0.5" />
        <p className="text-sm text-[var(--t3)] leading-relaxed">
          This checklist was prepared by your benefactor. Items cannot be added, edited, or removed. You can check items off as you complete them.
        </p>
      </div>

      {/* Progress */}
      <div className="glass-card p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="font-bold text-[var(--t)]">{done} of {total} completed</span>
          <span className="text-2xl font-bold text-[var(--gold)]">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2 bg-[var(--b)]" />
      </div>

      {/* Checklist Items */}
      <div className="space-y-2">
        {checklists.sort((a, b) => a.order - b.order).map(item => {
          const color = priColors[item.category] || priColors.medium;
          return (
            <div
              key={item.id}
              className={`glass-card flex items-start gap-3 p-4 cursor-pointer transition-all ${item.is_completed ? 'opacity-60' : ''}`}
              style={{ borderLeft: `3px solid ${color}` }}
              onClick={() => toggleItem(item.id)}
              data-testid={`ben-checklist-${item.id}`}
            >
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                item.is_completed ? 'bg-[var(--gn)] border-[var(--gn)]' : 'border-[var(--t5)]/30'
              } ${toggling === item.id ? 'animate-pulse' : ''}`}>
                {item.is_completed && <CheckCircle2 className="w-4 h-4 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-bold ${item.is_completed ? 'line-through text-[var(--t4)]' : 'text-[var(--t)]'}`}>
                  {item.title}
                </h3>
                {item.description && <p className="text-xs text-[var(--t5)] mt-0.5">{item.description}</p>}
              </div>
              <span className="text-xs px-2 py-0.5 rounded-md font-bold capitalize flex-shrink-0" style={{ background: color + '15', color, border: `1px solid ${color}33` }}>
                {item.category}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BeneficiaryChecklistPage;
