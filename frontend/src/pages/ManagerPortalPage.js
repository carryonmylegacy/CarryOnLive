/**
 * ManagerPortalPage — the B2B partner manager's home base (/manager/portal).
 *
 * Self-guarded by the manager token (carryon_manager_token). At-a-glance
 * roster of every client attributed to THEIR partner, with: Enter Portal
 * (trustee mode), create client portals, send/resend/copy claim invites,
 * and password resets (email code or one-time temp password).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import {
  Briefcase, Plus, Loader2, Send, Copy, Check, LogIn, LogOut, KeyRound,
  ShieldAlert, FileText, UserPlus, Clock, CheckCircle2, Users, X, Mail,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { PartnerGuidePanel } from '../components/manager/PartnerGuidePanel';
import { toast } from '../utils/toast';
import { API_URL } from '../config';

const mgrHeaders = () => {
  const t = typeof window !== 'undefined' ? window.localStorage.getItem('carryon_manager_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const StatusChip = ({ status }) => {
  const pending = status === 'pending_claim';
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
      style={pending
        ? { background: 'rgba(245,158,11,0.14)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.35)' }
        : { background: 'rgba(16,185,129,0.14)', color: '#10b981', border: '1px solid rgba(16,185,129,0.35)' }}
      data-testid="mgr-client-status-chip"
    >
      {pending ? <Clock className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
      {pending ? 'Awaiting claim' : 'Claimed'}
    </span>
  );
};

const SubscribedPill = ({ subscribed }) => (
  <span
    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide"
    style={subscribed
      ? { background: 'rgba(16,185,129,0.14)', color: '#10b981', border: '1px solid rgba(16,185,129,0.35)' }
      : { background: 'rgba(120,130,150,0.12)', color: 'var(--t5)', border: '1px solid rgba(120,130,150,0.35)' }}
    title={subscribed ? 'Paying subscriber — current' : 'No active subscription (trial, lapsed, or not yet subscribed)'}
    data-testid="mgr-client-subscribed-pill"
  >
    SUBSCRIBED
  </span>
);

const ResetPasswordModal = ({ client, onClose }) => {
  const [busy, setBusy] = useState(null);
  const [tempPassword, setTempPassword] = useState(null);
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async (mode) => {
    setBusy(mode);
    try {
      const { data } = await apiClient.post(
        `${API_URL}/manager/clients/${client.id}/reset-password`,
        { mode },
        { headers: { ...mgrHeaders(), 'Content-Type': 'application/json' } },
      );
      if (mode === 'temp') setTempPassword(data.temp_password);
      else setEmailSent(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Password reset failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" data-testid="mgr-reset-modal"
      style={{ background: 'rgba(5,10,20,0.75)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl p-6" style={{ background: 'var(--bg)', border: '1px solid rgba(var(--gold-rgb),0.25)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--t)]">Reset Password</h3>
            <p className="text-sm text-[var(--t4)]">{client.name} · {client.email}</p>
          </div>
          <button onClick={onClose} className="text-[var(--t5)] hover:text-[var(--t)]" data-testid="mgr-reset-close" aria-label="Close reset password dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        {tempPassword ? (
          <div className="rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.35)' }} data-testid="mgr-temp-password-block">
            <p className="text-sm font-bold text-[var(--gn2)] mb-2">One-time temporary password</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-base font-mono font-bold text-[var(--t)] px-3 py-2 rounded-lg" style={{ background: 'var(--s)' }} data-testid="mgr-temp-password-value">{tempPassword}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(tempPassword); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="p-2 text-[var(--t4)] hover:text-[var(--t)]" title="Copy" data-testid="mgr-temp-password-copy">
                {copied ? <Check className="w-4 h-4 text-[var(--gn2)]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-[var(--t4)] mt-2">
              Shown once — hand it to your client securely. All of their existing sessions were signed out.
              They should change it in Settings after signing in.
            </p>
          </div>
        ) : emailSent ? (
          <div className="rounded-xl p-4 text-sm text-[var(--gn2)] font-semibold" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.35)' }} data-testid="mgr-reset-email-sent">
            Reset code emailed. Your client should tap “Forgot password” on the sign-in page and enter the code.
          </div>
        ) : (
          <div className="space-y-3">
            <button onClick={() => run('email')} disabled={!!busy}
              className="w-full flex items-start gap-3 p-4 rounded-xl text-left transition-colors hover:border-[var(--gold)]/50"
              style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid="mgr-reset-email-btn">
              <Mail className="w-5 h-5 mt-0.5 text-[var(--gold)] flex-shrink-0" />
              <span>
                <span className="block text-sm font-bold text-[var(--t)]">Email a reset code {busy === 'email' && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}</span>
                <span className="block text-[12px] text-[var(--t4)] mt-0.5">The client finishes the reset themselves — you never see the password.</span>
              </span>
            </button>
            <button onClick={() => run('temp')} disabled={!!busy}
              className="w-full flex items-start gap-3 p-4 rounded-xl text-left transition-colors hover:border-[var(--gold)]/50"
              style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid="mgr-reset-temp-btn">
              <KeyRound className="w-5 h-5 mt-0.5 text-[var(--gold)] flex-shrink-0" />
              <span>
                <span className="block text-sm font-bold text-[var(--t)]">Generate a temporary password {busy === 'temp' && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}</span>
                <span className="block text-[12px] text-[var(--t4)] mt-0.5">Shown to you once to hand over. Signs the client out everywhere immediately.</span>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default function ManagerPortalPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState(null);
  const [stats, setStats] = useState(null);
  const [clients, setClients] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(null);
  const [resetFor, setResetFor] = useState(null);

  const managerInfo = (() => {
    try { return JSON.parse(localStorage.getItem('carryon_manager_info') || 'null'); } catch { return null; }
  })();

  const fetchAll = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`${API_URL}/manager/clients`, { headers: mgrHeaders() });
      setPartner(data.partner);
      setStats(data.stats);
      setClients(data.clients || []);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem('carryon_manager_token');
        navigate('/partner');
        return;
      }
      toast.error(err.response?.data?.detail || 'Failed to load your clients');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!localStorage.getItem('carryon_manager_token')) { navigate('/partner'); return; }
    fetchAll();
  }, [fetchAll, navigate]);

  const signOut = () => {
    localStorage.removeItem('carryon_manager_token');
    localStorage.removeItem('carryon_manager_info');
    navigate('/partner');
  };

  const createClient = async () => {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      toast.error('First name, last name, and email are all required');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post(`${API_URL}/manager/clients`, form, {
        headers: { ...mgrHeaders(), 'Content-Type': 'application/json' },
      });
      setForm({ first_name: '', last_name: '', email: '' });
      setShowNew(false);
      await fetchAll();
      toast.success('Client portal created — enter it to prepare their documents');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create client portal');
    } finally {
      setSaving(false);
    }
  };

  const sendInvite = async (client) => {
    setBusy(`invite-${client.id}`);
    try {
      await apiClient.post(`${API_URL}/manager/clients/${client.id}/send-invite`, {}, { headers: mgrHeaders() });
      toast.success(`Invitation sent to ${client.email}`);
      await fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send invitation');
    } finally {
      setBusy(null);
    }
  };

  const enterPortal = async (client) => {
    setBusy(`enter-${client.id}`);
    try {
      const { data } = await apiClient.post(`${API_URL}/manager/clients/${client.id}/enter`, {}, { headers: mgrHeaders() });
      localStorage.setItem('carryon_token', data.access_token);
      localStorage.setItem('carryon_manager_return', '1');
      window.location.assign('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not enter the client portal');
      setBusy(null);
    }
  };

  const copyLink = (client) => {
    if (!client.claim_url) return;
    navigator.clipboard.writeText(client.claim_url);
    setCopied(client.id);
    setTimeout(() => setCopied(null), 1500);
    toast.success('Invite link copied');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }} data-testid="manager-portal-loading">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--gold)]" />
      </div>
    );
  }

  const tiles = stats ? [
    { label: 'Total Clients', value: stats.total, icon: Users, color: '#8B5CF6' },
    { label: 'Claimed', value: stats.claimed, icon: CheckCircle2, color: '#10b981' },
    { label: 'Awaiting Claim', value: stats.awaiting_claim, icon: Clock, color: '#F59E0B' },
    { label: 'Seats Remaining', value: stats.seats_remaining ?? '∞', icon: Briefcase, color: '#d4af37' },
  ] : [];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }} data-testid="manager-portal-page">
      {/* Header */}
      <div className="sticky top-0 z-20 px-4 lg:px-8 py-3 flex items-center justify-between gap-3"
        style={{ background: 'rgba(13,22,40,0.92)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(var(--gold-rgb),0.18)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <img src="/carryon-logo.png" alt="CarryOn" className="h-8 w-auto" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-[var(--t)] truncate" data-testid="manager-portal-partner-name">{partner?.company_name} — Partner Portal</div>
            <div className="text-[11px] text-[var(--t4)] truncate">{managerInfo?.name || 'Partner'}</div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={signOut} className="text-xs border-[var(--b)] flex-shrink-0" data-testid="manager-signout-btn">
          <LogOut className="w-3.5 h-3.5 mr-1" /> Sign Out
        </Button>
      </div>

      <div className="w-full max-w-[1400px] mx-auto p-4 lg:p-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl lg:text-4xl font-semibold text-[var(--t)] mb-1 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
              Your Clients
            </h1>
            <p className="text-[var(--t4)] text-sm lg:text-base">Everything you need to prepare and manage client portals — at a glance.</p>
          </div>
          <Button className="gold-button" onClick={() => setShowNew(v => !v)} data-testid="mgr-new-client-btn">
            <Plus className="w-4 h-4 mr-1" /> Set Up a New Client
          </Button>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {tiles.map(t => (
            <div key={t.label} className="glass-card p-4">
              <t.icon className="w-4 h-4 mb-1.5" style={{ color: t.color }} />
              <div className="text-2xl font-bold text-[var(--t)]" data-testid={`mgr-stat-${t.label.toLowerCase().replace(/ /g, '-')}`}>{t.value}</div>
              <div className="text-[11px] text-[var(--t5)] font-semibold uppercase tracking-wider">{t.label}</div>
            </div>
          ))}
        </div>

        <PartnerGuidePanel />

        {partner && !partner.tma_enabled && (
          <div className="mb-4 p-3 rounded-xl flex items-start gap-2 text-sm"
            style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', color: '#F59E0B' }}
            data-testid="mgr-tma-warning">
            <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="font-semibold">
              Trustee Mode Access is OFF for your partnership — you can create portals and send invitations,
              but you cannot enter a client portal until CarryOn enables it.
            </span>
          </div>
        )}

        {showNew && (
          <div className="glass-card p-5 mb-5" style={{ borderColor: 'rgba(var(--gold-rgb),0.35)' }} data-testid="mgr-new-client-form">
            <h3 className="text-sm font-bold text-[var(--t)] mb-3 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[var(--gold)]" /> New Client Portal
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div className="space-y-1">
                <Label className="text-xs text-[var(--t4)]">First Name</Label>
                <Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })}
                  placeholder="Jane" className="input-field text-sm" data-testid="mgr-client-first-name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[var(--t4)]">Last Name</Label>
                <Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })}
                  placeholder="Dawson" className="input-field text-sm" data-testid="mgr-client-last-name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[var(--t4)]">Client Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="jane@example.com" className="input-field text-sm" data-testid="mgr-client-email" />
              </div>
            </div>
            <p className="text-[11px] text-[var(--t5)] mb-3">
              This creates their private portal immediately. Enter it to upload their documents, then send the
              invitation when everything is ready — they&apos;ll pick their own username and password.
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="gold-button text-xs" onClick={createClient} disabled={saving} data-testid="mgr-create-client-btn">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Create Portal'}
              </Button>
              <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {clients.length === 0 ? (
          <div className="glass-card p-10 text-center" data-testid="mgr-clients-empty">
            <Briefcase className="w-10 h-10 mx-auto text-[var(--t5)] mb-3" />
            <p className="text-sm text-[var(--t4)]">
              No clients yet. Tap <span className="font-bold text-[var(--gold)]">Set Up a New Client</span> to prepare your first portal.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map(client => (
              <div key={client.id} className="glass-card p-4 flex flex-col lg:flex-row lg:items-center gap-3" data-testid={`mgr-client-row-${client.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[var(--t)]" data-testid="mgr-client-name">{client.name}</span>
                    <StatusChip status={client.status} />
                    <SubscribedPill subscribed={!!client.subscribed} />
                    {!client.provisioned && (
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--t5)]" title="This client signed up on their own through your landing page">self-signup</span>
                    )}
                  </div>
                  <div className="text-[12px] text-[var(--t4)] mt-0.5 flex items-center gap-3 flex-wrap">
                    <span>{client.email}</span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="w-3 h-3" /> {client.documents_count} document{client.documents_count === 1 ? '' : 's'}
                    </span>
                    {client.last_login_at && (
                      <span className="text-[var(--t5)]">last active {new Date(client.last_login_at).toLocaleDateString()}</span>
                    )}
                    {client.status === 'pending_claim' && client.invite_sent_at && (
                      <span className="text-[var(--t5)]">invited {new Date(client.invite_sent_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {client.can_enter && (
                    <Button size="sm" className="gold-button text-xs"
                      disabled={busy === `enter-${client.id}` || (partner && !partner.tma_enabled)}
                      onClick={() => enterPortal(client)}
                      data-testid={`mgr-enter-portal-${client.id}`}>
                      {busy === `enter-${client.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><LogIn className="w-3 h-3 mr-1" /> Enter Portal</>}
                    </Button>
                  )}
                  {client.status === 'pending_claim' ? (
                    <>
                      <Button size="sm" variant="outline"
                        className="text-xs border-[var(--gold)]/40 text-[var(--gold)]"
                        disabled={busy === `invite-${client.id}`}
                        onClick={() => sendInvite(client)}
                        data-testid={`mgr-send-invite-${client.id}`}>
                        {busy === `invite-${client.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3 mr-1" /> {client.invite_sent_at ? 'Resend Invite' : 'Send Invite'}</>}
                      </Button>
                      <button onClick={() => copyLink(client)} className="text-[var(--t5)] hover:text-[var(--t)] p-1.5"
                        title="Copy invite link" data-testid={`mgr-copy-link-${client.id}`}>
                        {copied === client.id ? <Check className="w-4 h-4 text-[var(--gn2)]" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" className="text-xs border-[var(--b)] text-[var(--t3)]"
                      onClick={() => setResetFor(client)}
                      data-testid={`mgr-reset-password-${client.id}`}>
                      <KeyRound className="w-3 h-3 mr-1" /> Reset Password
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {resetFor && <ResetPasswordModal client={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  );
}
