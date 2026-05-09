/**
 * EntityWizard — 3-step slide-in wizard for creating a new entity (or
 * external person) and at least one connection. Editing happens via
 * EntityDetailPanel (which can also add additional relationships).
 *
 * Step 1 — choose bucket → choose type
 * Step 2 — name + state + notes (+ "Show more details")
 * Step 3 — add at least one connection (who connects, in what role, %)
 */
import React, { useState } from 'react';
import SlidePanel from '../../SlidePanel';
import {
  Building2, Shield, Landmark, Home, User as UserIcon, Settings,
  ChevronLeft, Loader2, HelpCircle, Plus, Trash2,
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { toast } from '../../../utils/toast';
import { API_URL } from '../../../config';
import {
  BUCKETS, TYPES, ROLE_OPTIONS, FORMATION_STATES, getTypeMeta,
} from '../../../config/entityCatalog';
import DocumentLinker from './DocumentLinker';
import FinancialFields from './FinancialFields';
import EntityCredentialsField from './EntityCredentialsField';
import { persistEntityCredentials } from './persistEntityCredentials';

const ICONS = {
  Building2, Shield, Landmark, Home, User: UserIcon, Settings,
};

// Tiny helper popover
function HelpDot({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block ml-1.5">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onMouseLeave={() => setOpen(false)}
        className="text-[var(--t5)] hover:text-[var(--gold)] inline-flex"
        aria-label="Help"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          className="absolute z-50 left-0 top-5 w-60 p-2.5 rounded-lg text-[12px] leading-snug shadow-xl"
          style={{ background: 'var(--bg2)', color: 'var(--t)', border: '1px solid var(--b)' }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

export default function EntityWizard({
  open,
  estateId,
  user,
  beneficiaries,
  entities,
  externals,
  documents,
  onCreated,
  onCreatedExternal,
  onCancel,
}) {
  const { getAuthHeaders } = useAuth();
  const [step, setStep] = useState(1);
  const [bucketId, setBucketId] = useState(null);
  // pendingBucketId = highlighted (selected but not yet committed). User
  // must hit "Continue" for it to actually advance into the type-picker
  // sub-step. This mirrors how the type cards work — selecting a card
  // highlights it; the Continue button gates progression.
  const [pendingBucketId, setPendingBucketId] = useState(null);
  const [typeId, setTypeId] = useState(null);
  const [search, setSearch] = useState('');
  // Step 2 form fields
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const [notes, setNotes] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [einLast4, setEinLast4] = useState('');
  const [formationDate, setFormationDate] = useState('');
  const [taxElection, setTaxElection] = useState('');
  const [registeredAgent, setRegisteredAgent] = useState('');
  const [linkedDocIds, setLinkedDocIds] = useState([]);
  const [grossAssets, setGrossAssets] = useState('');
  const [grossDebts, setGrossDebts] = useState('');
  const [credentials, setCredentials] = useState([]);
  // External person fields
  const [extFirst, setExtFirst] = useState('');
  const [extLast, setExtLast] = useState('');
  const [extNotes, setExtNotes] = useState('');
  // Step 3 connection rows
  const [connections, setConnections] = useState([
    { sourceKey: user?.id ? `user:${user.id}` : '', role: 'owner', ownership_pct: 100 },
  ]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep(1); setBucketId(null); setPendingBucketId(null); setTypeId(null); setSearch('');
    setName(''); setState(''); setNotes(''); setShowMore(false);
    setEinLast4(''); setFormationDate(''); setTaxElection(''); setRegisteredAgent('');
    setLinkedDocIds([]); setGrossAssets(''); setGrossDebts('');
    setCredentials([]);
    setExtFirst(''); setExtLast(''); setExtNotes('');
    setConnections([{ sourceKey: user?.id ? `user:${user.id}` : '', role: 'owner', ownership_pct: 100 }]);
  };

  if (!open) return null;

  const selectedBucket = BUCKETS.find((b) => b.id === bucketId);
  const isExternalPerson = bucketId === 'external_person';
  const typeMeta = bucketId && typeId ? getTypeMeta(bucketId, typeId) : null;

  const filteredTypes = (() => {
    if (!bucketId || isExternalPerson) return [];
    const list = TYPES[bucketId] || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((t) =>
      t.friendly.toLowerCase().includes(q) ||
      t.legal.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    );
  })();

  // -------------- step navigation --------------
  // Step 1 is two-stage: pick a bucket → pick a type within that bucket.
  // The Continue button advances bucket-picker → type-picker, then
  // type-picker → step 2.
  const canProceedFrom1 = bucketId
    ? (isExternalPerson || !!typeId)
    : !!pendingBucketId;
  const canProceedFrom2 = isExternalPerson
    ? extFirst.trim().length > 0
    : name.trim().length > 0;

  const handleNext = () => {
    if (step === 1) {
      if (!bucketId && pendingBucketId) { setBucketId(pendingBucketId); return; }
      if (canProceedFrom1) setStep(2);
      return;
    }
    if (step === 2 && canProceedFrom2) {
      if (isExternalPerson) handleSaveExternal();
      else setStep(3);
    } else if (step === 3) handleSave();
  };

  const handleBack = () => {
    if (step === 1) {
      // Two-stage step 1: if we're in the type-picker sub-step, go
      // back to the bucket-picker; otherwise actually cancel.
      if (bucketId) { setBucketId(null); return; }
      onCancel?.();
      return;
    }
    setStep((s) => s - 1);
  };

  // -------------- save (external person) --------------
  const handleSaveExternal = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const r = await axios.post(`${API_URL}/financial/external-people`, {
        estate_id: estateId,
        first_name: extFirst.trim(),
        last_name: extLast.trim() || null,
        notes: extNotes.trim() || null,
      }, getAuthHeaders());
      toast.success('Person added.');
      onCreatedExternal?.(r.data);
      reset();
      onCancel?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add person');
    } finally {
      setSaving(false);
    }
  };

  // -------------- save (entity + relationships) --------------
  const handleSave = async () => {
    if (saving) return;
    // require at least one connection with a valid source
    const valid = connections.filter((c) => c.sourceKey && c.role);
    if (valid.length === 0) {
      toast.error('Add at least one connection.');
      return;
    }
    setSaving(true);
    try {
      const ent = await axios.post(`${API_URL}/financial/entities`, {
        estate_id: estateId,
        category: bucketId,
        type: typeId,
        name: name.trim(),
        formation_state: state || null,
        ein_last_four: einLast4 || null,
        formation_date: formationDate || null,
        tax_election: taxElection || null,
        registered_agent: registeredAgent || null,
        notes: notes.trim() || null,
        document_ids: linkedDocIds.filter(Boolean),
        gross_assets: grossAssets === '' ? null : Number(grossAssets),
        gross_debts: grossDebts === '' ? null : Number(grossDebts),
      }, getAuthHeaders());
      const newEntity = ent.data;

      // Save relationships in parallel
      const rels = await Promise.all(valid.map((c) => {
        const [src_type, src_id] = c.sourceKey.split(':');
        return axios.post(`${API_URL}/financial/entity-relationships`, {
          estate_id: estateId,
          source_id: src_id,
          source_type: src_type,
          target_id: newEntity.id,
          target_type: 'entity',
          role: c.role,
          ownership_pct: (c.role === 'owner' || c.role === 'gp' || c.role === 'lp') && c.ownership_pct != null && c.ownership_pct !== ''
            ? Number(c.ownership_pct) : null,
        }, getAuthHeaders())
          .then((r) => r.data)
          .catch(() => null);
      }));

      toast.success('Entity added to your structure.');

      // Persist any digital credentials → DAV (linked to the new entity)
      if (credentials.length > 0) {
        await persistEntityCredentials({
          credentials,
          entityId: newEntity.id,
          authHeaders: getAuthHeaders(),
        });
      }

      onCreated?.(newEntity, rels.filter(Boolean));
      reset();
      onCancel?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add entity');
    } finally {
      setSaving(false);
    }
  };

  // -------------- source picker options --------------
  const sourceOptions = [
    user?.id && { value: `user:${user.id}`, label: `${user.first_name || 'You'} (you)` },
    ...(beneficiaries || []).map((b) => ({ value: `beneficiary:${b.id}`, label: `${b.name || b.first_name} — beneficiary` })),
    ...(externals || []).map((p) => ({ value: `external_person:${p.id}`, label: `${p.first_name}${p.last_name ? ' ' + p.last_name : ''} — outside party` })),
    ...(entities || []).map((e) => ({ value: `entity:${e.id}`, label: `${e.name} — entity` })),
  ].filter(Boolean);

  // -------------- render --------------
  const wizTitle = step === 1
    ? 'Add an Entity or Trust'
    : step === 2
      ? (isExternalPerson ? 'About this person' : 'Entity details')
      : 'How does it connect?';
  const wizSubtitle = `Step ${step} of ${isExternalPerson ? 2 : 3}`;

  return (
    <SlidePanel
      open={open}
      onClose={() => { reset(); onCancel?.(); }}
      title={wizTitle}
      subtitle={wizSubtitle}
    >
      <div className="cfp-edit-surface space-y-4" data-testid="entity-wizard">
          {/* ---------------- STEP 1 ---------------- */}
          {step === 1 && (
            <>
              {!bucketId && (
                <>
                  <p className="text-sm text-[var(--t3)]">What kind of thing are you adding?</p>
                  <div className="grid grid-cols-1 gap-2">
                    {BUCKETS.map((b) => {
                      const Icon = ICONS[b.icon];
                      const selected = pendingBucketId === b.id;
                      return (
                        <button
                          key={b.id}
                          onClick={() => setPendingBucketId(b.id)}
                          className="flex items-start gap-3 p-3 rounded-xl text-left transition-all hover:bg-[var(--s)]"
                          style={{
                            border: selected ? '1.5px solid var(--gold)' : '1px solid var(--b)',
                            background: selected ? 'rgba(212,165,55,0.08)' : 'var(--card)',
                          }}
                          data-testid={`wizard-bucket-${b.id}`}
                          aria-pressed={selected}
                        >
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: 'rgba(212,165,55,0.10)', color: 'var(--gold)' }}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-[var(--t)]">{b.label}</div>
                            <div className="text-[11px] text-[var(--t5)] mt-0.5">{b.sub}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {bucketId && !isExternalPerson && (
                <>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setBucketId(null)} className="text-[var(--gold)] text-xs font-bold hover:underline">
                      ← Change category
                    </button>
                    <span className="text-xs text-[var(--t5)]">·</span>
                    <span className="text-xs font-semibold text-[var(--t3)]">{selectedBucket?.label}</span>
                  </div>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search types…"
                    className="input-field"
                    data-testid="wizard-type-search"
                  />
                  <div className="space-y-1.5 max-h-none">
                    {filteredTypes.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTypeId(t.id)}
                        className="w-full text-left p-3 rounded-xl transition-all hover:bg-[var(--s)]"
                        style={{
                          border: typeId === t.id ? '1.5px solid var(--gold)' : '1px solid var(--b)',
                          background: typeId === t.id ? 'rgba(212,165,55,0.08)' : 'var(--card)',
                        }}
                        data-testid={`wizard-type-${t.id}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-[var(--t)]">{t.friendly}</span>
                          <HelpDot text={t.blurb} />
                        </div>
                        <div className="text-[11px] text-[var(--t5)] mt-0.5">{t.legal}</div>
                      </button>
                    ))}
                    {filteredTypes.length === 0 && (
                      <p className="text-sm text-[var(--t5)] text-center py-6">No matching types.</p>
                    )}
                  </div>
                </>
              )}

              {bucketId && isExternalPerson && (
                <>
                  <p className="text-sm text-[var(--t3)]">
                    A lightweight person record for someone outside your beneficiaries list — an outside trustee,
                    business partner, ex-spouse, or third party. They will appear in the chart but never join your
                    formal Beneficiaries.
                  </p>
                  <button onClick={() => setBucketId(null)} className="text-[var(--gold)] text-xs font-bold hover:underline">
                    ← Change category
                  </button>
                </>
              )}
            </>
          )}

          {/* ---------------- STEP 2 ---------------- */}
          {step === 2 && !isExternalPerson && (
            <>
              <div
                className="rounded-xl p-3"
                style={{ background: 'rgba(212,165,55,0.06)', border: '1px solid rgba(212,165,55,0.18)' }}
              >
                <div className="text-[11px] font-bold text-[var(--gold)]">{selectedBucket?.label}</div>
                <div className="text-sm font-bold text-[var(--t)]">{typeMeta?.friendly}</div>
                <div className="text-[11px] text-[var(--t5)] mt-1">{typeMeta?.blurb}</div>
              </div>

              <div className="space-y-2">
                <Label className="text-[var(--t4)]">Name <span className="text-red-400">*</span></Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Smith Family Holdings, LLC"
                  className="input-field"
                  data-testid="wizard-entity-name"
                />
              </div>

              {typeMeta?.state_relevant && (
                <div className="space-y-2">
                  <Label className="text-[var(--t4)]">Formation state</Label>
                  <Select value={state} onValueChange={(v) => setState(v === 'none' ? '' : v)}>
                    <SelectTrigger className="input-field select-themed" data-testid="wizard-entity-state">
                      <SelectValue placeholder="Select a state" />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)] max-h-64">
                      <SelectItem value="none">— Not specified —</SelectItem>
                      {FORMATION_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-[var(--t4)]">Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything you want your beneficiaries to know about this entity."
                  className="input-field min-h-[70px]"
                  rows={3}
                  data-testid="wizard-entity-notes"
                />
              </div>

              <button
                onClick={() => setShowMore((x) => !x)}
                className="text-xs text-[var(--gold)] font-bold hover:underline"
                data-testid="wizard-show-more"
              >
                {showMore ? 'Hide details' : 'Show more details'}
              </button>
              {showMore && (
                <div className="space-y-3 p-3 rounded-xl" style={{ background: 'var(--card)', border: '1px solid var(--b)' }}>
                  <div className="space-y-1.5">
                    <Label className="text-[var(--t4)] text-xs">EIN (last 4)</Label>
                    <Input value={einLast4} onChange={(e) => setEinLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" className="input-field" maxLength={4} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[var(--t4)] text-xs">Formation date</Label>
                    <Input value={formationDate} onChange={(e) => setFormationDate(e.target.value)} placeholder="YYYY-MM-DD" className="input-field" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[var(--t4)] text-xs">Tax election</Label>
                    <Input value={taxElection} onChange={(e) => setTaxElection(e.target.value)} placeholder="e.g. S-Corp, Disregarded Entity" className="input-field" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[var(--t4)] text-xs">Registered agent</Label>
                    <Input value={registeredAgent} onChange={(e) => setRegisteredAgent(e.target.value)} placeholder="Agent or service name" className="input-field" />
                  </div>
                </div>
              )}

              {/* Financials */}
              <div className="space-y-2">
                <Label className="text-[var(--t4)]">Financial snapshot</Label>
                <FinancialFields
                  assets={grossAssets}
                  debts={grossDebts}
                  onChange={({ assets, debts }) => { setGrossAssets(assets); setGrossDebts(debts); }}
                />
              </div>

              {/* Linked SDV documents */}
              <div className="space-y-2">
                <Label className="text-[var(--t4)]">Linked documents (SDV)</Label>
                <DocumentLinker
                  value={linkedDocIds}
                  onChange={setLinkedDocIds}
                  documents={documents || []}
                />
              </div>

              {/* Digital credentials → populate the Digital Access Vault */}
              <div className="space-y-2">
                <Label className="text-[var(--t4)]">
                  Digital credentials
                  <span className="text-[11px] font-normal text-[var(--t5)] ml-1.5">— saved to your DAV</span>
                </Label>
                <EntityCredentialsField
                  credentials={credentials}
                  onChange={setCredentials}
                  defaultAccountName={name ? `${name} portal` : ''}
                />
              </div>
            </>
          )}

          {step === 2 && isExternalPerson && (
            <>
              <div className="space-y-2">
                <Label className="text-[var(--t4)]">First name <span className="text-red-400">*</span></Label>
                <Input value={extFirst} onChange={(e) => setExtFirst(e.target.value)} placeholder="Robin" className="input-field" data-testid="wizard-ext-first" />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--t4)]">Last name</Label>
                <Input value={extLast} onChange={(e) => setExtLast(e.target.value)} placeholder="Banks" className="input-field" data-testid="wizard-ext-last" />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--t4)]">Notes</Label>
                <Textarea value={extNotes} onChange={(e) => setExtNotes(e.target.value)} placeholder="Anything to remember about this person." className="input-field min-h-[70px]" rows={3} />
              </div>
            </>
          )}

          {/* ---------------- STEP 3 ---------------- */}
          {step === 3 && !isExternalPerson && (
            <>
              <p className="text-sm text-[var(--t3)]">
                How does <span className="font-bold text-[var(--t)]">{name || 'this entity'}</span> connect to people or other entities?
              </p>

              {connections.map((c, i) => {
                const showPct = c.role === 'owner' || c.role === 'gp' || c.role === 'lp';
                return (
                  <div key={i} className="p-3 rounded-xl space-y-2" style={{ background: 'var(--card)', border: '1px solid var(--b)' }}>
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-bold text-[var(--t5)] uppercase tracking-wide">Connection {i + 1}</div>
                      {connections.length > 1 && (
                        <button
                          onClick={() => setConnections(connections.filter((_, idx) => idx !== i))}
                          className="text-[#ef4444] hover:opacity-70"
                          aria-label="Remove connection"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-[var(--t4)]">Connected to</Label>
                      <Select
                        value={c.sourceKey}
                        onValueChange={(v) => {
                          const next = [...connections];
                          next[i] = { ...next[i], sourceKey: v };
                          setConnections(next);
                        }}
                      >
                        <SelectTrigger className="input-field select-themed" data-testid={`wizard-conn-source-${i}`}>
                          <SelectValue placeholder="Select a person or entity" />
                        </SelectTrigger>
                        <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)] max-h-64">
                          {sourceOptions.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-[var(--t4)]">As the…</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {ROLE_OPTIONS.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => {
                              const next = [...connections];
                              next[i] = { ...next[i], role: r.id };
                              setConnections(next);
                            }}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-full transition-all"
                            style={{
                              background: c.role === r.id ? 'var(--gold)' : 'transparent',
                              color: c.role === r.id ? '#0b1120' : 'var(--t3)',
                              border: c.role === r.id ? '1px solid var(--gold)' : '1px solid var(--b)',
                            }}
                            data-testid={`wizard-conn-role-${i}-${r.id}`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {showPct && (
                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-[var(--t4)]">Ownership %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={c.ownership_pct ?? ''}
                          onChange={(e) => {
                            const next = [...connections];
                            next[i] = { ...next[i], ownership_pct: e.target.value };
                            setConnections(next);
                          }}
                          className="input-field"
                          placeholder="e.g. 100"
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                onClick={() => setConnections([...connections, { sourceKey: '', role: 'owner', ownership_pct: '' }])}
                className="w-full text-xs text-[var(--gold)] font-bold hover:underline flex items-center justify-center gap-1 py-1"
                data-testid="wizard-add-connection"
              >
                <Plus className="w-3.5 h-3.5" /> Add another connection
              </button>
            </>
          )}

        {/* Footer (Cancel + Continue) — lives at the end of the
            scrollable content so SlidePanel's mobile padding-bottom
            keeps it clear of the floating bottom nav. */}
        <div
          className="px-1 pt-3 pb-1 border-t border-[var(--b)] flex items-center gap-2"
          style={{ background: 'var(--bg)' }}
        >
          <Button variant="outline" onClick={() => { reset(); onCancel?.(); }} className="btn-outline-cta" data-testid="wizard-cancel">
            Cancel
          </Button>
          <div className="flex-1" />
          <Button
            onClick={handleNext}
            disabled={saving || (step === 1 && !canProceedFrom1) || (step === 2 && !canProceedFrom2)}
            className="px-5 py-2 rounded-md text-sm font-semibold btn-gold-cta"
            data-testid="wizard-next"
          >
            {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</>
              : step === 1 ? 'Continue'
              : step === 2 ? (isExternalPerson ? 'Add person' : 'Continue')
              : 'Add to chart'}
          </Button>
        </div>
      </div>
    </SlidePanel>
  );
}
