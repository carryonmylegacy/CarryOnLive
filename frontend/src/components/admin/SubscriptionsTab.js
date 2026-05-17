import React, { useState, useEffect } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { ToggleLeft, Users, DollarSign, Loader2, Search, Plus, Trash2, Copy, Check, Briefcase, RotateCcw, Percent, Crown, Pencil, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';
import { FeatureGatesCard } from './FeatureGatesCard';

export const SubscriptionsTab = ({ getAuthHeaders, users, operatorMode = false }) => {
  const [settings, setSettings] = useState(null);
  const [userSubs, setUserSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState(null);
  const [newPrice, setNewPrice] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [discountInput, setDiscountInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [resettingUser, setResettingUser] = useState(null);
  // B2B codes
  const [b2bCodes, setB2bCodes] = useState([]);
  const [showNewCode, setShowNewCode] = useState(false);
  const [newCodeForm, setNewCodeForm] = useState({ code: '', partner_name: '', discount_percent: 100, max_uses: 0 });
  const [copiedCode, setCopiedCode] = useState(null);
  // Family discounts
  const [editingFamilyDiscount, setEditingFamilyDiscount] = useState(null);
  const [familyDiscountValue, setFamilyDiscountValue] = useState('');

  const headers = getAuthHeaders()?.headers || {};

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const [settingsRes, usersRes, codesRes] = await Promise.all([
        apiClient.get(`${API_URL}/admin/subscription-settings`, { headers }),
        apiClient.get(`${API_URL}/admin/user-subscriptions`, { headers }),
        apiClient.get(`${API_URL}/admin/b2b-codes`, { headers }).catch(() => ({ data: [] })),
      ]);
      setSettings(settingsRes.data);
      setUserSubs(usersRes.data);
      setB2bCodes(codesRes.data || []);
    } catch (err) { toast.error('Failed to load subscription data'); }
    setLoading(false);
  };

  const toggleBeta = async () => {
    try {
      await apiClient.put(`${API_URL}/admin/subscription-settings`, { beta_mode: !settings.beta_mode }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      // toast removed
      fetchData();
    } catch (err) { toast.error('Failed to update'); }
  };

  const updatePrice = async (planId) => {
    try {
      const formData = new FormData();
      formData.append('price', parseFloat(newPrice));
      await apiClient.put(`${API_URL}/admin/plans/${planId}/price`, formData, { headers });
      // toast removed
      setEditingPrice(null);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update price'); }
  };

  const updateUserOverride = async (userId, data) => {
    try {
      await apiClient.put(`${API_URL}/admin/user-subscription/${userId}`, data, { headers: { ...headers, 'Content-Type': 'application/json' } });
      fetchData();
    } catch (err) { toast.error('Failed to update'); }
  };

  const createB2bCode = async () => {
    if (!newCodeForm.code.trim()) { toast.error('Code is required'); return; }
    try {
      await apiClient.post(`${API_URL}/admin/b2b-codes`, newCodeForm, { headers: { ...headers, 'Content-Type': 'application/json' } });
      setShowNewCode(false);
      setNewCodeForm({ code: '', partner_name: '', discount_percent: 100, max_uses: 0 });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to create code'); }
  };

  const toggleB2bCode = async (codeId, active) => {
    try {
      await apiClient.put(`${API_URL}/admin/b2b-codes/${codeId}`, { active }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      fetchData();
    } catch (err) { toast.error('Failed to update'); }
  };

  const deleteB2bCode = async (codeId) => {
    if (!window.confirm('Delete this B2B code?')) return;
    try {
      await apiClient.delete(`${API_URL}/admin/b2b-codes/${codeId}`, { headers });
      fetchData();
    } catch (err) { toast.error('Failed to delete'); }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const updateFamilyDiscount = async (field) => {
    try {
      const val = parseFloat(familyDiscountValue);
      if (isNaN(val) || val < 0 || val > 100) { toast.error('Discount must be 0-100%'); return; }
      await apiClient.put(`${API_URL}/admin/family-discount-settings`, { [field]: val }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      setEditingFamilyDiscount(null);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update'); }
  };

  const resetSubscription = async (userId, userEmail, expireTrial = false) => {
    const modeLabel = expireTrial
      ? 'RESET + EXPIRE TRIAL (for App Store Review)'
      : 'RESET to Fresh Trial';
    const extraNote = expireTrial
      ? '\n\nTrial will be set to EXPIRED — user will see the paywall/IAP flow immediately.'
      : '\n\nUser will get a fresh trial at the current global duration.';
    if (!window.confirm(`${modeLabel} for ${userEmail}?\n\nThis will:\n- Delete all subscription records\n- Delete Apple IAP transactions\n- Delete payment history\n- Remove free access / discounts\n- Clear beta acceptance${extraNote}\n\nThis action cannot be undone.`)) return;
    setResettingUser(userId);
    try {
      const res = await apiClient.post(`${API_URL}/admin/reset-subscription/${userId}`, 
        { expire_trial: expireTrial }, 
        { headers: { ...headers, 'Content-Type': 'application/json' } });
      toast.success(res.data.message || 'Subscription reset');
      setEditingUser(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reset subscription');
    }
    setResettingUser(null);
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>;

  return (
    <div className="space-y-6" data-testid="subscriptions-admin">
      {/* Beta Mode Toggle — Founder only */}
      {!operatorMode && (
      <Card className="glass-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2">
                <ToggleLeft className="w-5 h-5 text-[var(--gold)]" />
                Beta Mode
              </h3>
              <p className="text-sm text-[var(--t4)] mt-1">
                {settings?.beta_mode ? 'All features are FREE for all users. Turn off to require subscriptions.' : 'Subscriptions are ACTIVE. Users must pay to access the platform.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-bold ${settings?.beta_mode ? 'text-[var(--gn2)]' : 'text-[var(--rd2)]'}`}>
                {settings?.beta_mode ? 'ON (Free)' : 'OFF (Paid)'}
              </span>
              <Switch checked={settings?.beta_mode || false} onCheckedChange={toggleBeta} data-testid="beta-mode-toggle" />
            </div>
          </div>
          {/* Stats */}
          <div className="flex gap-3 mt-4 text-sm flex-wrap">
            <div className="px-3 py-1.5 rounded-lg bg-[var(--s)]">
              <span className="text-[var(--t4)]">Active Subs: </span>
              <span className="font-bold text-[var(--t)]">{settings?.stats?.active_subscriptions || 0}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-[var(--s)]">
              <span className="text-[var(--t4)]">Free Access: </span>
              <span className="font-bold text-[var(--t)]">{settings?.stats?.free_access_users || 0}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-[var(--s)]">
              <span className="text-[var(--t4)]">Discounted: </span>
              <span className="font-bold text-[var(--t)]">{settings?.stats?.discounted_users || 0}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Family Plan Toggle — Founder only */}
      {!operatorMode && (
      <Card className="glass-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2">
                <Users className="w-5 h-5 text-[var(--gold)]" />
                Family Plan
              </h3>
              <p className="text-sm text-[var(--t4)] mt-1">
                {settings?.family_plan_enabled
                  ? `Family plans are visible to users. Benefactors get ${settings?.family_benefactor_discount_percent || 0}% discount, beneficiaries get ${settings?.family_beneficiary_discount_percent || 0}% discount.`
                  : 'Family plans are hidden from all users. Toggle ON when ready to launch (recommended L+3 to L+4 months).'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-bold ${settings?.family_plan_enabled ? 'text-[var(--gn2)]' : 'text-[var(--t5)]'}`}>
                {settings?.family_plan_enabled ? 'Visible' : 'Hidden'}
              </span>
              <Switch
                checked={settings?.family_plan_enabled || false}
                onCheckedChange={async () => {
                  try {
                    await apiClient.put(`${API_URL}/admin/family-plan-settings`, {}, { headers });
                    fetchData();
                  } catch (err) { toast.error('Failed to update'); }
                }}
                data-testid="family-plan-toggle"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Family Discount Pricing — Founder only */}
      {!operatorMode && (
      <Card className="glass-card">
        <CardContent className="p-5">
          <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2 mb-2">
            <Percent className="w-5 h-5 text-[var(--gold)]" />
            Family Discount Pricing
          </h3>
          <p className="text-xs text-[var(--t5)] mb-4">Percentage discounts applied to all tiers for family plan members.</p>
          <div className="space-y-2">
            {/* Benefactor discount */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--s)]" data-testid="family-benefactor-discount-row">
              <div>
                <span className="font-bold text-[var(--t)] text-sm">Benefactor Discount</span>
                <span className="text-xs text-[var(--t5)] ml-2">(per benefactor in family)</span>
              </div>
              <div className="flex items-center gap-3">
                {editingFamilyDiscount === 'benefactor' ? (
                  <div className="flex items-center gap-2">
                    <Input type="number" step="0.1" min="0" max="100" value={familyDiscountValue} onChange={e => setFamilyDiscountValue(e.target.value)} className="input-field w-20 text-base" autoFocus data-testid="family-benefactor-discount-input" />
                    <span className="text-[var(--t4)]">%</span>
                    <Button size="sm" className="gold-button text-xs" onClick={() => updateFamilyDiscount('family_benefactor_discount_percent')} data-testid="family-benefactor-discount-save">Save</Button>
                    <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={() => setEditingFamilyDiscount(null)}>Cancel</Button>
                  </div>
                ) : (
                  <>
                    <span className="text-[var(--gold)] font-bold text-lg">{settings?.family_benefactor_discount_percent ?? 0}%</span>
                    <Button size="sm" variant="outline" className="text-xs border-[var(--b)] text-[var(--t4)]" onClick={() => { setEditingFamilyDiscount('benefactor'); setFamilyDiscountValue((settings?.family_benefactor_discount_percent ?? 0).toString()); }} data-testid="family-benefactor-discount-edit">Edit</Button>
                  </>
                )}
              </div>
            </div>
            {/* Beneficiary discount */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--s)]" data-testid="family-beneficiary-discount-row">
              <div>
                <span className="font-bold text-[var(--t)] text-sm">Beneficiary Discount</span>
                <span className="text-xs text-[var(--t5)] ml-2">(per beneficiary in family)</span>
              </div>
              <div className="flex items-center gap-3">
                {editingFamilyDiscount === 'beneficiary' ? (
                  <div className="flex items-center gap-2">
                    <Input type="number" step="0.1" min="0" max="100" value={familyDiscountValue} onChange={e => setFamilyDiscountValue(e.target.value)} className="input-field w-20 text-base" autoFocus data-testid="family-beneficiary-discount-input" />
                    <span className="text-[var(--t4)]">%</span>
                    <Button size="sm" className="gold-button text-xs" onClick={() => updateFamilyDiscount('family_beneficiary_discount_percent')} data-testid="family-beneficiary-discount-save">Save</Button>
                    <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={() => setEditingFamilyDiscount(null)}>Cancel</Button>
                  </div>
                ) : (
                  <>
                    <span className="text-[#60A5FA] font-bold text-lg">{settings?.family_beneficiary_discount_percent ?? 0}%</span>
                    <Button size="sm" variant="outline" className="text-xs border-[var(--b)] text-[var(--t4)]" onClick={() => { setEditingFamilyDiscount('beneficiary'); setFamilyDiscountValue((settings?.family_beneficiary_discount_percent ?? 0).toString()); }} data-testid="family-beneficiary-discount-edit">Edit</Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Benefactor Pricing — Founder only */}
      {!operatorMode && (
      <Card className="glass-card">
        <CardContent className="p-5">
          <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-[var(--gold)]" />
            Benefactor Plan Pricing
          </h3>
          <div className="space-y-2">
            {(settings?.plans || []).map(plan => (
              <div key={plan.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--s)]" data-testid={`plan-row-${plan.id}`}>
                <div>
                  <span className="font-bold text-[var(--t)] text-sm">{plan.name}</span>
                  {plan.note && <span className="text-xs text-[var(--t5)] ml-2">({plan.note})</span>}
                </div>
                <div className="flex items-center gap-3">
                  {editingPrice === plan.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--t4)]">$</span>
                      <Input type="number" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} className="input-field w-20 text-base" autoFocus />
                      <Button size="sm" className="gold-button text-xs" onClick={() => updatePrice(plan.id)}>Save</Button>
                      <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={() => setEditingPrice(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      <span className="text-[var(--gold)] font-bold text-lg">${plan.price?.toFixed(2)}</span>
                      <span className="text-xs text-[var(--t5)]">/mo</span>
                      <Button size="sm" variant="outline" className="text-xs border-[var(--b)] text-[var(--t4)]" onClick={() => { setEditingPrice(plan.id); setNewPrice(plan.price?.toString() || ''); }}>Edit</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Beneficiary Pricing — Founder only */}
      {!operatorMode && (
      <Card className="glass-card">
        <CardContent className="p-5">
          <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-[#60A5FA]" />
            Beneficiary Plan Pricing
          </h3>
          <div className="space-y-2">
            {(settings?.beneficiary_plans || []).map(plan => (
              <div key={plan.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--s)]" data-testid={`ben-plan-row-${plan.id}`}>
                <div>
                  <span className="font-bold text-[var(--t)] text-sm">{plan.name}</span>
                  {plan.note && <span className="text-xs text-[var(--t5)] ml-2">({plan.note})</span>}
                </div>
                <div className="flex items-center gap-3">
                  {editingPrice === `ben_${plan.id}` ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--t4)]">$</span>
                      <Input type="number" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} className="input-field w-20 text-base" autoFocus />
                      <Button size="sm" className="gold-button text-xs" onClick={async () => {
                        try {
                          const formData = new FormData();
                          formData.append('price', parseFloat(newPrice));
                          await apiClient.put(`${API_URL}/admin/beneficiary-plans/${plan.id}/price`, formData, { headers });
                          setEditingPrice(null);
                          fetchData();
                        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update'); }
                      }}>Save</Button>
                      <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={() => setEditingPrice(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      <span className="text-[#60A5FA] font-bold text-lg">${plan.price?.toFixed(2)}</span>
                      <span className="text-xs text-[var(--t5)]">/mo</span>
                      <Button size="sm" variant="outline" className="text-xs border-[var(--b)] text-[var(--t4)]" onClick={() => { setEditingPrice(`ben_${plan.id}`); setNewPrice(plan.price?.toString() || ''); }}>Edit</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Feature Gates — Founder only */}
      {!operatorMode && (
        <FeatureGatesCard getAuthHeaders={getAuthHeaders} />
      )}

      {/* Per-User Overrides */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-[var(--gold)]" />
            User Subscription Overrides
          </h3>
          <p className="text-xs text-[var(--t5)] mb-3">Search for a user to manage their subscription discount or free access.</p>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded border-2 border-[#F5A623]" />
              <span className="text-[11px] text-[var(--t4)] font-medium">Trial / Grace Period</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded border-2 border-[#EF4444]" />
              <span className="text-[11px] text-[var(--t4)] font-medium">Dormant</span>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <Search className="w-4 h-4 text-[var(--t5)]" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name or email..." className="flex-1 bg-transparent border-none text-[var(--t)] text-base outline-none placeholder:text-[var(--t5)]" data-testid="subscriptions-user-search" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[var(--t5)] hover:text-[var(--t)]">
                <span className="text-xs">&times;</span>
              </button>
            )}
          </div>
          <div className="space-y-2">
            {!searchQuery ? (
              <p className="text-sm text-[var(--t5)] text-center py-6">Type a name or email above to find a user</p>
            ) : (
              userSubs.filter(u => u.role !== 'admin').filter(u => {
                const q = searchQuery.toLowerCase();
                return (u.name || '').toLowerCase().includes(q) ||
                  (u.email || '').toLowerCase().includes(q);
              }).length === 0 ? (
                <p className="text-sm text-[var(--t5)] text-center py-4">No users found matching "{searchQuery}"</p>
              ) : (
                userSubs.filter(u => u.role !== 'admin').filter(u => {
                  const q = searchQuery.toLowerCase();
                  return (u.name || '').toLowerCase().includes(q) ||
                    (u.email || '').toLowerCase().includes(q);
                }).map(u => {
              const override = u.override || {};
              const sub = u.subscription;
              return (
                <div key={u.id} className="p-3 rounded-xl" style={{
                  background: 'var(--s)',
                  ...(u.billing_status === 'dormant' ? { border: '2px solid #EF4444', boxShadow: '0 0 8px rgba(239,68,68,0.2)' } :
                    (u.billing_status === 'grace_period' || u.billing_status === 'trial') ? { border: '2px solid #F5A623', boxShadow: '0 0 8px rgba(245,166,35,0.2)' } :
                    { border: '1px solid transparent' }),
                }} data-testid={`user-sub-${u.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[var(--t)] text-sm">{u.name || u.email}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--b)] text-[var(--t4)]">{u.role}</span>
                        {u.billing_status === 'grace_period' && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: 'rgba(245,166,35,0.15)', color: '#F5A623' }}>
                            GRACE {u.grace_days_remaining != null ? `${u.grace_days_remaining}d` : ''}
                          </span>
                        )}
                        {u.billing_status === 'trial' && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: 'rgba(245,166,35,0.15)', color: '#F5A623' }}>
                            TRIAL {u.trial_days_remaining != null ? `${u.trial_days_remaining}d` : ''}
                          </span>
                        )}
                        {u.billing_status === 'dormant' && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>
                            DORMANT
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--t5)] truncate mt-0.5">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {sub && <span className="text-xs text-[var(--gn2)] font-bold">{sub.plan_name}</span>}
                      {override.free_access && <span className="text-[11px] bg-[var(--gn2)]/10 text-[var(--gn2)] px-2 py-0.5 rounded-full font-bold">Free</span>}
                      {override.custom_discount > 0 && <span className="text-[11px] bg-[var(--yw)]/10 text-[var(--yw)] px-2 py-0.5 rounded-full font-bold">{override.custom_discount}%</span>}
                    </div>
                  </div>
                  {editingUser === u.id ? (
                    <div className="mt-3 flex items-center gap-3 pt-3 flex-wrap" style={{ borderTop: '1px solid var(--b)' }}>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-[var(--t4)]">Free Access</Label>
                        <Switch
                          checked={override.free_access || false}
                          onCheckedChange={(v) => updateUserOverride(u.id, { free_access: v })}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-[var(--t4)]">Discount %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={discountInput || override.custom_discount || ''}
                          onChange={e => setDiscountInput(e.target.value)}
                          className="input-field w-16 text-sm"
                        />
                        <Button size="sm" className="text-xs gold-button" onClick={() => { updateUserOverride(u.id, { custom_discount: parseFloat(discountInput || '0') }); setEditingUser(null); }}>
                          Apply
                        </Button>
                      </div>
                      <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={() => setEditingUser(null)}>Done</Button>
                      {!operatorMode && (
                        <div className="flex items-center gap-2 ml-auto">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs border-[#F59E0B]/40 text-[#F59E0B] hover:bg-[#F59E0B]/10"
                            onClick={() => resetSubscription(u.id, u.email, false)}
                            disabled={resettingUser === u.id}
                            data-testid={`reset-sub-trial-${u.id}`}
                          >
                            {resettingUser === u.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                            Reset (Fresh Trial)
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs border-[#EF4444]/40 text-[#EF4444] hover:bg-[#EF4444]/10"
                            onClick={() => resetSubscription(u.id, u.email, true)}
                            disabled={resettingUser === u.id}
                            data-testid={`reset-sub-expired-${u.id}`}
                          >
                            {resettingUser === u.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                            Reset (Expired Trial)
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button onClick={() => { setEditingUser(u.id); setDiscountInput(override.custom_discount?.toString() || ''); }} className="text-xs text-[var(--bl3)] mt-1 font-bold">
                      Manage
                    </button>
                  )}
                </div>
              );
            }))
            )}
          </div>
        </CardContent>
      </Card>

      {/* B2B / Enterprise partnerships moved out of Subs. The
          legacy `b2b_codes` collection is still readable for
          backwards-compat, but new partnerships live in the
          Partners tab adjacent to this one (matrix of company ×
          features, with white-label landing pages and per-partner
          feature gates). This card just signposts the new home so
          founders / scoped admins don't go looking here for it. */}
      <Card className="glass-card" style={{ borderColor: 'rgba(139,92,246,0.25)' }}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)' }}>
                <Briefcase className="w-5 h-5 text-[#8B5CF6]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--t)]">B2B Partnerships</h3>
                <p className="text-sm text-[var(--t4)] mt-0.5">
                  White-label partner codes, custom feature tiers, and co-branded landing pages now live in their own tab.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="gold-button text-xs"
              onClick={() => { window.location.href = '/admin/partners'; }}
              data-testid="open-partners-tab-btn"
            >
              Open Partners Tab <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Founders Circle Lifetime Pricing — Founder only */}
      {!operatorMode && <FCPricingCard headers={headers} />}
    </div>
  );
};

function FCPricingCard({ headers }) {
  const [plans, setPlans] = useState([]);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingTier, setEditingTier] = useState(null);
  const [editPrice, setEditPrice] = useState('');
  const [fcSubs, setFcSubs] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [plansRes, subsRes] = await Promise.all([
          apiClient.get(`${API_URL}/founders-circle/plans`),
          apiClient.get(`${API_URL}/admin/founders-circle/subscriptions`, { headers }),
        ]);
        setActive(plansRes.data.active);
        setPlans(plansRes.data.plans || []);
        setFcSubs(subsRes.data.subscriptions || []);
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const savePrice = async (tier) => {
    const price = parseInt(editPrice);
    if (isNaN(price) || price < 0) { toast.error('Invalid price'); return; }
    try {
      await apiClient.put(`${API_URL}/admin/founders-circle/pricing`, { tier, lifetime_price: price }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      toast.success('Lifetime price updated');
      setEditingTier(null);
      // Refresh plans
      const res = await apiClient.get(`${API_URL}/founders-circle/plans`);
      setPlans(res.data.plans || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Update failed');
    }
  };

  if (loading) return null;

  const activeSubs = fcSubs.filter(s => s.status === 'active' || s.status === 'completed');
  const pendingSubs = fcSubs.filter(s => (s?.status || '').toLowerCase() === 'pending');

  const handleClearPending = async () => {
    if (!window.confirm(`Clear ${pendingSubs.length} pending Founders Circle row${pendingSubs.length === 1 ? '' : 's'}?\n\nOnly rows older than 1 hour are deleted, so no in-flight Stripe checkout will be interrupted.`)) {
      return;
    }
    try {
      const res = await apiClient.delete(`${API_URL}/admin/founders-circle/subscriptions/pending`, { headers });
      const deleted = res?.data?.deleted ?? 0;
      toast.success(`Cleared ${deleted} pending row${deleted === 1 ? '' : 's'}.`);
      // Refresh in-place
      const refreshed = await apiClient.get(`${API_URL}/admin/founders-circle/subscriptions`, { headers });
      setFcSubs(refreshed.data.subscriptions || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to clear pending rows');
    }
  };

  return (
    <Card className="glass-card" data-testid="fc-pricing-admin">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2">
              <Crown className="w-5 h-5 text-[var(--gold)]" />
              Founders Circle — Lifetime Pricing
            </h3>
            <p className="text-sm text-[var(--t4)] mt-1">
              {active ? 'Campaign is ACTIVE' : 'Campaign is OFF'} · {activeSubs.length} active member{activeSubs.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pendingSubs.length > 0 && (
              <button
                onClick={handleClearPending}
                className="text-xs font-bold px-3 py-1.5 rounded-full transition-transform hover:-translate-y-0.5 active:translate-y-0"
                style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--rd)', border: '1px solid rgba(239,68,68,0.3)' }}
                title="Delete pending Founders Circle rows older than 1 hour. Click-throughs to Stripe that never converted to a paid subscription. In-flight checkouts (created in the last hour) are preserved."
                data-testid="fc-clear-pending-btn"
              >
                Clear Pending ({pendingSubs.length})
              </button>
            )}
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${active ? 'text-[#10b981] bg-[rgba(16,185,129,0.1)]' : 'text-[var(--rd)] bg-[rgba(239,68,68,0.1)]'}`}>
              {active ? 'LIVE' : 'OFF'}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          {plans.map(plan => (
            <div key={plan.tier} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--s)' }}>
              <div>
                <span className="text-sm font-semibold text-[var(--t)]">{plan.name}</span>
                <div className="text-xs text-[var(--t4)] mt-0.5">
                  1-pay: ${plan.installments['1']?.total} · 3-pay: 3x${plan.installments['3']?.per_payment} · 6-pay: 6x${plan.installments['6']?.per_payment} · 12-pay: 12x${plan.installments['12']?.per_payment}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {editingTier === plan.tier ? (
                  <>
                    <span className="text-sm text-[var(--t4)]">$</span>
                    <input
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      className="w-20 px-2 py-1 rounded text-sm text-right"
                      style={{ background: 'var(--bg3)', border: '1px solid var(--b2)', color: 'var(--t)' }}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') savePrice(plan.tier); if (e.key === 'Escape') setEditingTier(null); }}
                    />
                    <button onClick={() => savePrice(plan.tier)} className="p-1 rounded hover:bg-[var(--s)]">
                      <Check className="w-4 h-4 text-[#10b981]" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-mono font-bold text-[var(--gold)]">${plan.lifetime_price}</span>
                    <button onClick={() => { setEditingTier(plan.tier); setEditPrice(String(plan.lifetime_price)); }} className="p-1 rounded hover:bg-[var(--s)]" data-testid={`fc-edit-${plan.tier}`}>
                      <Pencil className="w-3.5 h-3.5 text-[var(--t4)]" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* FC Subscribers list — paid members only. `pending` rows are
            click-throughs to Stripe that never converted; surfacing
            them here was misleading the founder into thinking pending
            users had subscribed. Conversion-funnel signal (clicked but
            didn't pay) belongs in the Marketing analytics tab; that's
            tracked as a follow-up so it doesn't drop. */}
        {(() => {
          const paidFcSubs = (fcSubs || []).filter(fc => {
            const s = (fc?.status || '').toLowerCase();
            return s && s !== 'pending' && s !== 'cancelled' && s !== 'failed';
          });
          if (paidFcSubs.length === 0) return null;
          return (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--b)' }}>
            <p className="text-xs font-bold text-[var(--t4)] mb-2">Founders Circle Members ({paidFcSubs.length})</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {paidFcSubs.map(fc => (
                <div key={fc.id} className="flex items-center justify-between text-xs p-2 rounded" style={{ background: 'var(--s)' }}>
                  <div>
                    <span className="text-[var(--t2)]">{fc.estate_name || fc.estate_id}</span>
                    <span className="text-[var(--t4)] ml-2">{fc.tier_name} · {fc.num_payments === 1 ? 'Paid in full' : `${fc.payments_made}/${fc.num_payments} payments`}</span>
                  </div>
                  <span className={`font-bold ${fc.status === 'completed' ? 'text-[#10b981]' : fc.status === 'active' ? 'text-[var(--gold)]' : 'text-[var(--t4)]'}`}>
                    {fc.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}

