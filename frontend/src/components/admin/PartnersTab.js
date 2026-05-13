/**
 * Admin Partners Tab — White-label B2B Partnerships
 *
 * One row per partner. Columns are the 13 platform "pillars". Each cell
 * is a toggle. Left side of each row holds the partner's identity
 * (logo, company name, code, slug, discount, tagline) and a copyable
 * public landing URL (`/p/:slug`).
 *
 * The toggles negotiated with each partner become that partner's
 * unique tier — when an end-user redeems the partner's code at the
 * end of onboarding, these exact gates are copied onto their user
 * record as runtime feature overrides.
 */

import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import {
  Briefcase, Plus, Trash2, Copy, Check, Loader2, ExternalLink,
  Upload, Image as ImageIcon, Power, Mail, Send,
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

const LOGO_PLACEHOLDER = (
  <div
    className="w-12 h-12 rounded-lg flex flex-col items-center justify-center text-center"
    style={{
      background: 'rgba(212,175,55,0.08)',
      border: '1px dashed rgba(212,175,55,0.35)',
      color: 'rgba(212,175,55,0.7)',
    }}
  >
    <ImageIcon className="w-4 h-4 mb-0.5" />
    <span className="text-[10px] font-semibold leading-none">LOGO</span>
  </div>
);

const partnerLandingHref = (slug) => `${window.location.origin}/p/${slug}`;

// Builds a ready-to-send partner welcome email — Subject line on
// top, blank line, then body. One-shot clipboard paste works for
// every major mail client. Pillars come from the partner's
// `feature_gates` map intersected with the active columns so the
// list always matches what the admin actually toggled on. Code is
// rendered with monospace-friendly emphasis; URL is fully
// qualified so it survives copy/paste into any inbox.
const composeWelcomeEmail = (partner, columns) => {
  const url = partnerLandingHref(partner.slug);
  const pillarLabels = (columns || [])
    .filter((col) => (partner.feature_gates || {})[col.key])
    .map((col) => `  • ${col.label}`)
    .join('\n');
  const pillarLines = pillarLabels || '  • Your custom CarryOn feature set';
  const subject = `Welcome to CarryOn — your ${partner.company_name} portal is live`;
  const body = `Hi ${partner.company_name} team,

Your co-branded CarryOn partner portal is ready. Please share the
link and access code below with your members — anyone who signs up
through it will land in the custom experience we built for you.

Your partner portal
  ${url}

Member access code
  ${partner.code}

Included for your members
${pillarLines}

When a member creates their account, the final signup step will
ask for your access code. Once entered, they'll see only the
pillars listed above — exactly the package we negotiated.

Let me know when you'd like the first batch invited.

— The CarryOn team
  Powered by CarryOn Enterprises Inc.
`;
  return `${subject}\n\n${body}`;
};

export const PartnersTab = ({ getAuthHeaders }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [partners, setPartners] = useState([]);
  const [columns, setColumns] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({
    company_name: '', slug: '', code: '', discount_percent: 100,
    max_uses: 0, tagline: '', partner_email: '',
  });
  const [copied, setCopied] = useState(null);
  const fileInputs = useRef({});

  // Resolve auth headers fresh on every call. We read straight from
  // localStorage rather than the `getAuthHeaders` closure because the
  // AuthContext's `token` React state isn't always hydrated by the
  // time this component's first useEffect fires (race observed when
  // landing directly on `/admin/partners`). localStorage is the
  // single source of truth — AuthContext writes to it on login/OTP
  // verify and clears on logout, so reading it here is always correct.
  const authHeaders = () => {
    const t = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem('carryon_token')
      : null;
    return t ? { Authorization: `Bearer ${t}` } : (getAuthHeaders()?.headers || {});
  };

  const fetchAll = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/admin/partners`, { headers: authHeaders() });
      setPartners(data.partners || []);
      setColumns(data.feature_columns || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load partners');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createPartner = async () => {
    if (!newForm.company_name.trim() || !newForm.slug.trim() || !newForm.code.trim()) {
      toast.error('Company name, slug, and code are all required'); return;
    }
    setSaving(true);
    try {
      await axios.post(`${API_URL}/admin/partners`, {
        ...newForm,
        slug: newForm.slug.toLowerCase().trim(),
        code: newForm.code.toUpperCase().trim(),
      }, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
      setShowNew(false);
      setNewForm({ company_name: '', slug: '', code: '', discount_percent: 100, max_uses: 0, tagline: '', partner_email: '' });
      await fetchAll();
      toast.success('Partner created');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create partner');
    } finally { setSaving(false); }
  };

  const updatePartner = async (id, patch) => {
    // Optimistic UI: update the local row immediately so toggles feel
    // snappy. On failure we re-fetch to roll back.
    setPartners((prev) => prev.map(p => p.id === id ? { ...p, ...patch, feature_gates: { ...(p.feature_gates || {}), ...(patch.feature_gates || {}) } } : p));
    try {
      await axios.put(`${API_URL}/admin/partners/${id}`, patch, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update');
      await fetchAll();
    }
  };

  const toggleGate = (partner, featureKey) => {
    const next = !((partner.feature_gates || {})[featureKey]);
    updatePartner(partner.id, { feature_gates: { ...(partner.feature_gates || {}), [featureKey]: next } });
  };

  const deletePartner = async (id, name) => {
    if (!window.confirm(`Delete the partnership with "${name}"? This will remove their custom tier and the public /p/ page.`)) return;
    try {
      await axios.delete(`${API_URL}/admin/partners/${id}`, { headers: authHeaders() });
      await fetchAll();
      toast.success('Partner deleted');
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const uploadLogo = async (partnerId, file) => {
    if (!file) return;
    if (file.size > 1024 * 1024) { toast.error('Logo must be 1 MB or smaller'); return; }
    const fd = new FormData();
    fd.append('file', file);
    try {
      await axios.post(`${API_URL}/admin/partners/${partnerId}/logo`, fd, { headers: authHeaders() });
      toast.success('Logo uploaded');
      await fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Logo upload failed');
    }
  };

  const copy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1400);
  };

  // Copies a ready-to-send welcome email for the partner to the
  // clipboard. Email body is templated against the partner's CURRENT
  // toggle state, so re-tapping after flipping a feature on/off
  // generates fresh copy. Toast confirms the action since the
  // clipboard is invisible feedback otherwise.
  const copyWelcomeEmail = (partner) => {
    const text = composeWelcomeEmail(partner, columns);
    navigator.clipboard.writeText(text);
    setCopied(`${partner.id}:email`);
    setTimeout(() => setCopied(null), 1800);
    toast.success(`Welcome email copied — paste into your mail client`);
  };

  // Sends the welcome email directly via Resend to the partner's
  // stored `partner_email`. Same templated body as copyWelcomeEmail
  // (rendered HTML server-side). Confirms before sending so a
  // mis-tap doesn't accidentally email a customer; the row is
  // marked with the timestamp of the most recent send.
  const [sending, setSending] = useState(null);
  const sendWelcomeEmail = async (partner) => {
    const to = (partner.partner_email || '').trim();
    if (!to) {
      toast.error('Add a partner email to the row first');
      return;
    }
    if (!window.confirm(`Send the welcome email to ${to}?\n\nThis will deliver a CarryOn-branded message to your partner with their unique landing URL, access code, and enabled pillars.`)) {
      return;
    }
    setSending(partner.id);
    try {
      await axios.post(`${API_URL}/admin/partners/${partner.id}/send-welcome`, {}, {
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      });
      toast.success(`Welcome email sent to ${to}`);
      await fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send welcome email');
    } finally {
      setSending(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" data-testid="partners-loading">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in" data-testid="partners-tab">
      {/* Header card */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-[#8B5CF6]" />
                White-Label Partners
              </h3>
              <p className="text-sm text-[var(--t4)] mt-1">
                Each row is a B2B partnership. Toggle which pillars each partner offers to their clients,
                then share their unique <span className="font-mono text-[var(--gold)]">/p/&lt;slug&gt;</span> landing page.
              </p>
            </div>
            <Button size="sm" className="gold-button text-xs" onClick={() => setShowNew(true)} data-testid="add-partner-btn">
              <Plus className="w-3 h-3 mr-1" /> New Partner
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* New partner form */}
      {showNew && (
        <Card className="glass-card" style={{ borderColor: 'rgba(139,92,246,0.4)' }}>
          <CardContent className="p-5">
            <h4 className="text-sm font-bold text-[var(--t)] mb-3">Create New Partnership</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
              <div className="space-y-1">
                <Label className="text-xs text-[var(--t4)]">Company Name <span className="text-red-400">*</span></Label>
                <Input value={newForm.company_name} onChange={e => setNewForm({ ...newForm, company_name: e.target.value })}
                  placeholder="Acme Insurance" className="input-field text-sm" data-testid="new-partner-name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[var(--t4)]">URL Slug <span className="text-red-400">*</span></Label>
                <Input value={newForm.slug} onChange={e => setNewForm({ ...newForm, slug: e.target.value.toLowerCase() })}
                  placeholder="acme-insurance" className="input-field text-sm" data-testid="new-partner-slug" />
                <p className="text-[11px] text-[var(--t5)]">Landing page: /p/{newForm.slug || 'your-slug'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[var(--t4)]">Enterprise Code <span className="text-red-400">*</span></Label>
                <Input value={newForm.code} onChange={e => setNewForm({ ...newForm, code: e.target.value.toUpperCase() })}
                  placeholder="ACME2026" className="input-field text-sm" data-testid="new-partner-code" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[var(--t4)]">Discount %</Label>
                <Input type="number" min={0} max={100} value={newForm.discount_percent}
                  onChange={e => setNewForm({ ...newForm, discount_percent: parseInt(e.target.value) || 0 })}
                  className="input-field text-sm" />
                <p className="text-[11px] text-[var(--t5)]">100 = free for all their members</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[var(--t4)]">Max Uses</Label>
                <Input type="number" min={0} value={newForm.max_uses}
                  onChange={e => setNewForm({ ...newForm, max_uses: parseInt(e.target.value) || 0 })}
                  className="input-field text-sm" />
                <p className="text-[11px] text-[var(--t5)]">0 = unlimited</p>
              </div>
              <div className="space-y-1 md:col-span-2 lg:col-span-3">
                <Label className="text-xs text-[var(--t4)]">Landing Page Tagline</Label>
                <Input value={newForm.tagline} onChange={e => setNewForm({ ...newForm, tagline: e.target.value })}
                  placeholder="Acme Insurance members get the full CarryOn family preparedness platform — included with your policy."
                  className="input-field text-sm" maxLength={280} />
                <p className="text-[11px] text-[var(--t5)]">Appears under the hero on /p/&lt;slug&gt; · 280 chars max</p>
              </div>
              <div className="space-y-1 md:col-span-2 lg:col-span-3">
                <Label className="text-xs text-[var(--t4)]">Partner Contact Email <span className="text-[var(--t6)]">(optional)</span></Label>
                <Input type="email" value={newForm.partner_email}
                  onChange={e => setNewForm({ ...newForm, partner_email: e.target.value })}
                  placeholder="ops@acme-insurance.com"
                  className="input-field text-sm" maxLength={120}
                  data-testid="new-partner-email" />
                <p className="text-[11px] text-[var(--t5)]">Used to send the welcome email directly via Resend.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="gold-button text-xs" onClick={createPartner} disabled={saving} data-testid="save-new-partner-btn">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Create Partner'}
              </Button>
              <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Partner matrix */}
      {partners.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-10 text-center">
            <Briefcase className="w-10 h-10 mx-auto text-[var(--t5)] mb-3" />
            <p className="text-sm text-[var(--t4)]">No partnerships yet. Click <span className="font-bold text-[var(--gold)]">New Partner</span> above to create your first one.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 1100 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--b)' }}>
                  <th className="text-left px-4 py-3 font-bold text-[var(--t4)] text-xs uppercase tracking-wider sticky left-0 bg-[var(--bg)] z-10" style={{ minWidth: 320 }}>
                    Partner
                  </th>
                  {columns.map(col => (
                    <th key={col.key} className="px-2 py-3 font-bold text-[var(--t4)] text-[11px] uppercase tracking-wider text-center" style={{ minWidth: 78 }} title={col.label}>
                      {col.label.split(' ').slice(0, 2).join(' ')}
                    </th>
                  ))}
                  <th className="px-3 py-3 font-bold text-[var(--t4)] text-xs uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {partners.map(partner => (
                  <PartnerRow
                    key={partner.id}
                    partner={partner}
                    columns={columns}
                    authHeaders={authHeaders}
                    fileInputs={fileInputs}
                    onUpdate={updatePartner}
                    onToggleGate={toggleGate}
                    onUploadLogo={uploadLogo}
                    onDelete={deletePartner}
                    onCopy={copy}
                    onCopyEmail={copyWelcomeEmail}
                    onSendEmail={sendWelcomeEmail}
                    sending={sending}
                    copied={copied}
                  />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

function PartnerRow({ partner, columns, fileInputs, onUpdate, onToggleGate, onUploadLogo, onDelete, onCopy, onCopyEmail, onSendEmail, sending, copied }) {
  const [draft, setDraft] = useState({
    company_name: partner.company_name,
    slug: partner.slug,
    code: partner.code,
    discount_percent: partner.discount_percent,
    tagline: partner.tagline || '',
    partner_email: partner.partner_email || '',
  });
  // Re-sync local draft state whenever the persisted partner doc
  // changes from outside (e.g. after a toggle triggers re-fetch).
  // Without this the row would keep stale slug/code text after edits
  // elsewhere in the same session.
  useEffect(() => {
    setDraft({
      company_name: partner.company_name,
      slug: partner.slug,
      code: partner.code,
      discount_percent: partner.discount_percent,
      tagline: partner.tagline || '',
      partner_email: partner.partner_email || '',
    });
  }, [partner.company_name, partner.slug, partner.code, partner.discount_percent, partner.tagline, partner.partner_email]);

  const url = partnerLandingHref(partner.slug);
  const logoUrl = partner.logo_key
    ? `${API_URL}/public/partners/${partner.slug}/logo?v=${encodeURIComponent(partner.updated_at || '')}`
    : null;

  const commit = (field) => {
    if (draft[field] === partner[field] || (draft[field] === '' && !partner[field])) return;
    onUpdate(partner.id, { [field]: draft[field] });
  };

  return (
    <tr style={{ borderBottom: '1px solid var(--b)' }} data-testid={`partner-row-${partner.slug}`}>
      <td className="px-4 py-3 sticky left-0 bg-[var(--bg)] z-10" style={{ minWidth: 320 }}>
        <div className="flex items-start gap-3">
          {/* Logo */}
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt={partner.company_name} className="w-12 h-12 rounded-lg object-contain bg-white p-1" />
            ) : (
              LOGO_PLACEHOLDER
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              ref={(el) => { fileInputs.current[partner.id] = el; }}
              onChange={(e) => onUploadLogo(partner.id, e.target.files?.[0])}
              className="hidden"
              data-testid={`partner-logo-input-${partner.slug}`}
            />
            <button
              onClick={() => fileInputs.current[partner.id]?.click()}
              className="text-[10px] font-bold text-[var(--gold)] hover:text-[#fcd34d] flex items-center gap-0.5"
              data-testid={`partner-logo-upload-${partner.slug}`}
            >
              <Upload className="w-2.5 h-2.5" /> {partner.logo_key ? 'Replace' : 'Upload'}
            </button>
          </div>
          {/* Identity */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <Input
              value={draft.company_name}
              onChange={e => setDraft({ ...draft, company_name: e.target.value })}
              onBlur={() => commit('company_name')}
              className="input-field text-sm font-bold h-8"
              data-testid={`partner-name-${partner.slug}`}
            />
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <Input
                  value={draft.slug}
                  onChange={e => setDraft({ ...draft, slug: e.target.value.toLowerCase() })}
                  onBlur={() => commit('slug')}
                  className="input-field text-xs h-7 font-mono"
                  placeholder="slug"
                />
              </div>
              <div>
                <Input
                  value={draft.code}
                  onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                  onBlur={() => commit('code')}
                  className="input-field text-xs h-7 font-mono"
                  placeholder="CODE"
                  data-testid={`partner-code-${partner.slug}`}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <Input
                  type="number" min={0} max={100}
                  value={draft.discount_percent}
                  onChange={e => setDraft({ ...draft, discount_percent: parseInt(e.target.value) || 0 })}
                  onBlur={() => commit('discount_percent')}
                  className="input-field text-xs h-7"
                  placeholder="Discount %"
                  title="Discount %"
                />
              </div>
              <div className="flex items-center text-[11px] text-[var(--t5)]">
                {partner.times_used}{partner.max_uses > 0 ? `/${partner.max_uses}` : ''} used
              </div>
            </div>
            <Input
              value={draft.tagline}
              onChange={e => setDraft({ ...draft, tagline: e.target.value })}
              onBlur={() => commit('tagline')}
              className="input-field text-xs h-7"
              placeholder="Landing page tagline (shown under hero)"
              maxLength={280}
              data-testid={`partner-tagline-${partner.slug}`}
            />
            <Input
              type="email"
              value={draft.partner_email}
              onChange={e => setDraft({ ...draft, partner_email: e.target.value })}
              onBlur={() => commit('partner_email')}
              className="input-field text-xs h-7"
              placeholder="Partner contact email (e.g. ops@acme-insurance.com)"
              maxLength={120}
              data-testid={`partner-email-${partner.slug}`}
            />
            <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="font-mono text-[var(--gold)] hover:text-[#fcd34d] truncate flex items-center gap-1 max-w-[200px]"
                data-testid={`partner-url-${partner.slug}`}
                title={url}>
                <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate">/p/{partner.slug}</span>
              </a>
              <button onClick={() => onCopy(url, partner.id)} className="text-[var(--t5)] hover:text-[var(--t)]"
                title="Copy partner URL">
                {copied === partner.id ? <Check className="w-3 h-3 text-[var(--gn2)]" /> : <Copy className="w-3 h-3" />}
              </button>
              <span className="text-[var(--t6)]">·</span>
              <button
                onClick={() => onCopyEmail(partner)}
                className="text-[var(--t5)] hover:text-[#a78bfa] flex items-center gap-1 font-semibold"
                title="Copy ready-to-send welcome email to your clipboard"
                data-testid={`partner-copy-email-${partner.slug}`}
              >
                {copied === `${partner.id}:email` ? (
                  <><Check className="w-3 h-3 text-[var(--gn2)]" /> Copied</>
                ) : (
                  <><Copy className="w-3 h-3" /> Copy email</>
                )}
              </button>
              <span className="text-[var(--t6)]">·</span>
              <button
                onClick={() => onSendEmail(partner)}
                disabled={sending === partner.id || !partner.partner_email}
                className="flex items-center gap-1 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ color: partner.partner_email ? '#34d399' : 'var(--t6)' }}
                title={partner.partner_email
                  ? `Send via Resend to ${partner.partner_email}`
                  : 'Add a partner email above first'}
                data-testid={`partner-send-email-${partner.slug}`}
              >
                {sending === partner.id ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Sending…</>
                ) : (
                  <><Send className="w-3 h-3" /> Send via Resend</>
                )}
              </button>
              {partner.welcome_email_last_sent_at && (
                <span className="text-[10px] text-[var(--t5)] italic" title={`Last sent ${partner.welcome_email_last_sent_at}`}>
                  · sent {new Date(partner.welcome_email_last_sent_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Feature toggle cells */}
      {columns.map(col => {
        const enabled = !!(partner.feature_gates || {})[col.key];
        return (
          <td key={col.key} className="px-2 py-3 text-center align-middle">
            <Switch
              checked={enabled}
              onCheckedChange={() => onToggleGate(partner, col.key)}
              data-testid={`partner-gate-${partner.slug}-${col.key}`}
              aria-label={`Toggle ${col.label} for ${partner.company_name}`}
            />
          </td>
        );
      })}

      {/* Actions */}
      <td className="px-3 py-3 text-right align-middle">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onUpdate(partner.id, { active: !partner.active })}
            className="flex items-center gap-1 text-[11px] font-bold"
            style={{ color: partner.active ? 'var(--gn2)' : 'var(--t5)' }}
            title={partner.active ? 'Active' : 'Inactive'}
            data-testid={`partner-active-${partner.slug}`}
          >
            <Power className="w-3.5 h-3.5" />
            {partner.active ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => onDelete(partner.id, partner.company_name)}
            className="text-[var(--t5)] hover:text-[var(--rd)]"
            aria-label={`Delete ${partner.company_name}`}
            data-testid={`partner-delete-${partner.slug}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default PartnersTab;
