import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  CheckSquare, CheckCircle2, ChevronLeft, Lock, Phone, Mail, MapPin,
  FileText, Briefcase, Users, Heart, Shield, Building, Stethoscope
} from 'lucide-react';
import { Progress } from '../../components/ui/progress';
import { toast } from 'sonner';
import { Skeleton } from '../../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORIES = {
  legal: { icon: FileText, color: '#3b82f6' },
  financial: { icon: Briefcase, color: '#8b5cf6' },
  insurance: { icon: Shield, color: '#06b6d4' },
  property: { icon: Building, color: '#f59e0b' },
  medical: { icon: Stethoscope, color: '#ef4444' },
  personal: { icon: Heart, color: '#ec4899' },
  government: { icon: Users, color: '#14b8a6' },
  general: { icon: CheckSquare, color: '#6b7280' },
};

const priColors = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };

const BeneficiaryChecklistPage = () => {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);

  useEffect(() => { fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (res.data.is_completed) toast.success('Task completed! Great progress.');
    } catch (err) { toast.error('Failed to update'); }
    finally { setToggling(null); }
  };

  const done = checklists.filter(c => c.is_completed).length;
  const total = checklists.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  if (loading) {
    return <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-4"><Skeleton className="h-10 w-64 bg-[var(--s)]" /><Skeleton className="h-48 bg-[var(--s)] rounded-2xl" /></div>;
  }

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="beneficiary-checklist"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(245,158,11,0.12), transparent 55%)' }}>

      <button onClick={() => navigate('/beneficiary/dashboard')} className="inline-flex items-center gap-1 text-sm font-bold text-[#60A5FA]">
        <ChevronLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.15))' }}>
          <CheckSquare className="w-5 h-5 text-[#F59E0B]" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Immediate Action Checklist</h1>
          <p className="text-xs text-[var(--t5)]">{total} items · Check off as you complete them</p>
        </div>
      </div>

      <div className="glass-card p-4 flex items-start gap-3">
        <Lock className="w-5 h-5 text-[var(--gold)] flex-shrink-0 mt-0.5" />
        <p className="text-sm text-[var(--t3)] leading-relaxed">
          This checklist was prepared by your benefactor to guide you through the next steps. Check items off as you complete them. Tap any phone number to call directly.
        </p>
      </div>

      <div className="glass-card p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="font-bold text-[var(--t)]">{done} of {total} completed</span>
          <span className="text-2xl font-bold text-[var(--gold)]">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2 bg-[var(--b)]" />
      </div>

      <div className="space-y-2">
        {checklists.sort((a, b) => a.order - b.order).map(item => {
          const color = priColors[item.priority] || priColors.medium;
          const catDef = CATEGORIES[item.category] || CATEGORIES.general;
          const CatIcon = catDef.icon;

          return (
            <div
              key={item.id}
              className={`glass-card p-4 transition-all ${item.is_completed ? 'opacity-60' : ''}`}
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <div className="flex items-start gap-3">
                {/* Toggle checkbox */}
                <button
                  onClick={() => toggleItem(item.id)}
                  className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                    item.is_completed ? 'bg-[var(--gn)] border-[var(--gn)]' : 'border-[var(--t5)]/30 hover:border-[var(--gold)]'
                  } ${toggling === item.id ? 'animate-pulse' : ''}`}
                >
                  {item.is_completed && <CheckCircle2 className="w-5 h-5 text-white" />}
                </button>

                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <h3 className={`text-sm font-bold ${item.is_completed ? 'line-through text-[var(--t4)]' : 'text-[var(--t)]'}`}>
                    {item.title}
                  </h3>

                  {/* Description */}
                  {item.description && (
                    <p className="text-xs text-[var(--t5)] mt-1 leading-relaxed">{item.description}</p>
                  )}

                  {/* Contact info — clickable! */}
                  {(item.contact_name || item.contact_phone || item.contact_email || item.contact_address) && (
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {item.contact_name && (
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--t3)] bg-[var(--s)] px-2.5 py-1 rounded-lg">
                          <Users className="w-3 h-3" /> {item.contact_name}
                        </span>
                      )}
                      {item.contact_phone && (
                        <a
                          href={`tel:${item.contact_phone.replace(/[^\d+]/g, '')}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs font-bold bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-lg hover:bg-blue-500/20 transition-colors"
                        >
                          <Phone className="w-3 h-3" /> {item.contact_phone}
                        </a>
                      )}
                      {item.contact_email && (
                        <a
                          href={`mailto:${item.contact_email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs font-bold bg-purple-500/10 text-purple-400 px-2.5 py-1 rounded-lg hover:bg-purple-500/20 transition-colors"
                        >
                          <Mail className="w-3 h-3" /> {item.contact_email}
                        </a>
                      )}
                      {item.contact_address && (
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(item.contact_address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-lg hover:bg-emerald-500/20 transition-colors"
                        >
                          <MapPin className="w-3 h-3" /> {item.contact_address}
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Priority + Category */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-xs px-2 py-0.5 rounded font-bold capitalize" style={{ background: color + '15', color, border: `1px solid ${color}33` }}>
                    {item.priority}
                  </span>
                  <span className="text-xs text-[var(--t5)] capitalize">{item.category}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {total > 0 && done === total && (
        <div className="glass-card p-6 text-center" style={{ borderColor: 'var(--gn)', borderWidth: '1px' }}>
          <CheckCircle2 className="w-10 h-10 text-[var(--gn)] mx-auto mb-2" />
          <h3 className="text-lg font-bold text-[var(--t)]">All tasks completed!</h3>
          <p className="text-sm text-[var(--t4)]">You've completed every item on the checklist. Well done.</p>
        </div>
      )}
    </div>
  );
};

export default BeneficiaryChecklistPage;
