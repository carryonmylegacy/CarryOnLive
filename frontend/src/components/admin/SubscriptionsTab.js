import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ToggleLeft, Users, DollarSign, Loader2, Search } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const SubscriptionsTab = ({ getAuthHeaders, users }) => {
  const [settings, setSettings] = useState(null);
  const [userSubs, setUserSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState(null);
  const [newPrice, setNewPrice] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [discountInput, setDiscountInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const headers = getAuthHeaders()?.headers || {};

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const [settingsRes, usersRes] = await Promise.all([
        axios.get(`${API_URL}/admin/subscription-settings`, { headers }),
        axios.get(`${API_URL}/admin/user-subscriptions`, { headers }),
      ]);
      setSettings(settingsRes.data);
      setUserSubs(usersRes.data);
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
      // toast removed
      fetchData();
    } catch (err) { toast.error('Failed to update'); }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>;

  return (
    <div className="space-y-6" data-testid="subscriptions-admin">
      {/* Beta Mode Toggle */}
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

      {/* Family Plan Toggle */}
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
                    // toast removed
                    fetchData();
                  } catch (err) { toast.error('Failed to update'); }
                }}
                data-testid="family-plan-toggle"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Management */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-[var(--gold)]" />
            Plan Pricing
          </h3>
          <div className="space-y-2">
            {(settings?.plans || []).map(plan => (
              <div key={plan.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--s)]" data-testid={`plan-row-${plan.id}`}>
                <div>
                  <span className="font-bold text-[var(--t)]">{plan.name}</span>
                  {plan.note && <span className="text-xs text-[var(--t5)] ml-2">({plan.note})</span>}
                </div>
                <div className="flex items-center gap-3">
                  {editingPrice === plan.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--t4)]">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={newPrice}
                        onChange={e => setNewPrice(e.target.value)}
                        className="input-field w-20 text-sm"
                        autoFocus
                      />
                      <Button size="sm" className="gold-button text-xs" onClick={() => updatePrice(plan.id)}>Save</Button>
                      <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={() => setEditingPrice(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      <span className="text-[var(--gold)] font-bold text-lg">${plan.price?.toFixed(2)}</span>
                      <span className="text-xs text-[var(--t5)]">/mo</span>
                      {plan.adjustable !== false && (
                        <Button size="sm" variant="outline" className="text-xs border-[var(--b)] text-[var(--t4)]" onClick={() => { setEditingPrice(plan.id); setNewPrice(plan.price?.toString() || ''); }}>
                          Edit
                        </Button>
                      )}
                      {plan.adjustable === false && <span className="text-[10px] text-[var(--t5)]">Fixed</span>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Per-User Overrides */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-[var(--gold)]" />
            User Subscription Overrides
          </h3>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <Search className="w-4 h-4 text-[var(--t5)]" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name, email, role, plan..." className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]" data-testid="subscriptions-user-search" />
          </div>
          <div className="space-y-2">
            {userSubs.filter(u => u.role !== 'admin').filter(u => {
              if (!searchQuery) return true;
              const q = searchQuery.toLowerCase();
              return (u.name || '').toLowerCase().includes(q) ||
                (u.email || '').toLowerCase().includes(q) ||
                (u.role || '').toLowerCase().includes(q) ||
                (u.subscription?.plan_name || '').toLowerCase().includes(q);
            }).map(u => {
              const override = u.override || {};
              const sub = u.subscription;
              return (
                <div key={u.id} className="p-3 rounded-xl bg-[var(--s)]" data-testid={`user-sub-${u.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[var(--t)] text-sm">{u.name || u.email}</span>
                      <span className="text-xs text-[var(--t5)] ml-2">{u.email}</span>
                      <span className="text-xs ml-2 px-1.5 py-0.5 rounded bg-[var(--b)] text-[var(--t4)]">{u.role}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {sub && <span className="text-xs text-[var(--gn2)]">{sub.plan_name}</span>}
                      {override.free_access && <span className="text-xs bg-[var(--gn2)]/10 text-[var(--gn2)] px-2 py-0.5 rounded-full font-bold">Free</span>}
                      {override.custom_discount > 0 && <span className="text-xs bg-[var(--yw)]/10 text-[var(--yw)] px-2 py-0.5 rounded-full font-bold">{override.custom_discount}% off</span>}
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
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
