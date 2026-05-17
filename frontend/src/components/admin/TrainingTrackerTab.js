import React, { useState, useEffect } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { GraduationCap, CheckCircle, Circle, Loader2, ChevronDown, ChevronRight, Users, Award } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../config';

const CATEGORY_STYLES = {
  general: { color: '#3B82F6', label: 'General' },
  onboarding: { color: '#22C993', label: 'Onboarding' },
  security: { color: '#ef4444', label: 'Security' },
  compliance: { color: '#F59E0B', label: 'Compliance' },
  operations: { color: '#B794F6', label: 'Operations' },
};

export const TrainingTrackerTab = ({ getAuthHeaders }) => {
  const { user } = useAuth();
  const [modules, setModules] = useState([]);
  const [teamProgress, setTeamProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTeam, setShowTeam] = useState(false);
  const [marking, setMarking] = useState(null);

  const isManagerOrAdmin = user?.role === 'admin' || user?.operator_role === 'manager';

  const fetchData = async () => {
    try {
      const [modulesRes, teamRes] = await Promise.all([
        apiClient.get(`${API_URL}/ops/training/modules`, getAuthHeaders()),
        isManagerOrAdmin
          ? apiClient.get(`${API_URL}/ops/training/team-progress`, getAuthHeaders())
          : Promise.resolve({ data: null }),
      ]);
      setModules(modulesRes.data);
      if (teamRes.data) setTeamProgress(teamRes.data);
    } catch {
      toast.error('Failed to load training data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line

  const handleToggle = async (moduleId, isCompleted) => {
    setMarking(moduleId);
    try {
      if (isCompleted) {
        await apiClient.delete(`${API_URL}/ops/training/complete/${moduleId}`, getAuthHeaders());
        toast.success('Unmarked');
      } else {
        await apiClient.post(`${API_URL}/ops/training/complete`, { article_id: moduleId }, getAuthHeaders());
        toast.success('Marked complete');
      }
      fetchData();
    } catch {
      toast.error('Failed to update');
    } finally {
      setMarking(null);
    }
  };

  const completedCount = modules.filter(m => m.completed).length;
  const totalCount = modules.length || 1;
  const pct = Math.round((completedCount / totalCount) * 100);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--t5)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="training-tracker-tab">
      {/* Progress Overview */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-[#d4af37]" />
              <span className="text-sm font-bold text-[var(--t)]">Your Training Progress</span>
            </div>
            <div className="flex items-center gap-2">
              {pct >= 100 && <Award className="w-4 h-4 text-[#d4af37]" />}
              <span className="text-sm font-bold" style={{ color: pct >= 100 ? '#22C993' : pct >= 50 ? '#F59E0B' : '#ef4444' }}>
                {completedCount}/{modules.length} ({pct}%)
              </span>
            </div>
          </div>
          <div className="w-full h-2 rounded-full bg-[var(--s)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: pct >= 100 ? '#22C993' : pct >= 50 ? '#F59E0B' : '#ef4444',
              }}
            />
          </div>
          {pct >= 100 && (
            <p className="text-xs text-[#22C993] mt-2 font-bold">All training modules completed</p>
          )}
        </CardContent>
      </Card>

      {/* Team Progress (Manager/Admin only) */}
      {isManagerOrAdmin && teamProgress && (
        <Card className="glass-card">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowTeam(!showTeam)}>
            <CardTitle className="flex items-center justify-between text-sm text-[var(--t)]">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#3B82F6]" />
                Team Training Compliance
              </div>
              {showTeam ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </CardTitle>
          </CardHeader>
          {showTeam && (
            <CardContent className="space-y-2 pt-0">
              {teamProgress.progress.map(member => (
                <div
                  key={member.user_id}
                  className="flex items-center gap-3 p-2 rounded-lg"
                  style={{ background: 'var(--s)' }}
                  data-testid={`team-member-${member.user_id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--t)] truncate">{member.name}</span>
                      {member.certified && <Award className="w-3.5 h-3.5 text-[#d4af37]" />}
                      <span className="text-[11px] text-[var(--t5)]">{member.role}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--bg)] mt-1">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${member.percentage}%`,
                          background: member.percentage >= 100 ? '#22C993' : member.percentage >= 50 ? '#F59E0B' : '#ef4444',
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[var(--t4)] whitespace-nowrap">
                    {member.completed}/{member.total}
                  </span>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Modules List */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-[var(--t)]">Training Modules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {modules.length === 0 ? (
            <div className="py-8 text-center">
              <GraduationCap className="w-10 h-10 mx-auto text-[var(--t5)] opacity-40 mb-2" />
              <p className="text-sm text-[var(--t5)]">No training modules configured</p>
              <p className="text-xs text-[var(--t5)] opacity-60">Modules from the Knowledge Base will appear here</p>
            </div>
          ) : (
            modules.map(mod => {
              const catStyle = CATEGORY_STYLES[mod.category] || CATEGORY_STYLES.general;
              return (
                <button
                  key={mod.id}
                  onClick={() => handleToggle(mod.id, mod.completed)}
                  disabled={marking === mod.id}
                  className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors hover:bg-[var(--s)]"
                  style={{ background: mod.completed ? `${catStyle.color}08` : 'transparent' }}
                  data-testid={`training-module-${mod.id}`}
                >
                  {marking === mod.id ? (
                    <Loader2 className="w-5 h-5 animate-spin text-[var(--t5)] flex-shrink-0" />
                  ) : mod.completed ? (
                    <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: catStyle.color }} />
                  ) : (
                    <Circle className="w-5 h-5 text-[var(--t5)] flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${mod.completed ? 'text-[var(--t4)] line-through' : 'text-[var(--t)]'}`}>
                      {mod.title}
                    </span>
                    {mod.description && (
                      <p className="text-xs text-[var(--t5)] mt-0.5 truncate">{mod.description}</p>
                    )}
                  </div>
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ color: catStyle.color, background: `${catStyle.color}15` }}
                  >
                    {catStyle.label}
                  </span>
                  {mod.completed && mod.completed_at && (
                    <span className="text-[11px] text-[var(--t5)] flex-shrink-0">
                      {new Date(mod.completed_at).toLocaleDateString()}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
};
