import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';

export const TeamActivitySection = ({ teamTasks, opsDash }) => {
  const navigate = useNavigate();
  const operators = teamTasks?.team || opsDash?.operators || [];
  if (operators.length === 0) return null;

  return (
    <div className="glass-card p-4" data-testid="team-activity-section">
      <h3 className="text-sm font-bold text-[var(--t)] mb-3 uppercase tracking-wider flex items-center gap-2">
        <Users className="w-4 h-4 text-[var(--gold)]" />
        Team Activity
        {teamTasks?.total_active_tasks > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(139,92,246,0.15)', color: '#8B5CF6' }}>
            {teamTasks.total_active_tasks} active
          </span>
        )}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {operators.map(op => {
          const tasks = op.tasks || [];
          const hasTasks = tasks.length > 0 || op.tasks_active > 0;
          return (
            <div
              key={op.id}
              className="rounded-xl p-3 transition-all"
              style={{
                background: hasTasks ? 'rgba(212,175,55,0.06)' : 'var(--s)',
                border: `1px solid ${hasTasks ? 'rgba(212,175,55,0.2)' : 'var(--b)'}`,
              }}
              data-testid={`team-op-${op.id}`}
            >
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ background: op.operator_role === 'manager' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)', color: op.operator_role === 'manager' ? '#F59E0B' : '#3B82F6' }}>
                    {(op.name || '??').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg)]`}
                    style={{ background: op.is_online ? '#22C993' : '#64748B' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-[var(--t)] truncate">{op.name}</div>
                  <div className="text-[10px] text-[var(--t5)] capitalize">{op.operator_role} · {op.title || 'Staff'}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  {tasks.length > 0 ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                      style={{ background: 'rgba(139,92,246,0.15)', color: '#8B5CF6' }}>
                      {tasks.length} active
                    </span>
                  ) : op.tasks_active > 0 ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                      style={{ background: 'rgba(139,92,246,0.15)', color: '#8B5CF6' }}>
                      {op.tasks_active} active
                    </span>
                  ) : (
                    <span className="text-[10px] text-[var(--t5)]">{op.actions_24h || 0} actions today</span>
                  )}
                </div>
              </div>
              {tasks.length > 0 && (
                <div className="mt-2 ml-10 space-y-1">
                  {tasks.slice(0, 3).map(task => {
                    const typeColors = {
                      dts: '#3B82F6', tvt: '#F59E0B', milestone: '#8B5CF6',
                      support: '#F43F5E', emergency: '#EF4444', p1: '#DC2626',
                    };
                    return (
                      <div key={task.id}
                        className="flex items-center gap-1.5 text-[9px] px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity"
                        style={{ background: `${typeColors[task.type] || '#6366F1'}10` }}
                        onClick={() => navigate(task.path)}
                        data-testid={`team-task-${task.id}`}>
                        <span className="font-bold" style={{ color: typeColors[task.type] || '#6366F1' }}>
                          {task.type_label}
                        </span>
                        <span className="text-[var(--t5)] truncate flex-1">{task.title}</span>
                        <span className="text-[var(--t5)] capitalize">{task.status}</span>
                      </div>
                    );
                  })}
                  {tasks.length > 3 && (
                    <div className="text-[9px] text-[var(--t5)] pl-1.5">+{tasks.length - 3} more</div>
                  )}
                </div>
              )}
              {tasks.length === 0 && (op.tasks_assigned > 0) && (
                <div className="flex gap-2 mt-2 ml-10">
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.1)', color: '#8B5CF6' }}>
                    {op.tasks_active || 0} in progress
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,201,147,0.1)', color: '#22C993' }}>
                    {op.tasks_completed || 0} done
                  </span>
                  <span className="text-[9px] text-[var(--t5)]">
                    {op.completion_rate || 0}% rate
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
