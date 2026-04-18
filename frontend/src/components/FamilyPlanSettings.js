import React, { useState, useEffect } from 'react';
import { Users, Crown, UserPlus, Trash2, Loader2, Star, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from '../utils/toast';
import axios from 'axios';
import { API_URL } from '../config';

function round2(v) { return Math.round(v * 100) / 100; }

const FamilyPlanSettings = ({ getAuthHeaders }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('benefactor');
  const [inviting, setInviting] = useState(false);
  const [plans, setPlans] = useState([]);
  const [savingsPreview, setSavingsPreview] = useState(null);
  const [loadingSavings, setLoadingSavings] = useState(false);
  const [familyDiscounts, setFamilyDiscounts] = useState({ benefactor: 0, beneficiary: 0 });
  const [fpBilling, setFpBilling] = useState('annual');

  const headers = getAuthHeaders()?.headers || {};

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchStatus(); }, []);

  const fetchStatus = async () => {
    try {
      const [statusRes, plansRes] = await Promise.all([
        axios.get(`${API_URL}/family-plan/status`, { headers }),
        axios.get(`${API_URL}/subscriptions/plans`, { headers }),
      ]);
      setStatus(statusRes.data);
      setPlans(plansRes.data.plans || []);
      // Extract family discounts from the subscription settings
      if (plansRes.data.family_benefactor_discount_percent !== undefined) {
        setFamilyDiscounts({
          benefactor: plansRes.data.family_benefactor_discount_percent,
          beneficiary: plansRes.data.family_beneficiary_discount_percent || 0,
        });
      }
      // Auto-load savings preview if no family plan yet
      if (!statusRes.data.family_plan) {
        fetchSavingsPreview();
      }
    } catch (err) { /* silent */ }
    setLoading(false);
  };

  const fetchSavingsPreview = async () => {
    setLoadingSavings(true);
    try {
      const res = await axios.get(`${API_URL}/family-plan/preview-savings`, { headers });
      setSavingsPreview(res.data);
    } catch (err) { /* silent */ }
    setLoadingSavings(false);
  };

  if (loading) return null;
  if (!status?.enabled) return null; // Hidden by admin

  const fp = status.family_plan;
  const isFPO = status.role === 'fpo';
  const isMember = status.role === 'benefactor' || status.role === 'beneficiary';

  const handleCreate = async (planId) => {
    setCreating(true);
    try {
      await axios.post(`${API_URL}/family-plan/create`, { plan_id: planId }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      // toast removed
      fetchStatus();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to create'); }
    setCreating(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      await axios.post(`${API_URL}/family-plan/${fp.id}/add-member`, { email: inviteEmail, role: inviteRole }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      // toast removed
      setInviteEmail('');
      fetchStatus();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to add member'); }
    setInviting(false);
  };

  const handleSetSuccessor = async (userId) => {
    try {
      await axios.put(`${API_URL}/family-plan/${fp.id}/successor`, { successor_user_id: userId }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      // toast removed
      fetchStatus();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this member from the family plan?')) return;
    try {
      await axios.delete(`${API_URL}/family-plan/${fp.id}/member/${userId}`, { headers });
      // toast removed
      fetchStatus();
    } catch (err) { toast.error('Failed to remove member'); }
  };

  const handleDissolve = async () => {
    if (!window.confirm('Dissolve your family plan? All members return to individual pricing.')) return;
    try {
      await axios.delete(`${API_URL}/family-plan/${fp.id}`, { headers });
      // toast removed
      fetchStatus();
    } catch (err) { toast.error('Failed to dissolve'); }
  };

  // No family plan yet — show creation UI with savings preview
  if (!fp) {
    const currentTierPlan = plans.find(p => p.id === status.current_plan_id);
    const sp = savingsPreview;

    return (
      <Card className="glass-card overflow-hidden" data-testid="family-plan-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <Users className="w-5 h-5 text-[var(--gold)]" />
            Family Plan
          </CardTitle>
          <p className="text-xs text-[var(--t4)] mt-1">
            Bundle your household for savings. Benefactors save {familyDiscounts.benefactor}%, beneficiaries save {familyDiscounts.beneficiary}% on all tiers.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Your price with discount */}
            {currentTierPlan && (
              <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.15)' }}>
                <p className="text-xs text-[var(--t4)] mb-1">Your cost as Family Plan Owner</p>
                <div className="flex items-center gap-3">
                  <span className="text-lg line-through text-[var(--t5)]">${currentTierPlan.price?.toFixed(2)}/mo</span>
                  <ArrowRight className="w-4 h-4 text-[var(--gold)]" />
                  <span className="text-2xl font-bold text-[var(--gold)]" style={{ fontFamily: 'var(--sans)' }}>${(currentTierPlan.price * (1 - familyDiscounts.benefactor / 100)).toFixed(2)}/mo</span>
                  {familyDiscounts.benefactor > 0 && (
                    <span className="text-xs font-bold px-2 py-1 rounded-full bg-[#22C993]/15 text-[#22C993]">Save {familyDiscounts.benefactor}%</span>
                  )}
                </div>
              </div>
            )}

            {/* Family Tree Preview */}
            {loadingSavings ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[var(--gold)]" /></div>
            ) : sp && sp.family_tree.length > 1 ? (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--s)' }}>
                  <span className="text-sm font-bold text-[var(--t)]">Your Family ({sp.member_count} members)</span>
                  {sp.total_monthly_savings > 0 && (
                    <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: 'rgba(34,201,147,0.12)', color: '#22C993' }}>
                      Save ${sp.total_monthly_savings.toFixed(2)}/mo total
                    </span>
                  )}
                </div>
                <div className="divide-y divide-[var(--b)]">
                  {sp.family_tree.map((m, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          m.role === 'benefactor' ? 'bg-[var(--gold)]/15 text-[var(--gold)]' : 'bg-[#60A5FA]/15 text-[#60A5FA]'
                        }`}>
                          {m.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--t)] truncate">{m.name}</div>
                          <div className="text-[11px] text-[var(--t5)]">{m.relation}</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-xs line-through text-[var(--t5)]">${m.current_price.toFixed(2)}</span>
                          <span className="text-sm font-bold text-[var(--t)]">${m.family_price.toFixed(2)}</span>
                        </div>
                        {m.savings > 0 && (
                          <div className="text-[11px] text-[#22C993] font-medium">-${m.savings.toFixed(2)}/mo</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Total row */}
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(212,175,55,0.04)' }}>
                  <span className="text-sm font-bold text-[var(--t)]">Monthly Total</span>
                  <div className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-sm line-through text-[var(--t5)]">${sp.total_current_cost.toFixed(2)}</span>
                      <span className="text-lg font-bold text-[var(--gold)]">${sp.total_family_cost.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : sp && sp.family_tree.length <= 1 ? (
              <p className="text-sm text-[var(--t4)] text-center py-2">Add beneficiaries to your estates to see family plan savings.</p>
            ) : null}

            {/* CTA */}
            <button
              onClick={() => handleCreate(currentTierPlan?.id || 'standard')}
              disabled={creating}
              className="w-full p-4 rounded-xl text-center transition-all hover:-translate-y-0.5 font-bold"
              style={{ 
                background: 'linear-gradient(135deg, #d4af37, #b8962e)', 
                color: 'var(--bg2)',
                boxShadow: '0 4px 20px rgba(212,175,55,0.3)',
              }}
              data-testid="activate-family-plan"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
              Activate Family Plan {sp?.total_monthly_savings > 0 ? `· Save $${sp.total_monthly_savings.toFixed(2)}/mo` : ''}
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Has a family plan — show management UI

  const billingMultiplier = fpBilling === 'annual' ? 0.8 : fpBilling === 'quarterly' ? 0.9 : 1;
  const billingLabel = fpBilling === 'annual' ? '/mo (annual)' : fpBilling === 'quarterly' ? '/mo (quarterly)' : '/mo';

  // Compute member prices with billing cycle applied
  const memberPricing = (fp.members || []).map(m => {
    const origMonthly = m.original_price || 0;
    const isBenefactorRole = m.member_type === 'benefactor' || m.role === 'fpo';
    const discPct = isBenefactorRole ? familyDiscounts.benefactor : familyDiscounts.beneficiary;

    // Recalculate family price from current discount % (handles FPO too)
    const discountAmt = round2(origMonthly * discPct / 100);
    const familyMonthly = round2(origMonthly - discountAmt);

    return {
      ...m,
      currentDisplay: round2(origMonthly * billingMultiplier),
      familyDisplay: round2(familyMonthly * billingMultiplier),
      savingsDisplay: round2(origMonthly * billingMultiplier - familyMonthly * billingMultiplier),
      discountPct: discPct,
    };
  });

  const totalCurrent = round2(memberPricing.reduce((s, m) => s + m.currentDisplay, 0));
  const totalFamily = round2(memberPricing.reduce((s, m) => s + m.familyDisplay, 0));
  const totalSavings = round2(totalCurrent - totalFamily);

  return (
    <Card className="glass-card" data-testid="family-plan-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <Users className="w-5 h-5 text-[var(--gold)]" />
            Family Plan {isFPO && <span className="text-xs bg-[var(--gold)]/20 text-[var(--gold)] px-2 py-0.5 rounded-full">FPO</span>}
            {isMember && !isFPO && <span className="text-xs bg-[var(--pr2)]/20 text-[var(--pr2)] px-2 py-0.5 rounded-full">Member</span>}
          </CardTitle>
          {totalSavings > 0 && (
            <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: 'rgba(34,201,147,0.12)', color: '#22C993' }} data-testid="family-total-savings-badge">
              Saving ${totalSavings.toFixed(2)}{billingLabel}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Billing toggle */}
        <div className="flex justify-center" data-testid="family-billing-toggle">
          <div className="inline-flex p-1 rounded-2xl" style={{ background: 'var(--s)', border: '1px solid var(--b)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)' }}>
            {[
              { id: 'annual', label: 'Annual', save: '20%' },
              { id: 'quarterly', label: 'Quarterly', save: '10%' },
              { id: 'monthly', label: 'Monthly', save: null },
            ].map(c => (
              <button
                key={c.id}
                onClick={() => setFpBilling(c.id)}
                className="relative px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300"
                style={{
                  background: fpBilling === c.id
                    ? c.id === 'annual' ? 'linear-gradient(135deg, #22C993, #10b981)' : 'linear-gradient(135deg, #d4af37, #c9a033)'
                    : 'transparent',
                  color: fpBilling === c.id ? '#0F1629' : 'var(--t5)',
                  boxShadow: fpBilling === c.id ? (c.id === 'annual' ? '0 4px 16px rgba(34,201,147,0.35)' : '0 4px 16px rgba(212,175,55,0.35)') : 'none',
                }}
                data-testid={`family-billing-${c.id}`}
              >
                {c.label}
                {c.save && fpBilling !== c.id && (
                  <span className="absolute -top-2 -right-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#22C993', color: '#fff' }}>
                    -{c.save}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Members pricing breakdown */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)' }} data-testid="family-members-pricing">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1 sm:gap-2 px-3 sm:px-4 py-2.5 text-[11px] font-bold text-[var(--t5)] uppercase tracking-wider" style={{ background: 'var(--s)' }}>
            <span>Member</span>
            <span className="text-right w-14 sm:w-20">Current</span>
            <span className="text-right w-14 sm:w-20">Family</span>
            <span className="text-right w-14 sm:w-16">Saved</span>
          </div>

          {/* Member rows */}
          <div className="divide-y divide-[var(--b)]">
            {memberPricing.map(m => {
              const isBen = m.member_type === 'beneficiary';
              return (
                <div key={m.user_id} className="grid grid-cols-[1fr_auto_auto_auto] gap-1 sm:gap-2 items-center px-3 sm:px-4 py-3" data-testid={`family-member-${m.user_id}`}>
                  {/* Member info */}
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      isBen ? 'bg-[#60A5FA]/15 text-[#60A5FA]' : 'bg-[var(--gold)]/15 text-[var(--gold)]'
                    }`}>
                      {m.role === 'fpo' ? <Crown className="w-3.5 h-3.5" /> : (m.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <div className="text-sm font-medium text-[var(--t)] truncate">{m.name || m.email}</div>
                      <div className="text-[11px] text-[var(--t5)] truncate whitespace-nowrap">
                        {m.role === 'fpo' ? 'You (FPO)' : isBen ? 'Beneficiary' : 'Benefactor'}
                        {m.user_id === fp.successor_user_id && ' · Successor'}
                        {m.discountPct > 0 && <span className="text-[#22C993] ml-1">-{m.discountPct}%</span>}
                      </div>
                    </div>
                  </div>

                  {/* Current price */}
                  <span className="text-right w-14 sm:w-20 text-sm text-[var(--t5)] line-through">${m.currentDisplay.toFixed(2)}</span>

                  {/* Family price */}
                  <span className="text-right w-14 sm:w-20 text-sm font-bold" style={{ color: isBen ? '#60A5FA' : 'var(--gold)' }}>
                    ${m.familyDisplay.toFixed(2)}
                  </span>

                  {/* Savings */}
                  <span className="text-right w-14 sm:w-16 text-[11px] font-bold text-[#22C993]">
                    {m.savingsDisplay > 0 ? `-$${m.savingsDisplay.toFixed(2)}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Total row — Family Plan Price vs Without */}
          <div className="px-4 py-5" style={{ background: 'rgba(212,175,55,0.04)', borderTop: '2px solid var(--b)' }} data-testid="family-total-row">
            <div className="grid grid-cols-2 gap-6">
              {/* Family Plan Price column */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#22C993' }}>With Family Plan</p>
                <p className="text-2xl font-bold underline" style={{ color: '#22C993', fontFamily: 'var(--sans)' }} data-testid="family-total-price">
                  ${totalFamily.toFixed(2)}{billingLabel}
                </p>
                {fpBilling !== 'monthly' && (
                  <p className="text-sm font-semibold mt-1" style={{ color: '#22C993' }}>
                    ${(totalFamily * (fpBilling === 'annual' ? 12 : 3)).toFixed(2)} {fpBilling === 'annual' ? 'per year' : 'per quarter'}
                  </p>
                )}
              </div>

              {/* Without Family Plan column */}
              {totalSavings > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#EF4444' }}>Without Family Plan</p>
                  <p className="text-lg italic line-through" style={{ color: '#EF4444' }} data-testid="family-total-original">
                    ${totalCurrent.toFixed(2)}{billingLabel}
                  </p>
                  {fpBilling !== 'monthly' && (
                    <p className="text-sm italic mt-1" style={{ color: '#EF4444' }}>
                      ${(totalCurrent * (fpBilling === 'annual' ? 12 : 3)).toFixed(2)} {fpBilling === 'annual' ? 'per year' : 'per quarter'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Savings summary */}
            {totalSavings > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--b)' }}>
                <p className="text-xs font-bold" style={{ color: '#22C993' }}>
                  You save ${totalSavings.toFixed(2)}{billingLabel} with your Family Plan
                  {fpBilling !== 'monthly' && (
                    <span> &mdash; ${(totalSavings * (fpBilling === 'annual' ? 12 : 3)).toFixed(2)} {fpBilling === 'annual' ? 'per year' : 'per quarter'}</span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Successor info */}
        {fp.successor_name && (
          <div className="rounded-xl p-3" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}>
            <p className="text-xs text-[var(--pr2)]">
              <Star className="w-3 h-3 inline mr-1" />
              <strong>Successor:</strong> {fp.successor_name} — will inherit FPO role upon transition
            </p>
          </div>
        )}

        {/* Add Member (FPO only) */}
        {isFPO && (
          <div className="rounded-xl p-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <h4 className="text-sm font-bold text-[var(--t)] flex items-center gap-2 mb-3">
              <UserPlus className="w-4 h-4 text-[var(--gold)]" /> Add Family Member
            </h4>
            <div className="flex gap-2">
              <Input
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="Member's email"
                className="input-field flex-1 text-sm"
                data-testid="family-invite-email"
              />
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="input-field w-32 text-base"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]" style={{ zIndex: 99999 }}>
                  <SelectItem value="benefactor" className="text-[var(--t2)]">Benefactor</SelectItem>
                  <SelectItem value="beneficiary" className="text-[var(--t2)]">Beneficiary</SelectItem>
                </SelectContent>
              </Select>
              <Button className="gold-button text-sm" onClick={handleInvite} disabled={inviting || !inviteEmail} data-testid="family-invite-btn">
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-[var(--t5)] mt-2">
              Benefactors save {familyDiscounts.benefactor}% on their tier. Beneficiaries save {familyDiscounts.beneficiary}% on their tier.
            </p>
          </div>
        )}

        {/* FPO Actions */}
        {isFPO && (
          <div className="flex gap-2">
            {(fp.members || []).filter(m => m.role !== 'fpo').map(m => (
              <React.Fragment key={`actions-${m.user_id}`}>
                {m.user_id !== fp.successor_user_id && (
                  <button onClick={() => handleSetSuccessor(m.user_id)} className="text-[11px] text-[var(--bl3)] hover:underline px-2 py-1 rounded-lg hover:bg-[var(--bl3)]/5 transition-colors" title="Designate as successor">
                    Set {m.name?.split(' ')[0]} as Successor
                  </button>
                )}
              </React.Fragment>
            )).filter(Boolean)}
          </div>
        )}

        {/* Remove members + Dissolve (FPO only) */}
        {isFPO && (fp.members || []).filter(m => m.role !== 'fpo').length > 0 && (
          <div className="rounded-xl p-3" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <p className="text-[11px] text-[var(--t5)] mb-2">Manage members</p>
            <div className="flex flex-wrap gap-2">
              {(fp.members || []).filter(m => m.role !== 'fpo').map(m => (
                <button key={`rm-${m.user_id}`} onClick={() => handleRemoveMember(m.user_id)} className="flex items-center gap-1.5 text-xs text-[var(--t4)] hover:text-[var(--rd2)] px-2.5 py-1.5 rounded-lg border border-[var(--b)] hover:border-[var(--rd2)]/30 transition-colors" data-testid={`remove-member-${m.user_id}`}>
                  <Trash2 className="w-3 h-3" /> {m.name?.split(' ')[0] || m.email}
                </button>
              ))}
            </div>
          </div>
        )}

        {isFPO && (
          <Button variant="outline" className="w-full border-[var(--rd2)]/30 text-[var(--rd2)] text-sm" onClick={handleDissolve} data-testid="dissolve-family-plan">
            Dissolve Family Plan
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default FamilyPlanSettings;
