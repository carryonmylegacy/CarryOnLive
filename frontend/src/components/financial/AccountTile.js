import React, { useState } from 'react';
import { Edit2, Trash2, Users, ChevronDown, ChevronUp, Landmark } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { computePassdownScore, passdownColor, passdownLabel } from '../../utils/passdownScore';

const AccountTile = ({ account, categoryLabels, beneficiaries, onEdit, onDelete, onDesignationUpdate }) => {
  const [expanded, setExpanded] = useState(false);
  const catLabel = categoryLabels[account.category] || account.category;
  const designated = account.designated_beneficiaries || ['all'];
  const benCount = designated.includes('all') ? beneficiaries.length : designated.length;
  const statusColors = { active: '#10b981', closed: '#64748b', frozen: '#f59e0b' };

  const toggleBeneficiary = (benId) => {
    let newDesignated = [...(account.designated_beneficiaries || ['all'])];
    let newTiming = { ...(account.visibility_timing || {}) };
    if (newDesignated.includes('all')) {
      newDesignated = beneficiaries.map(b => b.id).filter(id => id !== benId);
      beneficiaries.forEach(b => { if (!newTiming[b.id]) newTiming[b.id] = { pre: false, post: true }; });
    } else if (newDesignated.includes(benId)) {
      newDesignated = newDesignated.filter(id => id !== benId);
    } else {
      newDesignated.push(benId);
    }
    if (newDesignated.length === beneficiaries.length) newDesignated = ['all'];
    if (newDesignated.length === 0) newDesignated = ['all'];
    onDesignationUpdate(account.id, newDesignated, newTiming);
  };

  const toggleTiming = (benId, phase) => {
    const timing = { ...(account.visibility_timing || {}) };
    const current = timing[benId] || { pre: false, post: true };
    timing[benId] = { ...current, [phase]: !current[phase] };
    onDesignationUpdate(account.id, account.designated_beneficiaries || ['all'], timing);
  };

  return (
    <Card className="glass-card relative overflow-hidden group" data-testid={`account-tile-${account.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[var(--t)] truncate mb-0.5">{account.name}</h3>
            <p className="text-xs text-[var(--t5)]">{catLabel}</p>
          </div>
          <div className="text-right flex-shrink-0">
            {account.approximate_balance != null && (
              <div className="text-lg font-bold text-[var(--t)]">${account.approximate_balance.toLocaleString()}</div>
            )}
            <span className="text-[11px] px-2 py-0.5 rounded-full font-bold" style={{
              background: `${statusColors[account.status] || '#64748b'}20`,
              color: statusColors[account.status] || '#64748b',
            }}>{account.status}</span>
          </div>
        </div>

        <div className="text-xs space-y-1 mb-3 py-2" style={{ borderTop: '1px solid var(--b)', borderBottom: '1px solid var(--b)' }}>
          {account.institution_name && (
            <div><span className="text-[var(--t5)]">Institution: </span><span className="text-[var(--t)]">{account.institution_name}</span></div>
          )}
          {account.account_number_masked && (
            <div><span className="text-[var(--t5)]">Account: </span><span className="text-[var(--t)]">···{account.account_number_masked}</span></div>
          )}
          {account.ownership_type && account.ownership_type !== 'individual' && (
            <div><span className="text-[var(--t5)]">Ownership: </span><span className="text-[var(--t)]">{account.ownership_type.replace(/_/g, ' ')}</span></div>
          )}
          {account.joint_owner && (
            <div><span className="text-[var(--t5)]">Joint w/: </span><span className="text-[var(--t)]">{account.joint_owner}</span></div>
          )}
        </div>

        {(() => {
          const pdScore = computePassdownScore(account, 'account');
          const pdColor = passdownColor(pdScore);
          return (
            <div className="mb-3" data-testid={`passdown-bar-${account.id}`} title={`${passdownLabel(pdScore)} — ${pdScore}% of pass-down details captured`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--t5)]">Pass-down readiness</span>
                <span className="text-[11px] font-bold" style={{ color: pdColor }}>{pdScore}%</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full transition-all duration-500" style={{ width: `${pdScore}%`, background: pdColor }} />
              </div>
            </div>
          );
        })()}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button onClick={() => onEdit(account)} className="p-1.5 rounded-lg hover:bg-[var(--s)] transition-colors text-[var(--gold)]" data-testid={`edit-account-${account.id}`} aria-label="Edit account">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(account.id)} className="p-1.5 rounded-lg hover:bg-[var(--s)] transition-colors text-[#ef4444]" data-testid={`delete-account-${account.id}`} aria-label="Delete account">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {beneficiaries.length > 0 && (
            <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Users className="w-3 h-3 text-[var(--t4)]" />
              <span className="text-[var(--t3)]">{benCount} of {beneficiaries.length}</span>
              {expanded ? <ChevronUp className="w-3 h-3 text-[var(--t5)]" /> : <ChevronDown className="w-3 h-3 text-[var(--t5)]" />}
            </button>
          )}
        </div>

        {expanded && beneficiaries.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {beneficiaries.map(ben => {
              const isAll = designated.includes('all');
              const isOn = isAll || designated.includes(ben.id);
              const timing = account.visibility_timing?.[ben.id] || { pre: false, post: true };
              const initials = `${ben.first_name?.charAt(0) || ''}${ben.last_name?.charAt(0) || ''}`;
              return (
                <div key={ben.id} className="rounded-xl overflow-hidden" style={{
                  background: isOn ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isOn ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                  <div className="flex items-center gap-3 px-3 py-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{
                      background: isOn ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(255,255,255,0.08)',
                      color: isOn ? '#080e1a' : '#7B879E',
                    }}>{initials}</div>
                    <div className="flex-1 min-w-0"><div className="text-xs font-semibold truncate text-[var(--t)]">{ben.first_name} {ben.last_name}</div></div>
                    <button onClick={() => toggleBeneficiary(ben.id)} className="w-9 h-5 rounded-full flex-shrink-0 relative transition-all"
                      style={{ background: isOn ? '#d4af37' : 'rgba(255,255,255,0.12)' }}>
                      <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: isOn ? '18px' : '2px' }} />
                    </button>
                  </div>
                  {isOn && (
                    <div className="flex gap-2 px-3 pb-2">
                      <button onClick={() => toggleTiming(ben.id, 'pre')} className="flex-1 py-1 rounded-lg text-[11px] font-bold text-center"
                        style={{ background: timing.pre ? 'rgba(34,201,147,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${timing.pre ? 'rgba(34,201,147,0.4)' : 'rgba(255,255,255,0.08)'}`, color: timing.pre ? '#22C993' : '#525C72' }}>
                        {timing.pre ? '\u2713 ' : ''}Pre-Transition</button>
                      <button onClick={() => toggleTiming(ben.id, 'post')} className="flex-1 py-1 rounded-lg text-[11px] font-bold text-center"
                        style={{ background: timing.post ? 'rgba(59,123,247,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${timing.post ? 'rgba(59,123,247,0.4)' : 'rgba(255,255,255,0.08)'}`, color: timing.post ? '#3B7BF7' : '#525C72' }}>
                        {timing.post ? '\u2713 ' : ''}Post-Transition</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AccountTile;
