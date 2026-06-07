import React, { useState } from 'react';
import { Edit2, Trash2, Users, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { computePassdownScore, passdownColor, passdownLabel } from '../../utils/passdownScore';
import { DavSyncedPill } from './DavSyncedPill';

const CATEGORY_COLORS = {
  mortgage_rent: '#ef4444', utilities: '#f59e0b', insurance: '#8b5cf6',
  subscriptions: '#ec4899', credit_card: '#f97316', auto_vehicle: '#06b6d4',
  medical_health: '#10b981', taxes: '#6366f1', hoa_condo: '#14b8a6',
  education_student: '#a855f7', phone_internet: '#3b82f6', childcare: '#f43f5e',
  other: '#64748b',
};

const getCatColor = (cat) => CATEGORY_COLORS[cat] || '#d4af37';

const getDueInfo = (bill) => {
  if (!bill.due_day) return { text: 'No due date', color: '#64748b', urgent: false };
  const today = new Date();
  const day = today.getDate();
  const dueDay = bill.due_day;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const effectiveDue = Math.min(dueDay, daysInMonth);
  let daysUntil = effectiveDue - day;
  if (daysUntil < 0) daysUntil += daysInMonth;
  if (daysUntil === 0) return { text: 'Due TODAY', color: '#ef4444', urgent: true };
  if (daysUntil === 1) return { text: 'Due TOMORROW', color: '#f59e0b', urgent: true };
  if (daysUntil <= 3) return { text: `Due in ${daysUntil} days`, color: '#f59e0b', urgent: true };
  if (daysUntil <= 7) return { text: `Due in ${daysUntil} days`, color: '#3b82f6', urgent: false };
  return { text: `Due in ${daysUntil} days`, color: '#64748b', urgent: false };
};

const BillTile = ({ bill, categoryLabels, beneficiaries, onEdit, onDelete, onDesignationUpdate, highlightId }) => {
  // Master collapsed/expanded state. Collapsed shows only name + amount
  // + due-date + action icons + chevron — the rest of the card body
  // (category, pass-down readiness, auto-pay badge, payment-account
  // hint, beneficiary designation list) is hidden until the user
  // expands. Matches the Go-Bag / FFN / DAV / Messages collapsed-tile
  // pattern.
  const [expanded, setExpanded] = useState(false);
  const catColor = getCatColor(bill.category);
  const due = getDueInfo(bill);
  const catLabel = categoryLabels[bill.category] || bill.category;
  const designated = bill.designated_beneficiaries || ['all'];
  const benCount = designated.includes('all') ? beneficiaries.length : designated.length;

  const toggleBeneficiary = (benId) => {
    let newDesignated = [...(bill.designated_beneficiaries || ['all'])];
    let newTiming = { ...(bill.visibility_timing || {}) };
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
    onDesignationUpdate(bill.id, newDesignated, newTiming);
  };

  const toggleTiming = (benId, phase) => {
    const timing = { ...(bill.visibility_timing || {}) };
    const current = timing[benId] || { pre: false, post: true };
    timing[benId] = { ...current, [phase]: !current[phase] };
    onDesignationUpdate(bill.id, bill.designated_beneficiaries || ['all'], timing);
  };

  return (
    <Card
      className="glass-card relative overflow-hidden group transition-all duration-500"
      data-testid={`bill-tile-${bill.id}`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '120px', ...(bill.id === highlightId ? { boxShadow: '0 0 0 2px var(--gold), 0 0 24px rgba(var(--gold-rgb), 0.45)' } : {}) }}
    >
      {due.urgent && (
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: due.color }} />
      )}
      <CardContent className="p-4">
        {/* ── Collapsed header — always visible ── */}
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: catColor }} />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[var(--t)] truncate">{bill.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {bill.amount != null && (
                <span className="text-sm font-bold text-[var(--t)]">${bill.amount.toLocaleString()}</span>
              )}
              {bill.amount != null && <span className="text-[var(--t5)] text-xs">·</span>}
              <span className="text-xs font-bold" style={{ color: due.color }}>{due.text}</span>
              <DavSyncedPill linked={!!bill.dav_entry_id} davEntryId={bill.dav_entry_id} testId={`bill-dav-pill-${bill.id}`} />
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onEdit(bill); }} className="p-1.5 rounded-lg hover:bg-[var(--s)] transition-colors text-[var(--gold)]" data-testid={`edit-bill-${bill.id}`} aria-label="Edit bill">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(bill.id); }} className="p-1.5 rounded-lg hover:bg-[var(--s)] transition-colors text-[#ef4444]" data-testid={`delete-bill-${bill.id}`} aria-label="Delete bill">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setExpanded(v => !v)} className="p-1.5 rounded-lg hover:bg-[var(--s)] transition-colors text-[var(--t4)]" data-testid={`expand-bill-${bill.id}`} aria-label={expanded ? 'Collapse' : 'Expand'}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* ── Expanded body ── */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-[var(--b)] space-y-3" data-testid={`bill-detail-${bill.id}`}>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[var(--t4)]">{catLabel}</span>
              <span className="text-[var(--t5)]">·</span>
              <span className="text-[var(--t4)]">{bill.due_day ? `${bill.due_day}th monthly` : 'No schedule'}</span>
            </div>

            {/* Pass-down readiness */}
            {(() => {
              const pdScore = computePassdownScore(bill, 'bill');
              const pdColor = passdownColor(pdScore);
              return (
                <div data-testid={`passdown-bar-${bill.id}`} title={`${passdownLabel(pdScore)} — ${pdScore}% of pass-down details captured`}>
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

            {(bill.is_auto_pay || bill.payment_account) && (
              <div className="flex items-center gap-2 flex-wrap">
                {bill.is_auto_pay && (
                  <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-bold" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                    <CheckCircle2 className="w-3 h-3" /> Auto-Pay
                  </span>
                )}
                {bill.payment_account && (
                  <span className="text-[11px] text-[var(--t5)] truncate">via {bill.payment_account}</span>
                )}
              </div>
            )}

            {/* Beneficiary designation */}
            {beneficiaries.length > 0 && (
              <div data-testid={`ben-list-${bill.id}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Users className="w-3 h-3 text-[var(--t4)]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--t5)]">Visible to {benCount} of {beneficiaries.length}</span>
                </div>
                <div className="space-y-1.5">
                  {beneficiaries.map(ben => {
                    const isAll = designated.includes('all');
                    const isOn = isAll || designated.includes(ben.id);
                    const timing = bill.visibility_timing?.[ben.id] || { pre: false, post: true };
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
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate text-[var(--t)]">{ben.first_name} {ben.last_name}</div>
                          </div>
                          <button onClick={() => toggleBeneficiary(ben.id)} className="w-9 h-5 rounded-full flex-shrink-0 relative transition-all"
                            style={{ background: isOn ? '#d4af37' : 'rgba(255,255,255,0.12)' }}
                            data-testid={`ben-switch-${ben.id}-${bill.id}`}>
                            <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: isOn ? '18px' : '2px' }} />
                          </button>
                        </div>
                        {isOn && (
                          <div className="flex gap-2 px-3 pb-2">
                            <button onClick={() => toggleTiming(ben.id, 'pre')} className="flex-1 py-1 rounded-lg text-[11px] font-bold text-center transition-all"
                              style={{
                                background: timing.pre ? 'rgba(34,201,147,0.15)' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${timing.pre ? 'rgba(34,201,147,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                color: timing.pre ? '#22C993' : '#525C72',
                              }}>{timing.pre ? '\u2713 ' : ''}Pre-Transition</button>
                            <button onClick={() => toggleTiming(ben.id, 'post')} className="flex-1 py-1 rounded-lg text-[11px] font-bold text-center transition-all"
                              style={{
                                background: timing.post ? 'rgba(59,123,247,0.15)' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${timing.post ? 'rgba(59,123,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                color: timing.post ? '#3B7BF7' : '#525C72',
                              }}>{timing.post ? '\u2713 ' : ''}Post-Transition</button>
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

export default BillTile;
