import React, { useState, useEffect } from 'react';
import apiClient from '../../utils/apiClient';
import { UserCog, Plus, Loader2, Trash2, Pencil, Shield } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

const SCOPE_OPTIONS = [
  { value: 'founder', label: 'Founder Admin', desc: 'Full platform access — sees and controls everything', color: '#d4af37' },
  { value: 'finance', label: 'Finance Admin', desc: 'Revenue, Subscriptions, Grace Periods, Analytics', color: '#22C993' },
  { value: 'compliance', label: 'Compliance Admin', desc: 'Audit Trail, Security, Estate Health', color: '#3B82F6' },
  { value: 'marketing', label: 'Marketing Admin', desc: 'Funnel, Beta Testing, Site Content, Emails, Invites', color: '#B794F6' },
  { value: 'platform_health', label: 'Platform Health Admin', desc: 'System Health, Operators, Integrations, Announcements', color: '#F59E0B' },
  { value: 'ops_manager', label: 'Operations Manager', desc: 'Full operations access — team, dashboard, scheduling', color: '#E87040' },
  { value: 'ops_team', label: 'Operations Team Member', desc: 'Transitions, support, verifications, shift work', color: '#64B5F6' },
];

export const ScopedAdminsTab = ({ getAuthHeaders }) => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '', admin_scope: ['finance'] });
  const [editForm, setEditForm] = useState({ admin_scope: [], first_name: '', last_name: '', password: '' });

  const headers = getAuthHeaders()?.headers || {};

  const fetch_ = async () => {
    try {
      const res = await apiClient.get(`${API_URL}/admin/scoped-admins`, { headers });
      setAdmins(res.data);
    } catch { toast.error('Failed to load admins'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []); // eslint-disable-line

  const handleCreate = async () => {
    if (!form.email || !form.password || !form.first_name) {
      toast.error('Email, password, and first name are required');
      return;
    }
    if (!form.admin_scope || form.admin_scope.length === 0) {
      toast.error('Select at least one admin scope');
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.post(`${API_URL}/admin/scoped-admins`, form, {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
      toast.success(res.data.merged ? 'Scopes merged into existing account' : 'Admin created');
      setShowCreate(false);
      setForm({ email: '', password: '', first_name: '', last_name: '', admin_scope: ['finance'] });
      fetch_();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to create admin'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id) => {
    setSaving(true);
    try {
      const payload = {};
      if (editForm.admin_scope) payload.admin_scope = editForm.admin_scope;
      if (editForm.first_name) payload.first_name = editForm.first_name;
      if (editForm.last_name) payload.last_name = editForm.last_name;
      if (editForm.password) payload.password = editForm.password;
      await apiClient.put(`${API_URL}/admin/scoped-admins/${id}`, payload, {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
      toast.success('Admin updated');
      setEditId(null);
      fetch_();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this admin account?')) return;
    try {
      await apiClient.delete(`${API_URL}/admin/scoped-admins/${id}`, { headers });
      toast.success('Admin deleted');
      fetch_();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete'); }
  };

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--t4)]" /></div>;

  return (
    <div className="space-y-4" data-testid="scoped-admins-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--t)]">Admin Accounts</h2>
          <p className="text-xs text-[var(--t5)]">Create scoped admin accounts with limited portal access</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} size="sm" className="gold-button text-xs" data-testid="create-admin-btn">
          <Plus className="w-3 h-3 mr-1" /> New Admin
        </Button>
      </div>

      {showCreate && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})}
                placeholder="First Name" className="text-sm" data-testid="admin-first-name" />
              <Input value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})}
                placeholder="Last Name" className="text-sm" data-testid="admin-last-name" />
            </div>
            <Input value={form.email} onChange={e => setForm({...form, email: e.target.value})}
              placeholder="Email" type="email" className="text-sm" data-testid="admin-email" />
            <Input value={form.password} onChange={e => setForm({...form, password: e.target.value})}
              placeholder="Password" type="password" className="text-sm" data-testid="admin-password" />
            <div>
              <p className="text-xs text-[var(--t5)] mb-2">Admin Scope(s) — select one or more:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SCOPE_OPTIONS.filter(s => s.value !== 'founder').map(s => {
                  const selected = (form.admin_scope || []).includes(s.value);
                  return (
                    <button key={s.value}
                      onClick={() => {
                        const scopes = form.admin_scope || [];
                        setForm({...form, admin_scope: selected ? scopes.filter(v => v !== s.value) : [...scopes, s.value]});
                      }}
                      className={`p-2.5 rounded-xl text-left transition-all text-xs ${
                        selected ? 'border-2' : 'bg-[var(--s)] border border-[var(--b)]'
                      }`}
                      style={selected ? { borderColor: s.color, background: `${s.color}10` } : {}}
                      data-testid={`scope-option-${s.value}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected ? '' : 'border-[var(--t5)]'}`}
                          style={selected ? { borderColor: s.color, background: s.color } : {}}>
                          {selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <span className="font-bold text-[var(--t)]">{s.label}</span>
                      </div>
                      <p className="text-[var(--t5)] text-[11px] mt-0.5 ml-6">{s.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button onClick={() => setShowCreate(false)} variant="ghost" size="sm" className="text-xs">Cancel</Button>
              <Button onClick={handleCreate} disabled={saving} size="sm" className="gold-button text-xs" data-testid="submit-create-admin">
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Create Admin
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {admins.map(admin => {
        const scopes = Array.isArray(admin.admin_scope) ? admin.admin_scope : [admin.admin_scope || 'founder'];
        const primaryScope = SCOPE_OPTIONS.find(s => scopes.includes(s.value)) || SCOPE_OPTIONS[0];
        const isFounderAdmin = scopes.includes('founder');
        const isEditing = editId === admin.id;
        return (
          <Card key={admin.id} className="glass-card" data-testid={`admin-card-${admin.id}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${primaryScope.color}15`, border: `1px solid ${primaryScope.color}30` }}>
                    {isFounderAdmin ? <Shield className="w-4 h-4" style={{ color: primaryScope.color }} /> : <UserCog className="w-4 h-4" style={{ color: primaryScope.color }} />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[var(--t)]">{admin.name}</p>
                    <p className="text-[11px] text-[var(--t5)]">
                      {admin.email}
                      {admin.role === 'operator' && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>OPERATOR</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {scopes.map(s => {
                    const sc = SCOPE_OPTIONS.find(o => o.value === s) || { label: s, color: '#888' };
                    return (
                      <span key={s} className="text-[11px] px-2 py-1 rounded-full font-bold" style={{ background: `${sc.color}15`, color: sc.color }}>
                        {sc.label}
                      </span>
                    );
                  })}
                  {!isFounderAdmin && (
                    <>
                      <button onClick={() => { setEditId(isEditing ? null : admin.id); setEditForm({ admin_scope: scopes, first_name: admin.first_name || '', last_name: admin.last_name || '', password: '' }); }}
                        className="p-1.5 rounded-lg text-[var(--t5)] hover:text-[var(--t3)] transition-colors" data-testid={`edit-admin-${admin.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(admin.id)}
                        className="p-1.5 rounded-lg text-[var(--t5)] hover:text-red-400 transition-colors" data-testid={`delete-admin-${admin.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {isEditing && (
                <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px solid var(--b)' }}>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={editForm.first_name} onChange={e => setEditForm({...editForm, first_name: e.target.value})} placeholder="First Name" className="text-xs" />
                    <Input value={editForm.last_name} onChange={e => setEditForm({...editForm, last_name: e.target.value})} placeholder="Last Name" className="text-xs" />
                  </div>
                  <Input value={editForm.password} onChange={e => setEditForm({...editForm, password: e.target.value})} placeholder="New password (leave blank to keep)" type="password" className="text-xs" />
                  <div className="grid grid-cols-2 gap-1.5">
                    {SCOPE_OPTIONS.filter(s => s.value !== 'founder').map(s => {
                      const checked = (editForm.admin_scope || []).includes(s.value);
                      return (
                        <button key={s.value}
                          onClick={() => {
                            const cur = editForm.admin_scope || [];
                            setEditForm({...editForm, admin_scope: checked ? cur.filter(v => v !== s.value) : [...cur, s.value]});
                          }}
                          className={`p-2 rounded-lg text-left text-[11px] transition-all ${checked ? 'border' : 'bg-[var(--s)] border border-[var(--b)]'}`}
                          style={checked ? { borderColor: s.color, background: `${s.color}10` } : {}}>
                          <div className="flex items-center gap-1.5">
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0`}
                              style={checked ? { borderColor: s.color, background: s.color } : { borderColor: 'var(--t5)' }}>
                              {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span className="font-bold text-[var(--t)]">{s.label}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button onClick={() => setEditId(null)} variant="ghost" size="sm" className="text-xs">Cancel</Button>
                    <Button onClick={() => handleUpdate(admin.id)} disabled={saving} size="sm" className="gold-button text-xs">Save</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
