import React, { useState } from 'react';
import { Edit2, Trash2, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { computePassdownScore, passdownColor, passdownLabel } from '../../utils/passdownScore';
import { DavSyncedPill } from './DavSyncedPill';

const DebtTile = ({ debt, categoryLabels, beneficiaries, onEdit, onDelete, onDesignationUpdate, highlightId }) => {
  const [expanded, setExpanded] = useState(false);
  const catLabel = categoryLabels[debt.category] || debt.category;
  const designated = debt.designated_beneficiaries || ['all'];
  const benCount = designated.includes('all') ? beneficiaries.length : designated.length;
  const statusColors = { active: '#10b981', paid_off: '#3b82f6', forbearance: '#f59e0b', collections: '#ef4444' };

  const toggleBeneficiary = (benId) => {
    let newDesignated = [...(debt.designated_beneficiaries || ['all'])];
    let newTiming = { ...(debt.visibility_timing || {}) };
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
    onDesignationUpdate(debt.id, newDesignated, newTiming);
  };

  const toggleTiming = (benId, phase) => {
    const timing = { ...(debt.visibility_timing || {}) };
    const current = timing[benId] || { pre: false, post: true };
    timing[benId] = { ...current, [phase]: !current[phase] };
    onDesignationUpdate(debt.id, debt.designated_beneficiaries || ['all'], timing);
  };

  return (
    <Card
      className="glass-card relative overflow-hidden group transition-all duration-500"
      data-testid={`debt-tile-${debt.id}`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '120px', ...(debt.id === highlightId ? { boxShadow: '0 0 0 2px var(--gold), 0 0 24px rgba(var(--gold-rgb), 0.45)' } : {}) }}
    >
      <CardContent className="p-4">
        {/* ── Collapsed header — always visible: name, balance, status,
             actions. Tap chevron to expand for monthly/rate/term/etc. */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[var(--t)] truncate">{debt.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {debt.outstanding_balance != null && (
                <span className="text-sm font-bold text-[var(--t)]">${debt.outstanding_balance.toLocaleString()}</span>
              )}
              {debt.status && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-bold" style={{
                  background: `${statusColors[debt.status] || '#64748b'}20`,
                  color: statusColors[debt.status] || '#64748b',
                }}>{debt.status.replace(/_/g, ' ')}</span>
              )}
              <DavSyncedPill linked={!!debt.dav_entry_id} davEntryId={debt.dav_entry_id} testId={`debt-dav-pill-${debt.id}`} />
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onEdit(debt); }} className="p-1.5 rounded-lg hover:bg-[var(--s)] transition-colors text-[var(--gold)]" data-testid={`edit-debt-${debt.id}`} aria-label="Edit debt">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(debt.id); }} className="p-1.5 rounded-lg hover:bg-[var(--s)] transition-colors text-[#ef4444]" data-testid={`delete-debt-${debt.id}`} aria-label="Delete debt">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setExpanded(v => !v)} className="p-1.5 rounded-lg hover:bg-[var(--s)] transition-colors text-[var(--t4)]" data-testid={`expand-debt-${debt.id}`} aria-label={expanded ? 'Collapse' : 'Expand'}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* ── Expanded body ── */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-[var(--b)] space-y-3" data-testid={`debt-detail-${debt.id}`}>
            <p className="text-xs text-[var(--t4)]">{catLabel}</p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {debt.monthly_payment != null && (
                <div><span className="text-[var(--t5)]">Monthly: </span><span className="text-[var(--t)] font-medium">${debt.monthly_payment.toLocaleString()}</span></div>
              )}
              {debt.interest_rate != null && (
                <div><span className="text-[var(--t5)]">Rate: </span><span className="text-[var(--t)] font-medium">{debt.interest_rate}%</span></div>
              )}
              {debt.loan_term_months && (
                <div><span className="text-[var(--t5)]">Term: </span><span className="text-[var(--t)] font-medium">{Math.round(debt.loan_term_months / 12)}yr</span></div>
              )}
              {debt.estimated_payoff_date && (
                <div><span className="text-[var(--t5)]">Payoff: </span><span className="text-[var(--t)] font-medium">~{debt.estimated_payoff_date}</span></div>
              )}
            </div>

            {debt.collateral && <p className="text-[11px] text-[var(--t5)]">Secured by: {debt.collateral}</p>}

            {(() => {
              const pdScore = computePassdownScore(debt, 'debt');
              const pdColor = passdownColor(pdScore);
              return (
                <div data-testid={`passdown-bar-${debt.id}`} title={`${passdownLabel(pdScore)} — ${pdScore}% of pass-down details captured`}>
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

            {beneficiaries.length > 0 && (
              <div data-testid={`ben-list-${debt.id}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Users className="w-3 h-3 text-[var(--t4)]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--t5)]">Visible to {benCount} of {beneficiaries.length}</span>
                </div>
                <div className="space-y-1.5">
                  {beneficiaries.map(ben => {
                    const isAll = designated.includes('all');
                    const isOn = isAll || designated.includes(ben.id);
                    const timing = debt.visibility_timing?.[ben.id] || { pre: false, post: true };
                    const initials = `${ben.first_name?.charAt(0) || ''}${ben.last_name?.charAt(0) || ''}`;
                    return (
                      <div key={ben.id} className="rounded-xl overflow-hidden" style={{
                        background: isOn ? 'rgba(var(--gold-rgb), 0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isOn ? 'rgba(var(--gold-rgb), 0.2)' : 'rgba(255,255,255,0.06)'}`,
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
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DebtTile;
