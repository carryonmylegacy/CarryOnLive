/**
 * PartnerEditPage — full-page editor for one B2B partner
 * (/admin/partners/:partnerId/edit, founder-only via the admin route
 * guard). Replaces the old cramped inline-edit inputs in the Partners
 * table: every parameter is shown in full view with big, readable
 * fields and an explicit Save button so nothing gets committed by
 * accident. Single-column on mobile — PWA-friendly.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import {
  ArrowLeft, Loader2, Save, Upload, Image as ImageIcon, Power, Trash2,
  ExternalLink, Copy, Check, KeyRound, DollarSign, UserPlus, X, Users,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import { toast } from '../utils/toast';
import { PartnerRevShareModal } from '../components/admin/PartnerRevShareModal';
import { PartnerManagersModal } from '../components/admin/PartnerManagersModal';
import { sanitizeSlug, partnerLandingHref } from '../components/admin/PartnersTab';
import { API_URL } from '../config';

const authHeaders = () => {
  const t = typeof window !== 'undefined' ? window.localStorage.getItem('carryon_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const EMPTY_FORM = {
  company_name: '', slug: '', code: '', discount_percent: 0,
  revshare_percent: 0, max_uses: 0, tagline: '', partner_email: '',
};

const SectionCard = ({ title, subtitle, children, testid }) => (
  <div className="glass-card p-5 lg:p-6" data-testid={testid}>
    <h2 className="text-base font-bold text-[var(--t)]">{title}</h2>
    {subtitle && <p className="text-[12px] text-[var(--t4)] mt-0.5 mb-4">{subtitle}</p>}
    {!subtitle && <div className="mb-4" />}
    {children}
  </div>
);

export default function PartnerEditPage() {
  const { partnerId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState(null);
  const [columns, setColumns] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gateMode, setGateMode] = useState('tailored');
  const gateField = gateMode === 'free' ? 'free_feature_gates' : 'feature_gates';
  const [showRevShare, setShowRevShare] = useState(false);
  const [showManagers, setShowManagers] = useState(false);
  const [repEmail, setRepEmail] = useState('');
  const [repBusy, setRepBusy] = useState(false);

  const hydrateForm = (p) => setForm({
    company_name: p.company_name || '',
    slug: p.slug || '',
    code: p.code || '',
    discount_percent: p.discount_percent ?? 0,
    revshare_percent: p.revshare_percent || 0,
    max_uses: p.max_uses || 0,
    tagline: p.tagline || '',
    partner_email: p.partner_email || '',
  });

  const fetchAll = useCallback(async ({ hydrate = true } = {}) => {
    try {
      const { data } = await apiClient.get(`${API_URL}/admin/partners/${partnerId}`, { headers: authHeaders() });
      setPartner(data.partner || null);
      setColumns(data.feature_columns || []);
      if (data.partner && hydrate) hydrateForm(data.partner);
    } catch (err) {
      if (err.response?.status === 404) setPartner(null);
      else toast.error(err.response?.data?.detail || 'Failed to load partner');
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const dirty = partner && (
    form.company_name !== (partner.company_name || '')
    || form.slug !== (partner.slug || '')
    || form.code !== (partner.code || '')
    || Number(form.discount_percent) !== Number(partner.discount_percent ?? 0)
    || Number(form.revshare_percent) !== Number(partner.revshare_percent || 0)
    || Number(form.max_uses) !== Number(partner.max_uses || 0)
    || form.tagline !== (partner.tagline || '')
    || form.partner_email !== (partner.partner_email || '')
  );

  const save = async () => {
    if (!form.company_name.trim() || !form.slug.trim() || !form.code.trim()) {
      toast.error('Company name, page name, and access code are all required');
      return;
    }
    setSaving(true);
    const body = {
      ...form,
      slug: sanitizeSlug(form.slug),
      code: form.code.toUpperCase().trim(),
      discount_percent: Number(form.discount_percent) || 0,
      revshare_percent: Number(form.revshare_percent) || 0,
      max_uses: Number(form.max_uses) || 0,
    };
    try {
      await apiClient.put(`${API_URL}/admin/partners/${partnerId}`, body, {
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      });
      // Reflect immediately — never leave the UI waiting on a refetch
      // that can queue for seconds behind other in-flight requests.
      setPartner(prev => ({ ...prev, ...body }));
      setForm(f => ({ ...f, slug: body.slug, code: body.code }));
      toast.success('Partner saved');
      fetchAll({ hydrate: false });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Optimistic toggle semantics (active flag + feature gates): flip the
  // UI instantly, revert on failure. Iter175 found the label appearing
  // "stuck" because the PUT + refetch round-trip can queue for seconds
  // behind the app's other in-flight requests. `patching` serializes
  // the PUTs — overlapping toggles were completing out of order
  // server-side and leaving the partner in the wrong state.
  const [patching, setPatching] = useState(false);
  const patch = async (body, okMsg, revert) => {
    if (patching) return;
    setPatching(true);
    setPartner(prev => ({ ...prev, ...body }));
    try {
      await apiClient.put(`${API_URL}/admin/partners/${partnerId}`, body, {
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      });
      if (okMsg) toast.success(okMsg);
    } catch (err) {
      setPartner(prev => ({ ...prev, ...revert }));
      toast.error(err.response?.data?.detail || 'Failed to update');
    } finally {
      setPatching(false);
    }
  };

  const toggleGate = (key) => {
    const current = partner[gateField] || {};
    patch(
      { [gateField]: { ...current, [key]: !current[key] } },
      null,
      { [gateField]: current },
    );
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    if (file.size > 1024 * 1024) { toast.error('Logo must be 1 MB or smaller'); return; }
    const fd = new FormData();
    fd.append('file', file);
    try {
      await apiClient.post(`${API_URL}/admin/partners/${partnerId}/logo`, fd, { headers: authHeaders() });
      toast.success('Logo uploaded');
      await fetchAll({ hydrate: false });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Logo upload failed');
    }
  };

  const linkRep = async () => {
    const email = repEmail.trim();
    if (!email) { toast.error('Enter the rep\u2019s account email'); return; }
    setRepBusy(true);
    try {
      await apiClient.post(`${API_URL}/admin/partners/${partnerId}/link-rep`, { email }, {
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      });
      toast.success('Rep linked — they now see Client Setup in their portal');
      setRepEmail('');
      await fetchAll({ hydrate: false });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to link rep');
    } finally { setRepBusy(false); }
  };

  const unlinkRep = async () => {
    if (!window.confirm(`Remove ${partner.rep_user_email} as ${partner.company_name}'s rep?`)) return;
    setRepBusy(true);
    try {
      await apiClient.delete(`${API_URL}/admin/partners/${partnerId}/link-rep`, { headers: authHeaders() });
      toast.success('Rep unlinked');
      await fetchAll({ hydrate: false });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to unlink rep');
    } finally { setRepBusy(false); }
  };

  const deletePartner = async () => {
    if (!window.confirm(`Delete the partnership with "${partner.company_name}"? This removes their custom tier and the public /p/ page.`)) return;
    try {
      await apiClient.delete(`${API_URL}/admin/partners/${partnerId}`, { headers: authHeaders() });
      toast.success('Partner deleted');
      navigate('/admin/partners');
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" data-testid="partner-edit-loading">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" />
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="p-4 lg:p-8" data-testid="partner-edit-notfound">
        <div className="glass-card max-w-lg mx-auto mt-8 p-8 text-center">
          <p className="text-sm text-[var(--t4)] mb-4">Partner not found.</p>
          <Button variant="outline" className="border-[var(--b)]" onClick={() => navigate('/admin/partners')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Partners
          </Button>
        </div>
      </div>
    );
  }

  const url = partnerLandingHref(form.slug || partner.slug);
  const logoUrl = partner.logo_data_url || null;
  const inputCls = 'input-field text-base h-11';

  return (
    <div className="p-4 lg:p-8 pb-28 animate-fade-in" data-testid="partner-edit-page">
      <div className="w-full max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate('/admin/partners')}
              className="p-2 rounded-lg text-[var(--t4)] hover:text-[var(--t)]"
              style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
              aria-label="Back to Partners" data-testid="partner-edit-back-btn">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl lg:text-3xl font-semibold text-[var(--t)] tracking-tight truncate" style={{ fontFamily: 'var(--serif)' }}>
                {partner.company_name}
              </h1>
              <p className="text-[12px] text-[var(--t4)]">Partner settings — full view</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={patching}
              onClick={() => patch(
                { active: !partner.active },
                partner.active ? 'Partner deactivated' : 'Partner activated',
                { active: partner.active },
              )}
              className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-lg"
              style={{
                color: partner.active ? 'var(--gn2)' : 'var(--t5)',
                background: 'var(--s)',
                border: '1px solid var(--b)',
              }}
              data-testid="partner-edit-active-toggle">
              <Power className="w-4 h-4" /> {partner.active ? 'ACTIVE' : 'INACTIVE'}
            </button>
            <Button className="gold-button" onClick={save} disabled={saving || !dirty} data-testid="partner-edit-save-btn">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Save Changes</>}
            </Button>
          </div>
        </div>

        {/* Identity & branding */}
        <SectionCard title="Identity & Branding" subtitle="What clients see on the landing page and in emails." testid="partner-edit-identity">
          <div className="flex items-start gap-4 mb-4">
            {logoUrl ? (
              <img src={logoUrl} alt={partner.company_name} className="w-16 h-16 rounded-xl object-contain bg-white p-1.5 flex-shrink-0" data-testid="partner-edit-logo-img" />
            ) : (
              <div className="w-16 h-16 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(var(--gold-rgb),0.08)', border: '1px dashed rgba(var(--gold-rgb),0.35)', color: 'rgba(var(--gold-rgb),0.7)' }}>
                <ImageIcon className="w-5 h-5" />
              </div>
            )}
            <div>
              <input type="file" id="partner-edit-logo-input" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => uploadLogo(e.target.files?.[0])} className="hidden" data-testid="partner-edit-logo-input" />
              <Button size="sm" variant="outline" className="text-xs border-[var(--gold)]/40 text-[var(--gold)]"
                onClick={() => document.getElementById('partner-edit-logo-input')?.click()}
                data-testid="partner-edit-logo-upload">
                <Upload className="w-3 h-3 mr-1" /> {partner.logo_key ? 'Replace Logo' : 'Upload Logo'}
              </Button>
              <p className="text-[11px] text-[var(--t5)] mt-1.5">PNG / JPG / WebP / SVG · max 1 MB</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-[var(--t4)]">Company Name</Label>
              <Input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })}
                className={inputCls} data-testid="partner-edit-company-name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--t4)]">Landing Page Name</Label>
              <Input value={form.slug} onChange={e => setForm({ ...form, slug: sanitizeSlug(e.target.value) })}
                className={`${inputCls} font-mono`} placeholder="web-page-name" data-testid="partner-edit-slug" />
              <p className="text-[11px] text-[var(--t5)] flex items-center gap-1.5 flex-wrap">
                <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono text-[var(--gold)] hover:text-[#fcd34d] inline-flex items-center gap-1 break-all">
                  <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" /> {url}
                </a>
                <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
                  className="text-[var(--t5)] hover:text-[var(--t)]" title="Copy URL" data-testid="partner-edit-copy-url">
                  {copied ? <Check className="w-3 h-3 text-[var(--gn2)]" /> : <Copy className="w-3 h-3" />}
                </button>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--t4)]">Member Access Code</Label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className={`${inputCls} font-mono`} placeholder="CODE" data-testid="partner-edit-code" />
              <p className="text-[11px] text-[var(--t5)]">Entered by members at the final signup step.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-[var(--t4)]">Landing Page Tagline</Label>
              <Textarea value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })}
                className="input-field text-base min-h-[72px]" maxLength={280}
                placeholder="Carpenter Collective clients receive a fully prepared family continuity portal."
                data-testid="partner-edit-tagline" />
              <p className="text-[11px] text-[var(--t5)]">{(form.tagline || '').length}/280 · shown under the logo on their landing page</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-[var(--t4)]">Partner Contact Email</Label>
              <Input type="email" value={form.partner_email} onChange={e => setForm({ ...form, partner_email: e.target.value })}
                className={inputCls} maxLength={120} placeholder="ops@partner-company.com" data-testid="partner-edit-email" />
              <p className="text-[11px] text-[var(--t5)]">Used to send the welcome email via Resend.</p>
            </div>
          </div>
        </SectionCard>

        {/* Business terms */}
        <SectionCard title="Business Terms" subtitle="Pricing, revenue share, and seat allocation." testid="partner-edit-terms">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--t4)]">Member Discount %</Label>
              <Input type="number" min={0} max={100} value={form.discount_percent}
                onChange={e => setForm({ ...form, discount_percent: e.target.value })}
                className={inputCls} data-testid="partner-edit-discount" />
              <p className="text-[11px] text-[var(--t5)]">100 = free for members (partner covers the bill) · 0 = members pay full retail (rev-share deals)</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--t4)]">Rev Share %</Label>
              <Input type="number" min={0} max={100} value={form.revshare_percent}
                onChange={e => setForm({ ...form, revshare_percent: e.target.value })}
                className={inputCls} data-testid="partner-edit-revshare" />
              <p className="text-[11px] text-[var(--t5)]">Your monthly payout to the partner from steady paying subscribers.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--t4)]">User Slots (seats)</Label>
              <Input type="number" min={0} value={form.max_uses}
                onChange={e => setForm({ ...form, max_uses: e.target.value })}
                className={inputCls} data-testid="partner-edit-seats" />
              <p className="text-[11px] text-[var(--t5)]">0 = unlimited</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
            <div className="text-[12px] text-[var(--t4)] flex items-center gap-1.5" data-testid="partner-edit-seat-usage">
              <Users className="w-3.5 h-3.5" />
              <span>
                <span className={`font-bold ${partner.max_uses > 0 && partner.active_users_count >= partner.max_uses ? 'text-[var(--rd)]' : 'text-[var(--gold)]'}`}>{partner.active_users_count || 0}</span>
                {' '}of <span className="font-bold text-[var(--t3)]">{partner.max_uses > 0 ? partner.max_uses : '∞'}</span> users active
                {partner.times_used > (partner.active_users_count || 0) && <span className="text-[var(--t6)]"> · {partner.times_used} lifetime</span>}
              </span>
            </div>
            <Button size="sm" variant="outline" className="text-xs border-[#34d399]/40 text-[#34d399]"
              onClick={() => setShowRevShare(true)} data-testid="partner-edit-revshare-report">
              <DollarSign className="w-3 h-3 mr-1" /> Rev-Share Report
            </Button>
          </div>
        </SectionCard>

        {/* People & access */}
        <SectionCard title="People & Access" subtitle="Who runs this partnership day to day." testid="partner-edit-people">
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[var(--t4)] block mb-1.5">Manager Logins (Manager Portal at /manager)</Label>
              <Button size="sm" variant="outline" className="text-xs border-[var(--gold)]/40 text-[var(--gold)]"
                onClick={() => setShowManagers(true)} data-testid="partner-edit-managers-btn">
                <KeyRound className="w-3 h-3 mr-1" /> Manage Manager Logins
              </Button>
              <p className="text-[11px] text-[var(--t5)] mt-1.5">Create/copy credentials, regenerate passwords, deactivate.</p>
            </div>
            <div>
              <Label className="text-xs text-[var(--t4)] block mb-1.5">Partner Rep (Client Setup inside their own CarryOn account)</Label>
              {partner.rep_user_email ? (
                <div className="flex items-center gap-2 text-sm" data-testid="partner-edit-rep-linked">
                  <UserPlus className="w-4 h-4 text-[#34d399]" />
                  <span className="text-[var(--t3)] font-semibold">{partner.rep_user_name || partner.rep_user_email}</span>
                  <span className="text-[var(--t5)] text-[12px]">({partner.rep_user_email})</span>
                  <button onClick={unlinkRep} disabled={repBusy} className="text-[var(--t5)] hover:text-[var(--rd)] p-2"
                    title="Unlink rep" data-testid="partner-edit-rep-unlink">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <Input type="email" value={repEmail} onChange={e => setRepEmail(e.target.value)}
                    className="input-field text-sm h-10 flex-1 min-w-[220px]"
                    placeholder="Rep's CarryOn account email" data-testid="partner-edit-rep-email" />
                  <Button size="sm" variant="outline" onClick={linkRep} disabled={repBusy || !repEmail.trim()}
                    className="text-xs h-10 border-[var(--gold)]/40 text-[var(--gold)]" data-testid="partner-edit-rep-link">
                    {repBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <><UserPlus className="w-3 h-3 mr-1" /> Link Rep</>}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Feature gates */}
        <SectionCard
          title="Feature Set"
          subtitle="The exact pillars this partner's members receive. Changes apply to members instantly."
          testid="partner-edit-gates"
        >
          <div className="flex items-center gap-1.5 mb-4">
            {['tailored', 'free'].map(mode => (
              <button key={mode} onClick={() => setGateMode(mode)}
                className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider"
                style={gateMode === mode
                  ? { background: 'rgba(212,175,55,0.15)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.45)' }
                  : { background: 'var(--s)', color: 'var(--t5)', border: '1px solid var(--b)' }}
                data-testid={`partner-edit-gatemode-${mode}`}>
                {mode === 'tailored' ? 'Tailored Tier' : 'Free-Mode Tier'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {columns.map(col => {
              const enabled = !!(partner[gateField] || {})[col.key];
              return (
                <div key={col.key} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                  <span className="text-sm font-semibold text-[var(--t3)]">{col.label}</span>
                  <Switch checked={enabled} onCheckedChange={() => toggleGate(col.key)}
                    disabled={patching}
                    data-testid={`partner-edit-gate-${col.key}`}
                    aria-label={`Toggle ${col.label} for ${partner.company_name}`} />
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* Danger zone */}
        <SectionCard title="Danger Zone" testid="partner-edit-danger">
          <Button variant="outline" className="border-[var(--rd)]/40 text-[var(--rd)] text-sm"
            onClick={deletePartner} data-testid="partner-edit-delete-btn">
            <Trash2 className="w-4 h-4 mr-1" /> Delete Partnership
          </Button>
          <p className="text-[11px] text-[var(--t5)] mt-2">Removes their custom tier and the public /p/ landing page. Cannot be undone.</p>
        </SectionCard>
      </div>

      {/* Mobile sticky save bar — appears only with unsaved changes */}
      {dirty && (
        <div className="fixed bottom-0 inset-x-0 z-50 sm:hidden px-4 py-3"
          style={{ background: 'rgba(13,22,40,0.96)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(var(--gold-rgb),0.25)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
          data-testid="partner-edit-mobile-savebar">
          <Button className="gold-button w-full h-12 text-base" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Save Changes</>}
          </Button>
        </div>
      )}

      {showRevShare && (
        <PartnerRevShareModal partner={partner} authHeaders={authHeaders} onClose={() => setShowRevShare(false)} />
      )}
      {showManagers && (
        <PartnerManagersModal partner={partner} authHeaders={authHeaders} onClose={() => setShowManagers(false)} />
      )}
    </div>
  );
}
