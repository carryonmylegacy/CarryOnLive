/**
 * ProClientsPage — Pro Client Setup surface for B2B partner reps.
 *
 * Visible only to users the founder linked as a partner's rep
 * (users.partner_rep_for — server-gated; the API 403s everyone else).
 * The rep provisions client portals BEFORE the client's first login,
 * preloads documents in Trustee Mode, then sends a branded claim email.
 */

import React, { useEffect, useState } from 'react';
import apiClient from '../utils/apiClient';
import {
  Briefcase, Plus, Loader2, Send, Copy, Check, LogIn,
  ShieldAlert, FileText, UserPlus, Clock, CheckCircle2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from '../utils/toast';
import { API_URL } from '../config';

const authHeaders = () => {
  const t = typeof window !== 'undefined' ? window.localStorage.getItem('carryon_token') : null;
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
      data-testid="pro-client-status-chip"
    >
      {pending ? <Clock className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
      {pending ? 'Awaiting claim' : 'Claimed'}
    </span>
  );
};

export default function ProClientsPage() {
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [partner, setPartner] = useState(null);
  const [clients, setClients] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(null);

  const fetchAll = async () => {
    try {
      const { data } = await apiClient.get(`${API_URL}/pro/clients`, { headers: authHeaders() });
      setPartner(data.partner || null);
      setClients(data.clients || []);
      setDenied(false);
    } catch (err) {
      if (err.response?.status === 403) setDenied(true);
      else toast.error(err.response?.data?.detail || 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createClient = async () => {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      toast.error('First name, last name, and email are all required');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post(`${API_URL}/pro/clients`, form, {
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
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
      await apiClient.post(`${API_URL}/pro/clients/${client.id}/send-invite`, {}, { headers: authHeaders() });
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
      const { data } = await apiClient.post(`${API_URL}/pro/clients/${client.id}/enter`, {}, { headers: authHeaders() });
      const current = localStorage.getItem('carryon_token');
      localStorage.setItem('carryon_pro_return_token', current);
      localStorage.setItem('carryon_token', data.access_token);
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
      <div className="flex items-center justify-center py-24" data-testid="pro-clients-loading">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" />
      </div>
    );
  }

  if (denied) {
    return (
      <div className="p-4 lg:p-8" data-testid="pro-clients-denied">
        <div className="glass-card max-w-lg mx-auto mt-8 p-8 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-4 text-[var(--gold)]" />
          <h2 className="text-xl font-bold text-[var(--t)] mb-2">Partner reps only</h2>
          <p className="text-sm text-[var(--t4)]">
            This surface is reserved for designated partner representatives. If you believe you
            should have access, contact CarryOn.
          </p>
        </div>
      </div>
    );
  }

  const seatsLabel = partner?.max_uses > 0
    ? `${partner.times_used || 0} of ${partner.max_uses} slots used`
    : `${partner?.times_used || 0} slots used`;

  return (
    <div className="p-4 lg:p-8 animate-fade-in" data-testid="pro-clients-page">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl lg:text-4xl font-semibold text-[var(--t)] mb-1 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
            Client Portal Setup
          </h1>
          <p className="text-[var(--t4)] text-sm lg:text-base">
            <span className="font-semibold text-[var(--gold)]">{partner?.company_name}</span>
            {' '}· {seatsLabel}
          </p>
        </div>
        <Button className="gold-button" onClick={() => setShowNew(v => !v)} data-testid="pro-new-client-btn">
          <Plus className="w-4 h-4 mr-1" /> Set Up a New Client
        </Button>
      </div>

      {partner && !partner.tma_enabled && (
        <div
          className="mb-4 p-3 rounded-xl flex items-start gap-2 text-sm"
          style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', color: '#F59E0B' }}
          data-testid="pro-tma-warning"
        >
          <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="font-semibold">
            Trustee Mode Access is currently OFF for your partnership — you can create client
            portals and send invitations, but you cannot enter a portal to prepare documents
            until CarryOn switches on the TMA gate.
          </span>
        </div>
      )}

      {showNew && (
        <div className="glass-card p-5 mb-5" style={{ borderColor: 'rgba(var(--gold-rgb),0.35)' }} data-testid="pro-new-client-form">
          <h3 className="text-sm font-bold text-[var(--t)] mb-3 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[var(--gold)]" /> New Client Portal
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div className="space-y-1">
              <Label className="text-xs text-[var(--t4)]">First Name</Label>
              <Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })}
                placeholder="Jane" className="input-field text-sm" data-testid="pro-client-first-name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[var(--t4)]">Last Name</Label>
              <Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })}
                placeholder="Dawson" className="input-field text-sm" data-testid="pro-client-last-name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[var(--t4)]">Client Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="jane@example.com" className="input-field text-sm" data-testid="pro-client-email" />
            </div>
          </div>
          <p className="text-[11px] text-[var(--t5)] mb-3">
            This creates their private portal immediately. Enter it to upload their documents,
            then send the invitation when everything is ready — they&apos;ll pick their own
            username and password.
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="gold-button text-xs" onClick={createClient} disabled={saving} data-testid="pro-create-client-btn">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Create Portal'}
            </Button>
            <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={() => setShowNew(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {clients.length === 0 ? (
        <div className="glass-card p-10 text-center" data-testid="pro-clients-empty">
          <Briefcase className="w-10 h-10 mx-auto text-[var(--t5)] mb-3" />
          <p className="text-sm text-[var(--t4)]">
            No client portals yet. Tap <span className="font-bold text-[var(--gold)]">Set Up a New Client</span> to
            prepare your first one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map(client => (
            <div key={client.id} className="glass-card p-4 flex flex-col lg:flex-row lg:items-center gap-3" data-testid={`pro-client-row-${client.id}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-[var(--t)]" data-testid="pro-client-name">{client.name}</span>
                  <StatusChip status={client.status} />
                </div>
                <div className="text-[12px] text-[var(--t4)] mt-0.5 flex items-center gap-3 flex-wrap">
                  <span>{client.email}</span>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3 h-3" /> {client.documents_count} document{client.documents_count === 1 ? '' : 's'} prepared
                  </span>
                  {client.invite_sent_at && (
                    <span className="text-[var(--t5)]">invited {new Date(client.invite_sent_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="gold-button text-xs"
                  disabled={busy === `enter-${client.id}` || (partner && !partner.tma_enabled)}
                  onClick={() => enterPortal(client)}
                  data-testid={`pro-enter-portal-${client.id}`}
                >
                  {busy === `enter-${client.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><LogIn className="w-3 h-3 mr-1" /> Enter Portal</>}
                </Button>
                {client.status === 'pending_claim' && (
                  <>
                    <Button
                      size="sm" variant="outline"
                      className="text-xs border-[var(--gold)]/40 text-[var(--gold)]"
                      disabled={busy === `invite-${client.id}`}
                      onClick={() => sendInvite(client)}
                      data-testid={`pro-send-invite-${client.id}`}
                    >
                      {busy === `invite-${client.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3 mr-1" /> {client.invite_sent_at ? 'Resend Invite' : 'Send Invite'}</>}
                    </Button>
                    <button
                      onClick={() => copyLink(client)}
                      className="text-[var(--t5)] hover:text-[var(--t)] p-1.5"
                      title="Copy invite link"
                      data-testid={`pro-copy-link-${client.id}`}
                    >
                      {copied === client.id ? <Check className="w-4 h-4 text-[var(--gn2)]" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
