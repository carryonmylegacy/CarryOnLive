import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  CheckSquare,
  Square,
  CheckCircle2,
  Clock,
  FileText,
  Users,
  Briefcase,
  Heart
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { toast } from 'sonner';
import { Skeleton } from '../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const categoryIcons = {
  legal: FileText,
  financial: Briefcase,
  family: Users,
  messages: Heart,
};

const ChecklistPage = () => {
  const { getAuthHeaders } = useAuth();
  const [checklists, setChecklists] = useState([]);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const estatesRes = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      if (estatesRes.data.length > 0) {
        setEstate(estatesRes.data[0]);
        const checklistRes = await axios.get(`${API_URL}/checklists/${estatesRes.data[0].id}`, getAuthHeaders());
        setChecklists(checklistRes.data);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load checklist');
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = async (itemId) => {
    setUpdating(itemId);
    try {
      const response = await axios.patch(`${API_URL}/checklists/${itemId}/toggle`, {}, getAuthHeaders());
      setChecklists(checklists.map(item => 
        item.id === itemId ? { ...item, is_completed: response.data.is_completed } : item
      ));
      
      if (response.data.is_completed) {
        toast.success('Task completed! 🎉');
      }
    } catch (error) {
      console.error('Toggle error:', error);
      toast.error('Failed to update task');
    } finally {
      setUpdating(null);
    }
  };

  const completedCount = checklists.filter(c => c.is_completed).length;
  const totalCount = checklists.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Group by category
  const groupedChecklists = checklists.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-white/5" />
        <Skeleton className="h-24 w-full bg-white/5 rounded-2xl" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-16 bg-white/5 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="action-checklist"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(245,158,11,0.15), transparent 55%), radial-gradient(ellipse at bottom right, rgba(217,119,6,0.08), transparent 55%)' }}>
      {/* Header - matching prototype */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.15))' }}>
          <CheckSquare className="w-5 h-5 text-[#F59E0B]" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Immediate Action Checklist
          </h1>
          <p className="text-xs text-[var(--t5)]">
            {totalCount} items · Available to beneficiaries after transition
          </p>
        </div>
      </div>

      {/* Benefactor View info box - from prototype */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.1)' }}>
        <div className="text-sm font-bold text-[#7AABFD] mb-1">Benefactor View</div>
        <p className="text-sm text-[var(--t4)] leading-relaxed">
          You are building this checklist for your beneficiaries. They will be able to check items off after transition. You can edit, delete, or add items at any time.
        </p>
      </div>

      {/* Progress */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-[var(--t)]">Overall Progress</h2>
            <p className="text-sm text-[var(--t4)]">{completedCount} of {totalCount} tasks completed</p>
          </div>
          <div className="text-3xl font-bold text-[var(--gold)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {progressPercent}%
          </div>
        </div>
        <Progress value={progressPercent} className="h-2 bg-[var(--b)]" />
      </div>

      {/* Checklist Items - flat list with priority borders */}
      <div className="space-y-2">
        {checklists.sort((a, b) => a.order - b.order).map((item) => {
          const priColors = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };
          const priColor = priColors[item.category] || priColors.medium;
          
          return (
            <div
              key={item.id}
              className="glass-card flex items-center gap-3 p-4 cursor-pointer transition-all hover:border-[var(--b2)]"
              style={{ borderLeft: `3px solid ${priColor}` }}
              onClick={() => toggleItem(item.id)}
              data-testid={`checklist-item-${item.id}`}
            >
              <div className={`flex-shrink-0 ${updating === item.id ? 'animate-pulse' : ''}`}>
                {item.is_completed ? (
                  <CheckCircle2 className="w-5 h-5 text-[#10b981]" />
                ) : (
                  <CheckSquare className="w-5 h-5 text-[var(--t5)]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-bold ${item.is_completed ? 'text-[var(--t4)] line-through' : 'text-[var(--t)]'}`}>
                  {item.title}
                </h3>
                {item.description && (
                  <p className="text-xs text-[var(--t5)] truncate mt-0.5">{item.description}</p>
                )}
              </div>
              <span className="text-xs px-2 py-0.5 rounded-md font-bold capitalize flex-shrink-0" style={{ 
                background: priColor + '15', 
                color: priColor,
                border: `1px solid ${priColor}33`
              }}>
                {item.category}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChecklistPage;
