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
import apiClient from '../../utils/apiClient';
import {
  Briefcase, Plus, Trash2, Copy, Check, Loader2, ExternalLink,
  Upload, Image as ImageIcon, Power, Send, Pencil, Users,
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
      background: 'rgba(var(--gold-rgb), 0.08)',
      border: '1px dashed rgba(var(--gold-rgb), 0.35)',
      color: 'rgba(var(--gold-rgb), 0.7)',
    }}
  >
    <ImageIcon className="w-4 h-4 mb-0.5" />
    <span className="text-[11px] font-semibold leading-none">LOGO</span>
  </div>
);

const partnerLandingHref = (slug) => `${window.location.origin}/p/${slug}`;

// Strict slug sanitizer — accepts any human-typed input (URLs, pasted
// text, company names with spaces, etc.) and returns ONLY the
// canonical "web-page-name" form: lowercase letters, numbers, single
// hyphens; no leading/trailing hyphens; max 50 chars. Used both
// while typing (live cleanup) AND on blur (final scrub). Designed
// so non-developer admins can paste literally anything ("Acme Inc.",
// "https://www.acme.com", "/p/acme") and still get a valid value.
const sanitizeSlug = (raw) => {
  if (!raw) return '';
  let s = String(raw).toLowerCase().trim();
  // Drop URL scheme, www, /p/ prefix the user might have copied
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/^\/+/, '').replace(/^p\//, '');
  // Drop common TLD-y trailing fragments people paste
  s = s.replace(/\.(com|net|org|io|co|us|app|ai)\b.*$/i, '');
  // Any run of non-alphanumeric → single hyphen
  s = s.replace(/[^a-z0-9]+/g, '-');
  // Trim leading/trailing hyphens
  s = s.replace(/^-+|-+$/g, '');
  // Cap length
  return s.slice(0, 50);
};

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
  // Which gate set the matrix edits: a partner's tailored tier (normal
  // operation) or their FREE tier (used when platform-wide Free Mode is ON).
  const [gateMode, setGateMode] = useState('tailored');
  const gateField = gateMode === 'free' ? 'free_feature_gates' : 'feature_gates';
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({
    company_name: '', slug: '', code: '', discount_percent: 100,
    max_uses: 0, tagline: '', partner_email: '',
  });
  const [copied, setCopied] = useState(null);
  const fileInputs = useRef({});
  // Legacy `b2b_codes` rows — the old system that's been retired.
  // We surface them here read-only so admins can audit + delete any
  // stragglers from a single place without ever touching Mongo.
  // Empty array on a clean install (which is the norm).
  const [legacyCodes, setLegacyCodes] = useState([]);

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
      const { data } = await apiClient.get(`${API_URL}/admin/partners`, { headers: authHeaders() });
      setPartners(data.partners || []);
      setColumns(data.feature_columns || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load partners');
    } finally {
      setLoading(false);
    }
    // Best-effort legacy fetch — never blocks the main load.
    try {
      const r = await apiClient.get(`${API_URL}/admin/b2b-codes`, { headers: authHeaders() });
      setLegacyCodes(Array.isArray(r.data) ? r.data : []);
    } catch { setLegacyCodes([]); }
  };

  const deleteLegacy = async (codeId, codeName) => {
    if (!window.confirm(`Delete legacy code "${codeName}"? This removes it permanently.`)) return;
    try {
      await apiClient.delete(`${API_URL}/admin/b2b-codes/${codeId}`, { headers: authHeaders() });
      setLegacyCodes((prev) => prev.filter((c) => c.id !== codeId));
      toast.success('Legacy code deleted');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete legacy code');
    }
  };
  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createPartner = async () => {
    if (!newForm.company_name.trim() || !newForm.slug.trim() || !newForm.code.trim()) {
      toast.error('Company name, slug, and code are all required'); return;
    }
    setSaving(true);
    try {
      await apiClient.post(`${API_URL}/admin/partners`, {
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
    // snappy. On failure we re-fetch to roll back. Merge whichever gate
    // map was patched (tailored or free) so partial gate updates don't
    // clobber the other field.
    setPartners((prev) => prev.map(p => {
      if (p.id !== id) return p;
      const merged = { ...p, ...patch };
      if (patch.feature_gates) merged.feature_gates = { ...(p.feature_gates || {}), ...patch.feature_gates };
      if (patch.free_feature_gates) merged.free_feature_gates = { ...(p.free_feature_gates || {}), ...patch.free_feature_gates };
      return merged;
    }));
    try {
      await apiClient.put(`${API_URL}/admin/partners/${id}`, patch, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update');
      await fetchAll();
    }
  };

  const toggleGate = (partner, featureKey) => {
    const current = partner[gateField] || {};
    const next = !current[featureKey];
    updatePartner(partner.id, { [gateField]: { ...current, [featureKey]: next } });
  };

  const deletePartner = async (id, name) => {
    if (!window.confirm(`Delete the partnership with "${name}"? This will remove their custom tier and the public /p/ page.`)) return;
    try {
      await apiClient.delete(`${API_URL}/admin/partners/${id}`, { headers: authHeaders() });
      await fetchAll();
      toast.success('Partner deleted');
    } catch (_err) {
      toast.error('Failed to delete');
    }
  };

  const uploadLogo = async (partnerId, file) => {
    if (!file) return;
    if (file.size > 1024 * 1024) { toast.error('Logo must be 1 MB or smaller'); return; }
    const fd = new FormData();
    fd.append('file', file);
    try {
      await apiClient.post(`${API_URL}/admin/partners/${partnerId}/logo`, fd, { headers: authHeaders() });
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
      await apiClient.post(`${API_URL}/admin/partners/${partner.id}/send-welcome`, {}, {
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
                {gateMode === 'free' ? (
                  <>Editing each partner&apos;s <span className="font-semibold" style={{ color: '#4ADE80' }}>Free tier</span> —
                  the features their members receive when the platform-wide <span className="font-semibold">Free</span> toggle is ON.</>
                ) : (
                  <>Editing each partner&apos;s <span className="font-semibold text-[#8B5CF6]">tailored tier</span> — the pillars
                  they offer their clients during normal (paid) operation.</>
                )}
              </p>
            </div>
            <Button size="sm" className="gold-button text-xs" onClick={() => setShowNew(true)} data-testid="add-partner-btn">
              <Plus className="w-3 h-3 mr-1" /> New Partner
            </Button>
          </div>

          {/* Tier editing mode switch */}
          <div className="mt-4 inline-flex rounded-lg p-0.5" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid="partner-gate-mode-switch">
            <button
              onClick={() => setGateMode('tailored')}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
              style={gateMode === 'tailored'
                ? { background: 'rgba(139,92,246,0.18)', color: '#8B5CF6', border: '1px solid rgba(139,92,246,0.4)' }
                : { background: 'transparent', color: 'var(--t4)', border: '1px solid transparent' }}
              data-testid="partner-gate-mode-tailored"
            >
              Tailored tier
            </button>
            <button
              onClick={() => setGateMode('free')}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5"
              style={gateMode === 'free'
                ? { background: 'rgba(74,222,128,0.15)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.4)' }
                : { background: 'transparent', color: 'var(--t4)', border: '1px solid transparent' }}
              data-testid="partner-gate-mode-free"
            >
              {gateMode === 'free' && (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#4ADE80', boxShadow: '0 0 6px rgba(74,222,128,0.8)' }} />
              )}
              Free tier
            </button>
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
                <Input
                  value={newForm.company_name}
                  onChange={e => {
                    const next = e.target.value;
                    setNewForm((prev) => ({
                      ...prev,
                      company_name: next,
                      // Auto-fill the web-page name from the company
                      // name UNTIL the user has manually edited the
                      // slug field. Once they touch it, we stop
                      // tracking. Detected by comparing the current
                      // slug to the sanitized version of the PRIOR
                      // company name — matches → still auto.
                      slug: (!prev.slug || prev.slug === sanitizeSlug(prev.company_name))
                        ? sanitizeSlug(next)
                        : prev.slug,
                    }));
                  }}
                  placeholder="Acme Insurance"
                  className="input-field text-sm"
                  data-testid="new-partner-name"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[var(--t4)]">Partner Web Page Name <span className="text-red-400">*</span></Label>
                <Input
                  value={newForm.slug}
                  onChange={e => setNewForm({ ...newForm, slug: sanitizeSlug(e.target.value) })}
                  onBlur={e => setNewForm({ ...newForm, slug: sanitizeSlug(e.target.value) })}
                  placeholder="acme-insurance"
                  className="input-field text-sm"
                  data-testid="new-partner-slug"
                />
                <p className="text-[11px] text-[var(--t5)]">
                  Their landing page will live at:
                  {' '}
                  <span className="font-mono text-[var(--gold)]">
                    {window.location.origin}/p/{newForm.slug || 'acme-insurance'}
                  </span>
                </p>
                <p className="text-[11px] text-[var(--t5)]">
                  Lowercase letters, numbers and hyphens only — we&apos;ll auto-clean anything you paste.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[var(--t4)]">Enterprise Code <span className="text-red-400">*</span></Label>
                <Input value={newForm.code} onChange={e => setNewForm({ ...newForm, code: e.target.value.toUpperCase() })}
                  placeholder="ACME2026" className="input-field text-sm" data-testid="new-partner-code" />
                <p className="text-[11px] text-[var(--t5)]">The code your partner&apos;s members type at signup to unlock their plan.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[var(--t4)]">Discount %</Label>
                <Input type="number" min={0} max={100} value={newForm.discount_percent}
                  onChange={e => setNewForm({ ...newForm, discount_percent: parseInt(e.target.value) || 0 })}
                  className="input-field text-sm" />
                <p className="text-[11px] text-[var(--t5)]">100 = free for all their members</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[var(--t4)]">Users Authorized</Label>
                <Input type="number" min={0} value={newForm.max_uses}
                  onChange={e => setNewForm({ ...newForm, max_uses: parseInt(e.target.value) || 0 })}
                  className="input-field text-sm" data-testid="new-partner-max-users" />
                <p className="text-[11px] text-[var(--t5)]">Number of user subscriptions the partner is paying for. 0 = unlimited.</p>
              </div>
              <div className="space-y-1 md:col-span-2 lg:col-span-3">
                <Label className="text-xs text-[var(--t4)]">Landing Page Tagline</Label>
                <Input value={newForm.tagline} onChange={e => setNewForm({ ...newForm, tagline: e.target.value })}
                  placeholder="Acme Insurance members get the full CarryOn family continuity platform — included with your policy."
                  className="input-field text-sm" maxLength={280} />
                <p className="text-[11px] text-[var(--t5)]">Appears under the partner&apos;s logo on their landing page · 280 chars max</p>
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
                    gateField={gateField}
                    gateMode={gateMode}
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

      {/* Legacy codes panel — only shown when stragglers exist in
          the retired `b2b_codes` collection. Read-only audit
          surface; admins can delete each row but not edit. Empty
          on a clean install. */}
      {legacyCodes.length > 0 && (
        <Card className="glass-card" style={{ borderColor: 'rgba(245,158,11,0.25)' }} data-testid="partners-legacy-codes">
          <CardContent className="p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.12)' }}>
                <Briefcase className="w-4 h-4 text-[#F59E0B]" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-[var(--t)]">Legacy B2B Codes ({legacyCodes.length})</h4>
                <p className="text-[11px] text-[var(--t5)] mt-0.5 leading-relaxed">
                  These codes were created in the older B2B system that&apos;s now retired. They&apos;re
                  read-only and can no longer be redeemed. Delete each row once you&apos;ve reissued the
                  partnership through the table above.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              {legacyCodes.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[var(--s)]" data-testid={`legacy-code-${c.id}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="font-mono font-bold text-sm text-[#F59E0B]">{c.code}</span>
                    {c.partner_name && <span className="text-xs text-[var(--t4)] truncate">{c.partner_name}</span>}
                    <span className="text-[11px] text-[var(--t5)]">
                      {c.discount_percent >= 100 ? 'Free' : `${c.discount_percent}% off`}
                      {' · '}{c.times_used || 0}{c.max_uses > 0 ? ` of ${c.max_uses}` : ''} users
                    </span>
                  </div>
                  <button
                    onClick={() => deleteLegacy(c.id, c.code)}
                    className="text-[var(--t5)] hover:text-[var(--rd)] flex-shrink-0"
                    aria-label={`Delete legacy code ${c.code}`}
                    data-testid={`legacy-code-delete-${c.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

function PartnerRow({ partner, columns, gateField, gateMode, fileInputs, onUpdate, onToggleGate, onUploadLogo, onDelete, onCopy, onCopyEmail, onSendEmail, sending, copied }) {
  // Pre-pitch UX (May 20, 2026): default partner rows to a read-only
  // identity view with pencil + trash icons next to the logo. Tap the
  // pencil to expand into the editable Input fields. Keeps rows
  // compact so the founder portal scales to many partner rows.
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState({
    company_name: partner.company_name,
    slug: partner.slug,
    code: partner.code,
    discount_percent: partner.discount_percent,
    max_uses: partner.max_uses || 0,
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
      max_uses: partner.max_uses || 0,
      tagline: partner.tagline || '',
      partner_email: partner.partner_email || '',
    });
  }, [partner.company_name, partner.slug, partner.code, partner.discount_percent, partner.max_uses, partner.tagline, partner.partner_email]);

  const url = partnerLandingHref(partner.slug);
  // Logo is now embedded as a base64 data URL in the API response.
  // No more separate image fetch, no more browser cache races, no
  // more 404 ghosts. Falls back to a legacy URL (in case any partner
  // doc predates the inline encoding rollout) and finally null.
  const logoUrl = partner.logo_data_url
    || (partner.logo_key
      ? `${API_URL}/public/partners/${partner.slug}/logo?v=${encodeURIComponent(partner.updated_at || '')}`
      : null);

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
              <img
                key={logoUrl}
                src={logoUrl}
                alt={partner.company_name}
                className="w-12 h-12 rounded-lg object-contain bg-white p-1"
                data-testid={`partner-logo-img-${partner.slug}`}
              />
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
              className="text-[11px] font-bold text-[var(--gold)] hover:text-[#fcd34d] flex items-center gap-0.5"
              data-testid={`partner-logo-upload-${partner.slug}`}
            >
              <Upload className="w-2.5 h-2.5" /> {partner.logo_key ? 'Replace' : 'Upload'}
            </button>
            <div className="flex items-center gap-2 mt-0.5">
              <button
                onClick={() => setEditMode((v) => !v)}
                className={`p-1 rounded ${editMode ? 'bg-[var(--gold)] text-[#080e1a]' : 'text-[var(--t5)] hover:text-[var(--gold)]'}`}
                title={editMode ? 'Done editing' : 'Edit partner'}
                aria-label={editMode ? `Stop editing ${partner.company_name}` : `Edit ${partner.company_name}`}
                data-testid={`partner-edit-${partner.slug}`}
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={() => onDelete(partner.id, partner.company_name)}
                className="p-1 rounded text-[var(--t5)] hover:text-[var(--rd)]"
                title="Delete partner"
                aria-label={`Delete ${partner.company_name}`}
                data-testid={`partner-delete-${partner.slug}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
          {/* Identity */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {!editMode ? (
              <>
                <div className="text-sm font-bold text-[var(--t)] truncate" data-testid={`partner-name-display-${partner.slug}`}>
                  {partner.company_name}
                </div>
                <div className="text-[11px] text-[var(--t5)] flex flex-wrap gap-x-2 gap-y-0.5">
                  <span className="font-mono">/p/{partner.slug}</span>
                  <span>·</span>
                  <span className="font-mono">{partner.code}</span>
                  <span>·</span>
                  <span>{partner.discount_percent}% off</span>
                  <span>·</span>
                  <span>{partner.max_uses > 0 ? `${partner.max_uses} seats` : 'unlimited'}</span>
                </div>
                {partner.tagline && (
                  <div className="text-[11px] text-[var(--t4)] italic truncate" title={partner.tagline}>
                    {partner.tagline}
                  </div>
                )}
                {partner.partner_email && (
                  <div className="text-[11px] text-[var(--t4)] truncate" title={partner.partner_email}>
                    {partner.partner_email}
                  </div>
                )}
              </>
            ) : (
            <>
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
                  onChange={e => setDraft({ ...draft, slug: sanitizeSlug(e.target.value) })}
                  onBlur={() => commit('slug')}
                  className="input-field text-xs h-7 font-mono"
                  placeholder="web-page-name"
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
              <div className="relative">
                <Input
                  type="number" min={0} max={100}
                  value={draft.discount_percent}
                  onChange={e => setDraft({ ...draft, discount_percent: parseInt(e.target.value) || 0 })}
                  onBlur={() => commit('discount_percent')}
                  className="input-field text-xs h-7 pr-12"
                  placeholder="Discount"
                  title="Discount the partner receives off retail (100 = free)"
                  data-testid={`partner-discount-${partner.slug}`}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--t5)] uppercase font-bold tracking-wider pointer-events-none">% off</span>
              </div>
              <div className="relative" title="Number of user subscriptions the partner is paying for (0 = unlimited)">
                <Input
                  type="number" min={0}
                  value={draft.max_uses}
                  onChange={e => setDraft({ ...draft, max_uses: parseInt(e.target.value) || 0 })}
                  onBlur={() => commit('max_uses')}
                  className="input-field text-xs h-7 pr-12"
                  placeholder="Users"
                  data-testid={`partner-max-users-${partner.slug}`}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--t5)] uppercase font-bold tracking-wider pointer-events-none">
                  <Pencil className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" /> seats
                </span>
              </div>
            </div>
            {/* Live seat utilization — count of users currently
                linked via partner_id (decoded server-side). When
                max_uses = 0 we show "unlimited". Shown only in edit
                mode (the read-only header above already shows seat
                count compactly). */}
            <div className="text-[11px] text-[var(--t5)] flex items-center gap-1.5 flex-wrap" data-testid={`partner-seats-${partner.slug}`}>
              <Users className="w-3 h-3" />
              <span>
                <span className={`font-bold ${partner.max_uses > 0 && partner.active_users_count >= partner.max_uses ? 'text-[var(--rd)]' : 'text-[var(--gold)]'}`}>
                  {partner.active_users_count || 0}
                </span>
                {' '}of{' '}
                <span className="font-bold text-[var(--t3)]">
                  {partner.max_uses > 0 ? partner.max_uses : '∞'}
                </span>
                {' '}users active
              </span>
              {partner.max_uses > 0 && partner.active_users_count >= partner.max_uses && (
                <span className="text-[var(--rd)] font-bold">· FULL</span>
              )}
              {partner.times_used > (partner.active_users_count || 0) && (
                <span className="text-[var(--t6)]" title="Lifetime redemptions — some users may have been deleted">
                  · {partner.times_used} lifetime
                </span>
              )}
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
            </>
            )}
            {/* Live seat utilization (always visible) */}
            <div className="text-[11px] text-[var(--t5)] flex items-center gap-1.5 flex-wrap" data-testid={`partner-seats-live-${partner.slug}`}>
              <Users className="w-3 h-3" />
              <span>
                <span className={`font-bold ${partner.max_uses > 0 && partner.active_users_count >= partner.max_uses ? 'text-[var(--rd)]' : 'text-[var(--gold)]'}`}>
                  {partner.active_users_count || 0}
                </span>
                {' '}of{' '}
                <span className="font-bold text-[var(--t3)]">
                  {partner.max_uses > 0 ? partner.max_uses : '∞'}
                </span>
                {' '}users active
              </span>
            </div>
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
                <span className="text-[11px] text-[var(--t5)] italic" title={`Last sent ${partner.welcome_email_last_sent_at}`}>
                  · sent {new Date(partner.welcome_email_last_sent_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Feature toggle cells */}
      {columns.map(col => {
        const enabled = !!(partner[gateField] || {})[col.key];
        return (
          <td key={col.key} className="px-2 py-3 text-center align-middle">
            <Switch
              checked={enabled}
              onCheckedChange={() => onToggleGate(partner, col.key)}
              data-testid={`partner-gate-${gateMode}-${partner.slug}-${col.key}`}
              aria-label={`Toggle ${col.label} (${gateMode} tier) for ${partner.company_name}`}
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
        </div>
      </td>
    </tr>
  );
}

export default PartnersTab;
