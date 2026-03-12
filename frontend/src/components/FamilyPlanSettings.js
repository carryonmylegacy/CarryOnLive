import React, { useState, useEffect } from 'react';
import { Users, Crown, UserPlus, Trash2, Loader2, Star, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from '../utils/toast';
import axios from 'axios';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
            Bundle your household for savings. Benefactors save $1/mo, all beneficiaries pay a flat $3.49/mo.
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
                  <span className="text-2xl font-bold text-[var(--gold)]" style={{ fontFamily: 'Outfit, sans-serif' }}>${(currentTierPlan.price - 1).toFixed(2)}/mo</span>
                  <span className="text-xs font-bold px-2 py-1 rounded-full bg-[#22C993]/15 text-[#22C993]">Save $1/mo</span>
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
                          <div className="text-[10px] text-[var(--t5)]">{m.relation}</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-xs line-through text-[var(--t5)]">${m.current_price.toFixed(2)}</span>
                          <span className="text-sm font-bold text-[var(--t)]">${m.family_price.toFixed(2)}</span>
                        </div>
                        {m.savings > 0 && (
                          <div className="text-[10px] text-[#22C993] font-medium">-${m.savings.toFixed(2)}/mo</div>
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
                color: '#0F1629',
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
  return (
    <Card className="glass-card" data-testid="family-plan-card">
      <CardHeader>
        <CardTitle className="text-[var(--t)] flex items-center gap-2">
          <Users className="w-5 h-5 text-[var(--gold)]" />
          Family Plan {isFPO && <span className="text-xs bg-[var(--gold)]/20 text-[var(--gold)] px-2 py-0.5 rounded-full">FPO</span>}
          {isMember && <span className="text-xs bg-[var(--pr2)]/20 text-[var(--pr2)] px-2 py-0.5 rounded-full">Member</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Members List */}
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-[var(--t4)]">Members ({fp.members?.length || 0})</h4>
          {(fp.members || []).map(m => (
            <div key={m.user_id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--s)]">
              <div className="flex items-center gap-3">
                {m.role === 'fpo' && <Crown className="w-4 h-4 text-[var(--gold)]" />}
                {m.role !== 'fpo' && m.user_id === fp.successor_user_id && <Star className="w-4 h-4 text-[var(--pr2)]" />}
                <div>
                  <span className="font-bold text-[var(--t)] text-sm">{m.name || m.email}</span>
                  <div className="text-xs text-[var(--t5)]">
                    {m.role === 'fpo' ? 'Family Plan Owner' : m.member_type === 'benefactor' ? 'Benefactor' : 'Beneficiary'}
                    {m.user_id === fp.successor_user_id && ' · Successor'}
                    {m.floor_exempt && ' · Floor rate'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--gold)] font-bold text-sm">${m.family_price?.toFixed(2)}/mo</span>
                {m.discount > 0 && <span className="text-[10px] text-[var(--gn2)]">-${m.discount.toFixed(2)}</span>}
                {isFPO && m.role !== 'fpo' && (
                  <div className="flex gap-1 ml-2">
                    {m.member_type !== 'beneficiary' || true ? (
                      <button onClick={() => handleSetSuccessor(m.user_id)} className="text-xs text-[var(--bl3)] hover:underline" title="Designate as successor">
                        {m.user_id === fp.successor_user_id ? '' : 'Successor'}
                      </button>
                    ) : null}
                    <button onClick={() => handleRemoveMember(m.user_id)} className="p-1 text-[var(--t5)] hover:text-[var(--rd2)]">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
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
                <SelectTrigger className="input-field w-32 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]" style={{ zIndex: 99999 }}>
                  <SelectItem value="benefactor" className="text-[var(--t2)]">Benefactor</SelectItem>
                  <SelectItem value="beneficiary" className="text-[var(--t2)]">Beneficiary</SelectItem>
                </SelectContent>
              </Select>
              <Button className="gold-button text-sm" onClick={handleInvite} disabled={inviting || !inviteEmail} data-testid="family-invite-btn">
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-[var(--t5)] mt-2">
              Benefactors save $1/mo (except floor-rate tiers). Beneficiaries pay flat $3.49/mo.
            </p>
          </div>
        )}

        {/* Dissolve (FPO only) */}
        {isFPO && (
          <Button variant="outline" className="w-full border-[var(--rd2)]/30 text-[var(--rd2)] text-sm" onClick={handleDissolve}>
            Dissolve Family Plan
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default FamilyPlanSettings;
