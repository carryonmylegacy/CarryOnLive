import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ToggleLeft, Users, DollarSign, Loader2, Search, Plus, Trash2, Copy, Check, Briefcase } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const SubscriptionsTab = ({ getAuthHeaders, users, operatorMode = false }) => {
  const [settings, setSettings] = useState(null);
  const [userSubs, setUserSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState(null);
  const [newPrice, setNewPrice] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [discountInput, setDiscountInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // B2B codes
  const [b2bCodes, setB2bCodes] = useState([]);
  const [showNewCode, setShowNewCode] = useState(false);
  const [newCodeForm, setNewCodeForm] = useState({ code: '', partner_name: '', discount_percent: 100, max_uses: 0 });
  const [copiedCode, setCopiedCode] = useState(null);

  const headers = getAuthHeaders()?.headers || {};

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const [settingsRes, usersRes, codesRes] = await Promise.all([
        axios.get(`${API_URL}/admin/subscription-settings`, { headers }),
        axios.get(`${API_URL}/admin/user-subscriptions`, { headers }),
        axios.get(`${API_URL}/admin/b2b-codes`, { headers }).catch(() => ({ data: [] })),
      ]);
      setSettings(settingsRes.data);
      setUserSubs(usersRes.data);
      setB2bCodes(codesRes.data || []);
    } catch (err) { toast.error('Failed to load subscription data'); }
    setLoading(false);
  };

  const toggleBeta = async () => {
    try {
      await axios.put(`${API_URL}/admin/subscription-settings`, { beta_mode: !settings.beta_mode }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      // toast removed
      fetchData();
    } catch (err) { toast.error('Failed to update'); }
  };

  const updatePrice = async (planId) => {
    try {
      const formData = new FormData();
      formData.append('price', parseFloat(newPrice));
      await axios.put(`${API_URL}/admin/plans/${planId}/price`, formData, { headers });
      // toast removed
      setEditingPrice(null);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update price'); }
  };

  const updateUserOverride = async (userId, data) => {
    try {
      await axios.put(`${API_URL}/admin/user-subscription/${userId}`, data, { headers: { ...headers, 'Content-Type': 'application/json' } });
      fetchData();
    } catch (err) { toast.error('Failed to update'); }
  };

  const createB2bCode = async () => {
    if (!newCodeForm.code.trim()) { toast.error('Code is required'); return; }
    try {
      await axios.post(`${API_URL}/admin/b2b-codes`, newCodeForm, { headers: { ...headers, 'Content-Type': 'application/json' } });
      setShowNewCode(false);
      setNewCodeForm({ code: '', partner_name: '', discount_percent: 100, max_uses: 0 });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to create code'); }
  };

  const toggleB2bCode = async (codeId, active) => {
    try {
      await axios.put(`${API_URL}/admin/b2b-codes/${codeId}`, { active }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      fetchData();
    } catch (err) { toast.error('Failed to update'); }
  };

  const deleteB2bCode = async (codeId) => {
    if (!window.confirm('Delete this B2B code?')) return;
    try {
      await axios.delete(`${API_URL}/admin/b2b-codes/${codeId}`, { headers });
      fetchData();
    } catch (err) { toast.error('Failed to delete'); }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
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
                  ? 'Family plans are visible to users. FPOs get $1/mo discount for added benefactors, flat $3.49/mo for beneficiaries.'
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
                    await axios.put(`${API_URL}/admin/family-plan-settings`, {}, { headers });
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
                      <Input type="number" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} className="input-field w-20 text-sm" autoFocus />
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
                      <Input type="number" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} className="input-field w-20 text-sm" autoFocus />
                      <Button size="sm" className="gold-button text-xs" onClick={async () => {
                        try {
                          const formData = new FormData();
                          formData.append('price', parseFloat(newPrice));
                          await axios.put(`${API_URL}/admin/beneficiary-plans/${plan.id}/price`, formData, { headers });
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

      {/* Per-User Overrides */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-[var(--gold)]" />
            User Subscription Overrides
          </h3>
          <p className="text-xs text-[var(--t5)] mb-4">Search for a user to manage their subscription discount or free access.</p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <Search className="w-4 h-4 text-[var(--t5)]" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name or email..." className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]" data-testid="subscriptions-user-search" />
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
                <div key={u.id} className="p-3 rounded-xl bg-[var(--s)]" data-testid={`user-sub-${u.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[var(--t)] text-sm">{u.name || u.email}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--b)] text-[var(--t4)]">{u.role}</span>
                      </div>
                      <p className="text-xs text-[var(--t5)] truncate mt-0.5">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {sub && <span className="text-xs text-[var(--gn2)] font-bold">{sub.plan_name}</span>}
                      {override.free_access && <span className="text-[10px] bg-[var(--gn2)]/10 text-[var(--gn2)] px-2 py-0.5 rounded-full font-bold">Free</span>}
                      {override.custom_discount > 0 && <span className="text-[10px] bg-[var(--yw)]/10 text-[var(--yw)] px-2 py-0.5 rounded-full font-bold">{override.custom_discount}%</span>}
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

      {/* B2B / Enterprise Partner Codes */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-[#8B5CF6]" />
              B2B Partner Codes
            </h3>
            <Button size="sm" className="gold-button text-xs" onClick={() => setShowNewCode(true)} data-testid="add-b2b-code-btn">
              <Plus className="w-3 h-3 mr-1" /> New Code
            </Button>
          </div>

          {showNewCode && (
            <div className="p-4 rounded-xl mb-4" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="space-y-1">
                  <Label className="text-xs text-[var(--t4)]">Code <span className="text-red-400">*</span></Label>
                  <Input value={newCodeForm.code} onChange={e => setNewCodeForm({...newCodeForm, code: e.target.value.toUpperCase()})}
                    placeholder="PARTNER2026" className="input-field text-sm" data-testid="b2b-code-name-input" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-[var(--t4)]">Partner Name</Label>
                  <Input value={newCodeForm.partner_name} onChange={e => setNewCodeForm({...newCodeForm, partner_name: e.target.value})}
                    placeholder="Acme Insurance" className="input-field text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="space-y-1">
                  <Label className="text-xs text-[var(--t4)]">Discount %</Label>
                  <Input type="number" min={0} max={100} value={newCodeForm.discount_percent}
                    onChange={e => setNewCodeForm({...newCodeForm, discount_percent: parseInt(e.target.value) || 0})}
                    className="input-field text-sm" data-testid="b2b-discount-input" />
                  <p className="text-[10px] text-[var(--t5)]">100% = free access</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-[var(--t4)]">Max Uses</Label>
                  <Input type="number" min={0} value={newCodeForm.max_uses}
                    onChange={e => setNewCodeForm({...newCodeForm, max_uses: parseInt(e.target.value) || 0})}
                    className="input-field text-sm" />
                  <p className="text-[10px] text-[var(--t5)]">0 = unlimited</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="gold-button text-xs" onClick={createB2bCode} data-testid="save-b2b-code-btn">Create Code</Button>
                <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={() => setShowNewCode(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {b2bCodes.length === 0 && !showNewCode ? (
            <p className="text-sm text-[var(--t5)] text-center py-4">No B2B codes yet. Create one to start onboarding enterprise partners.</p>
          ) : (
            <div className="space-y-2">
              {b2bCodes.map(code => (
                <div key={code.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--s)]" data-testid={`b2b-code-${code.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-[#8B5CF6]">{code.code}</span>
                      <button onClick={() => copyCode(code.code)} className="text-[var(--t5)] hover:text-[var(--t)]">
                        {copiedCode === code.code ? <Check className="w-3 h-3 text-[var(--gn2)]" /> : <Copy className="w-3 h-3" />}
                      </button>
                      {!code.active && <span className="text-[10px] text-[var(--rd)] font-bold">INACTIVE</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--t4)] mt-0.5">
                      {code.partner_name && <span>{code.partner_name}</span>}
                      <span className="font-bold" style={{ color: code.discount_percent >= 100 ? '#22C993' : '#F59E0B' }}>
                        {code.discount_percent >= 100 ? 'Free' : `${code.discount_percent}% off`}
                      </span>
                      <span>{code.times_used}{code.max_uses > 0 ? `/${code.max_uses}` : ''} used</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch checked={code.active} onCheckedChange={(v) => toggleB2bCode(code.id, v)} />
                    <button onClick={() => deleteB2bCode(code.id)} className="text-[var(--t5)] hover:text-[var(--rd)]">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
