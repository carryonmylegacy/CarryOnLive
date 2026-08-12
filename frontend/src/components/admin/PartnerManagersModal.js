/**
 * PartnerManagersModal — founder-side manager-credential management for
 * one B2B partner (Admin → Finance → Partners → key icon).
 *
 * Create manager logins (password shown ONCE, bcrypt at rest),
 * regenerate passwords, copy portal URL + credentials, deactivate/delete.
 */

import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { X, Loader2, KeyRound, Plus, Copy, Check, Power, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

const CredentialsBlock = ({ creds }) => {
  const [copied, setCopied] = useState(null);
  const portalUrl = `${window.location.origin}${creds.portal_path || '/manager'}`;
  const copy = (key, value) => {
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };
  const rows = [
    { key: 'url', label: 'Portal URL', value: portalUrl },
    { key: 'username', label: 'Username', value: creds.username },
    { key: 'password', label: 'Password', value: creds.password },
  ];
  const copyAll = () => copy('all', `Manager Portal: ${portalUrl}\nUsername: ${creds.username}\nPassword: ${creds.password}`);
  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.35)' }} data-testid="manager-credentials-block">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-[var(--gn2)]">Credentials — shown once, copy them now</p>
        <button onClick={copyAll} className="text-[11px] font-bold text-[var(--gold)] hover:text-[var(--t)] inline-flex items-center gap-1" data-testid="manager-credentials-copy-all">
          {copied === 'all' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy all
        </button>
      </div>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.key} className="flex items-center gap-2 text-[13px]">
            <span className="w-24 flex-shrink-0 text-[var(--t5)] font-semibold text-[11px] uppercase tracking-wider">{r.label}</span>
            <code className="flex-1 font-mono text-[var(--t)] truncate px-2 py-1 rounded" style={{ background: 'var(--s)' }} data-testid={`manager-cred-${r.key}`}>{r.value}</code>
            <button onClick={() => copy(r.key, r.value)} className="text-[var(--t5)] hover:text-[var(--t)] p-1" title={`Copy ${r.label}`} data-testid={`manager-cred-copy-${r.key}`}>
              {copied === r.key ? <Check className="w-3.5 h-3.5 text-[var(--gn2)]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[var(--t4)] mt-2">The password is not stored readable — if it's lost, use Regenerate to issue a new one.</p>
    </div>
  );
};

export const PartnerManagersModal = ({ partner, authHeaders, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState([]);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(null);
  const [creds, setCreds] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`${API_URL}/admin/partners/${partner.id}/managers`, { headers: authHeaders() });
      setManagers(data.managers || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load managers');
    } finally {
      setLoading(false);
    }
  }, [partner.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createManager = async () => {
    if (!name.trim()) { toast.error('Manager name is required'); return; }
    setBusy('create');
    try {
      const { data } = await apiClient.post(
        `${API_URL}/admin/partners/${partner.id}/managers`,
        { name: name.trim(), username: username.trim() },
        { headers: { ...authHeaders(), 'Content-Type': 'application/json' } },
      );
      setCreds(data.credentials);
      setName('');
      setUsername('');
      await fetchAll();
      toast.success('Manager login created — copy the credentials now');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create manager');
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async (m) => {
    if (!window.confirm(`Regenerate ${m.username}'s password? The old one stops working immediately.`)) return;
    setBusy(`regen-${m.id}`);
    try {
      const { data } = await apiClient.post(
        `${API_URL}/admin/partners/${partner.id}/managers/${m.id}/reset-password`, {},
        { headers: authHeaders() },
      );
      setCreds(data.credentials);
      toast.success('New password generated — copy it now');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to regenerate password');
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = async (m) => {
    setBusy(`toggle-${m.id}`);
    try {
      await apiClient.put(
        `${API_URL}/admin/partners/${partner.id}/managers/${m.id}`,
        { active: !m.active },
        { headers: { ...authHeaders(), 'Content-Type': 'application/json' } },
      );
      await fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update manager');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (m) => {
    if (!window.confirm(`Delete manager login "${m.username}"? This cannot be undone.`)) return;
    setBusy(`del-${m.id}`);
    try {
      await apiClient.delete(`${API_URL}/admin/partners/${partner.id}/managers/${m.id}`, { headers: authHeaders() });
      await fetchAll();
      toast.success('Manager deleted');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete manager');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" data-testid="managers-modal"
      style={{ background: 'rgba(5,10,20,0.75)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: 'var(--bg)', border: '1px solid rgba(var(--gold-rgb),0.25)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[var(--gold)]" /> Partner Managers
            </h3>
            <p className="text-sm text-[var(--t4)]">{partner.company_name} · sign in at <code className="text-[var(--gold)]">/manager</code></p>
          </div>
          <button onClick={onClose} className="text-[var(--t5)] hover:text-[var(--t)]" data-testid="managers-modal-close" aria-label="Close managers dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        {creds && <CredentialsBlock creds={creds} />}

        {/* Create form */}
        <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
          <p className="text-xs font-bold text-[var(--t3)] uppercase tracking-wider mb-2">New Manager Login</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Manager name (e.g. Jazmine Carpenter)"
              className="input-field text-sm flex-1" data-testid="manager-name-input" />
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username (optional — auto)"
              className="input-field text-sm sm:w-48" data-testid="manager-username-input" />
            <Button size="sm" className="gold-button text-xs h-9" onClick={createManager} disabled={busy === 'create' || !name.trim()}
              data-testid="manager-create-btn">
              {busy === 'create' ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Plus className="w-3 h-3 mr-1" /> Create</>}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-[var(--gold)]" /></div>
        ) : managers.length === 0 ? (
          <p className="text-sm text-[var(--t4)] text-center py-6" data-testid="managers-empty">No manager logins yet.</p>
        ) : (
          <div className="space-y-2">
            {managers.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid={`manager-row-${m.username}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[var(--t)] truncate">
                    {m.name}
                    {!m.active && <span className="ml-2 text-[10px] font-bold uppercase text-[var(--rd)]">deactivated</span>}
                  </div>
                  <div className="text-[11px] text-[var(--t4)] font-mono truncate">
                    {m.username}
                    {m.last_login_at && <span className="text-[var(--t5)] font-sans"> · last sign-in {new Date(m.last_login_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <button onClick={() => regenerate(m)} disabled={!!busy} className="text-[var(--t5)] hover:text-[var(--gold)] p-1.5"
                  title="Regenerate password" data-testid={`manager-regen-${m.username}`}>
                  {busy === `regen-${m.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </button>
                <button onClick={() => toggleActive(m)} disabled={!!busy}
                  className="p-1.5" title={m.active ? 'Deactivate' : 'Activate'}
                  style={{ color: m.active ? 'var(--gn2)' : 'var(--t5)' }}
                  data-testid={`manager-toggle-${m.username}`}>
                  <Power className="w-4 h-4" />
                </button>
                <button onClick={() => remove(m)} disabled={!!busy} className="text-[var(--t5)] hover:text-[var(--rd)] p-1.5"
                  title="Delete manager" data-testid={`manager-delete-${m.username}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PartnerManagersModal;
