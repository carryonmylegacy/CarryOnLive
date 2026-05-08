/**
 * EntityDetailPanel — slide-in panel that surfaces details for any node
 * tapped in the EntityOrgChart. Supports edit/delete for entities and
 * external people, surfaces the full set of incoming/outgoing
 * relationships, and lets the user add new relationships in place.
 */
import React, { useMemo, useState } from 'react';
import {
  ChevronLeft, Loader2, Trash2, Plus, Edit2,
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
  ROLE_OPTIONS, FORMATION_STATES, getTypeMeta, getBucketMeta, getEntityPalette,
} from '../../../config/entityCatalog';
import DocumentLinker from './DocumentLinker';
import FinancialFields from './FinancialFields';
import EntityCredentialsField from './EntityCredentialsField';
import { persistEntityCredentials } from './persistEntityCredentials';

export default function EntityDetailPanel({
  open,
  node,
  startInEdit,
  user,
  beneficiaries,
  entities,
  externals,
  documents,
  walletEntries,
  relationships,
  onChanged,
  onClose,
}) {
  const { getAuthHeaders } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Edit form state for entity
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const [notes, setNotes] = useState('');
  const [linkedDocIds, setLinkedDocIds] = useState([]);
  const [grossAssets, setGrossAssets] = useState('');
  const [grossDebts, setGrossDebts] = useState('');
  const [credentials, setCredentials] = useState([]);
  // Edit form state for external person
  const [extFirst, setExtFirst] = useState('');
  const [extLast, setExtLast] = useState('');
  const [extNotes, setExtNotes] = useState('');
  // Add-connection form (only for entities)
  const [addingConn, setAddingConn] = useState(false);
  const [newSourceKey, setNewSourceKey] = useState('');
  const [newRole, setNewRole] = useState('owner');
  const [newPct, setNewPct] = useState('');
  // Custom confirmation prompt (window.confirm is silently blocked in iOS PWA)
  const [confirmPrompt, setConfirmPrompt] = useState(null); // {message, action}

  // Reset form when node changes
  React.useEffect(() => {
    setEditing(!!startInEdit);
    setAddingConn(false);
    setNewSourceKey(''); setNewRole('owner'); setNewPct('');
    if (!node) return;    if (node.kind === 'entity' && node.entity) {
      setName(node.entity.name || '');
      setState(node.entity.formation_state || '');
      setNotes(node.entity.notes || '');
      setLinkedDocIds(node.entity.document_ids || []);
      setGrossAssets(node.entity.gross_assets == null ? '' : String(node.entity.gross_assets));
      setGrossDebts(node.entity.gross_debts == null ? '' : String(node.entity.gross_debts));
      const linked = (walletEntries || [])
        .filter((w) => w.linked_entity_id === node.entity.id)
        .map((w) => ({
          id: w.id,
          _new: false,
          _dirty: false,
          account_name: w.account_name || '',
          login_username: w.login_username || '',
          password: w.password || '',
          additional_access: w.additional_access || '',
          notes: w.notes || '',
        }));
      setCredentials(linked);
    } else if (node.kind === 'external_person') {
      const p = externals.find((x) => x.id === node.id);
      setExtFirst(p?.first_name || '');
      setExtLast(p?.last_name || '');
      setExtNotes(p?.notes || '');
    }
  }, [node, externals, startInEdit, walletEntries]);

  const incomingRels = useMemo(() => {
    if (!node) return [];
    return (relationships || []).filter((r) => `${r.target_type}:${r.target_id}` === node.key);
  }, [relationships, node]);
  const outgoingRels = useMemo(() => {
    if (!node) return [];
    return (relationships || []).filter((r) => `${r.source_type}:${r.source_id}` === node.key);
  }, [relationships, node]);

  // Build a label resolver
  const labelFor = (type, id) => {
    if (type === 'user') return `${user?.first_name || 'You'} (you)`;
    if (type === 'beneficiary') {
      const b = beneficiaries.find((x) => x.id === id);
      return b ? `${b.name || b.first_name} — beneficiary` : 'Beneficiary';
    }
    if (type === 'external_person') {
      const p = externals.find((x) => x.id === id);
      return p ? `${p.first_name}${p.last_name ? ' ' + p.last_name : ''} — outside party` : 'Outside party';
    }
    if (type === 'entity') {
      const e = entities.find((x) => x.id === id);
      return e ? `${e.name} — entity` : 'Entity';
    }
    return id;
  };

  if (!open || !node) return null;

  const isEntity = node.kind === 'entity';
  const isExternal = node.kind === 'external_person';
  const ent = isEntity ? entities.find((e) => e.id === node.id) : null;
  const meta = ent ? getTypeMeta(ent.category, ent.type) : null;
  const palette = ent ? getEntityPalette(ent) : null;

  const sourceOptions = [
    user?.id && { value: `user:${user.id}`, label: `${user.first_name || 'You'} (you)` },
    ...(beneficiaries || []).map((b) => ({ value: `beneficiary:${b.id}`, label: `${b.name || b.first_name} — beneficiary` })),
    ...(externals || []).map((p) => ({ value: `external_person:${p.id}`, label: `${p.first_name}${p.last_name ? ' ' + p.last_name : ''} — outside party` })),
    ...(entities || []).filter((e) => !ent || e.id !== ent.id).map((e) => ({ value: `entity:${e.id}`, label: `${e.name} — entity` })),
  ].filter(Boolean);

  // -------- handlers --------
  const handleSaveEntity = async () => {
    if (!ent || saving) return;
    setSaving(true);
    try {
      await axios.patch(`${API_URL}/financial/entities/${ent.id}`, {
        name: name.trim() || ent.name,
        formation_state: state || null,
        notes: notes.trim() || null,
        document_ids: linkedDocIds.filter(Boolean),
        gross_assets: grossAssets === '' ? null : Number(grossAssets),
        gross_debts: grossDebts === '' ? null : Number(grossDebts),
      }, getAuthHeaders());
      // Persist any digital-credential edits to the DAV
      await persistEntityCredentials({
        credentials,
        entityId: ent.id,
        authHeaders: getAuthHeaders(),
      });
      toast.success('Saved.');
      setEditing(false);
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveExternal = async () => {
    if (!isExternal || saving) return;
    setSaving(true);
    try {
      await axios.patch(`${API_URL}/financial/external-people/${node.id}`, {
        first_name: extFirst.trim() || 'Person',
        last_name: extLast.trim() || null,
        notes: extNotes.trim() || null,
      }, getAuthHeaders());
      toast.success('Saved.');
      setEditing(false);
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntity = () => {
    if (!ent) return;
    setConfirmPrompt({
      message: `Delete "${ent.name}"? This will also remove all of its connections.`,
      action: async () => {
        try {
          await axios.delete(`${API_URL}/financial/entities/${ent.id}`, getAuthHeaders());
          toast.success('Deleted.');
          onClose?.();
          onChanged?.();
        } catch (err) {
          toast.error(err.response?.data?.detail || 'Delete failed');
        }
      },
    });
  };

  const handleDeleteExternal = () => {
    if (!isExternal) return;
    setConfirmPrompt({
      message: 'Remove this outside person? Their connections will be removed too.',
      action: async () => {
        try {
          await axios.delete(`${API_URL}/financial/external-people/${node.id}`, getAuthHeaders());
          toast.success('Removed.');
          onClose?.();
          onChanged?.();
        } catch (err) {
          toast.error(err.response?.data?.detail || 'Delete failed');
        }
      },
    });
  };

  const handleDeleteRelationship = (rel) => {
    setConfirmPrompt({
      message: 'Remove this connection?',
      action: async () => {
        try {
          await axios.delete(`${API_URL}/financial/entity-relationships/${rel.id}`, getAuthHeaders());
          toast.success('Connection removed.');
          onChanged?.();
        } catch (err) {
          toast.error(err.response?.data?.detail || 'Delete failed');
        }
      },
    });
  };

  const handleAddConnection = async () => {
    if (!ent || !newSourceKey || saving) return;
    const [src_type, src_id] = newSourceKey.split(':');
    const showPct = newRole === 'owner' || newRole === 'gp' || newRole === 'lp';
    setSaving(true);
    try {
      await axios.post(`${API_URL}/financial/entity-relationships`, {
        estate_id: ent.estate_id,
        source_id: src_id,
        source_type: src_type,
        target_id: ent.id,
        target_type: 'entity',
        role: newRole,
        ownership_pct: showPct && newPct !== '' ? Number(newPct) : null,
      }, getAuthHeaders());
      toast.success('Connection added.');
      setAddingConn(false);
      setNewSourceKey(''); setNewRole('owner'); setNewPct('');
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add connection');
    } finally {
      setSaving(false);
    }
  };

  // -------- render --------
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" data-testid="entity-detail-panel">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative h-full w-full sm:w-[460px] flex flex-col"
        style={{ background: 'var(--bg)', borderLeft: '1px solid var(--b)', maxHeight: '100dvh' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--b)] flex-shrink-0">
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-[var(--s)] text-[var(--t3)]"
            data-testid="detail-close"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-[var(--t)] truncate" style={{ fontFamily: 'var(--sans)' }}>
              {isEntity ? ent?.name : isExternal ? `${node.label} ${externals.find(x=>x.id===node.id)?.last_name || ''}`.trim() : node.label}
            </div>
            <div className="text-[11px] text-[var(--t5)]">
              {isEntity ? `${getBucketMeta(ent?.category)?.label} · ${meta?.friendly}` :
               isExternal ? 'Outside party (not in beneficiaries)' :
               node.kind === 'beneficiary' ? 'Beneficiary' : 'You'}
            </div>
          </div>
          {(isEntity || isExternal) && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-[var(--s)] text-[#3b82f6]"
              data-testid="detail-edit"
              aria-label="Edit"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4 cfp-edit-surface"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)',
            // iOS PWA scroll fixes: `min-height: 0` lets the flex child
            // actually shrink so its overflow region is hit-testable;
            // `pan-y` + `WebkitOverflowScrolling` ensure touch gestures
            // route into this scroller instead of bubbling to the page;
            // `overscroll-behavior: contain` blocks rubber-band escape.
            minHeight: 0,
            touchAction: 'pan-y',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          {/* Entity edit mode */}
          {isEntity && editing && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-[var(--t4)]">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="input-field" data-testid="detail-edit-name" />
              </div>
              {meta?.state_relevant && (
                <div className="space-y-2">
                  <Label className="text-[var(--t4)]">Formation state</Label>
                  <Select value={state} onValueChange={(v) => setState(v === 'none' ? '' : v)}>
                    <SelectTrigger className="input-field select-themed">
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
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field min-h-[80px]" rows={3} />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--t4)]">Financial snapshot</Label>
                <FinancialFields
                  assets={grossAssets}
                  debts={grossDebts}
                  onChange={({ assets, debts }) => { setGrossAssets(assets); setGrossDebts(debts); }}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--t4)]">Linked documents (SDV)</Label>
                <DocumentLinker
                  value={linkedDocIds}
                  onChange={setLinkedDocIds}
                  documents={documents || []}
                />
              </div>
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
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(false)} className="btn-outline-cta">Cancel</Button>
                <Button onClick={handleSaveEntity} disabled={saving} className="btn-gold-cta px-4 py-2 rounded-md text-sm font-semibold" data-testid="detail-save">
                  {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</> : 'Save changes'}
                </Button>
              </div>
            </div>
          )}

          {/* External person edit mode */}
          {isExternal && editing && (
            <div className="space-y-3">
              <div className="space-y-2"><Label>First name</Label>
                <Input value={extFirst} onChange={(e) => setExtFirst(e.target.value)} className="input-field" /></div>
              <div className="space-y-2"><Label>Last name</Label>
                <Input value={extLast} onChange={(e) => setExtLast(e.target.value)} className="input-field" /></div>
              <div className="space-y-2"><Label>Notes</Label>
                <Textarea value={extNotes} onChange={(e) => setExtNotes(e.target.value)} className="input-field min-h-[80px]" rows={3} /></div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(false)} className="btn-outline-cta">Cancel</Button>
                <Button onClick={handleSaveExternal} disabled={saving} className="btn-gold-cta px-4 py-2 rounded-md text-sm font-semibold">
                  {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</> : 'Save changes'}
                </Button>
              </div>
            </div>
          )}

          {/* Read-only summary */}
          {!editing && (
            <>
              {isEntity && ent && (
                <div className="rounded-xl p-3 space-y-1.5"
                  style={{ background: palette?.fill, border: `1px solid ${palette?.stroke}` }}>
                  <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: palette?.text }}>{meta?.friendly}</div>
                  <div className="text-sm font-bold text-[var(--t)]">{ent.name}</div>
                  <div className="text-[12px] text-[var(--t4)]">{meta?.legal}</div>
                  {meta?.blurb && <div className="text-[11px] text-[var(--t5)] mt-1 italic">{meta.blurb}</div>}
                  {ent.formation_state && (
                    <div className="text-[12px] text-[var(--t3)]"><span className="text-[var(--t5)]">State:</span> {ent.formation_state}</div>
                  )}
                  {ent.ein_last_four && (
                    <div className="text-[12px] text-[var(--t3)]"><span className="text-[var(--t5)]">EIN:</span> ••-•••{ent.ein_last_four}</div>
                  )}
                  {ent.formation_date && (
                    <div className="text-[12px] text-[var(--t3)]"><span className="text-[var(--t5)]">Formed:</span> {ent.formation_date}</div>
                  )}
                  {ent.tax_election && (
                    <div className="text-[12px] text-[var(--t3)]"><span className="text-[var(--t5)]">Tax election:</span> {ent.tax_election}</div>
                  )}
                  {ent.registered_agent && (
                    <div className="text-[12px] text-[var(--t3)]"><span className="text-[var(--t5)]">Reg. agent:</span> {ent.registered_agent}</div>
                  )}
                  {ent.notes && (
                    <div className="text-[12px] text-[var(--t3)] mt-1.5"><span className="text-[var(--t5)]">Notes:</span> {ent.notes}</div>
                  )}
                </div>
              )}

              {isExternal && (
                <div className="rounded-xl p-3" style={{ background: 'var(--card)', border: '1px solid var(--b)' }}>
                  <div className="text-[12px] text-[var(--t4)]">
                    {externals.find(x=>x.id===node.id)?.notes || 'No notes.'}
                  </div>
                </div>
              )}

              {/* Connections (for entities) */}
              {isEntity && (
                <>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-2">Who connects in</div>
                    {incomingRels.length === 0 && (
                      <div className="text-[12px] text-[var(--t5)] italic">No connections yet.</div>
                    )}
                    {incomingRels.map((r) => {
                      const role = ROLE_OPTIONS.find((x) => x.id === r.role);
                      return (
                        <div key={r.id} className="flex items-center gap-2 p-2 rounded-md" style={{ background: 'var(--card)', border: '1px solid var(--b)' }}>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-semibold text-[var(--t)] truncate">{labelFor(r.source_type, r.source_id)}</div>
                            <div className="text-[11px] text-[var(--t5)]">
                              as <span className="font-bold" style={{ color: 'var(--gold)' }}>{role?.label || r.role}</span>
                              {r.ownership_pct != null && ` · ${Math.round(r.ownership_pct)}%`}
                            </div>
                          </div>
                          <button onClick={() => handleDeleteRelationship(r)} className="text-[#ef4444] hover:opacity-70 p-1" aria-label="Remove">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {outgoingRels.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-2">What this controls</div>
                      {outgoingRels.map((r) => {
                        const role = ROLE_OPTIONS.find((x) => x.id === r.role);
                        return (
                          <div key={r.id} className="flex items-center gap-2 p-2 rounded-md" style={{ background: 'var(--card)', border: '1px solid var(--b)' }}>
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] font-semibold text-[var(--t)] truncate">{labelFor(r.target_type, r.target_id)}</div>
                              <div className="text-[11px] text-[var(--t5)]">
                                as <span className="font-bold" style={{ color: 'var(--gold)' }}>{role?.label || r.role}</span>
                                {r.ownership_pct != null && ` · ${Math.round(r.ownership_pct)}%`}
                              </div>
                            </div>
                            <button onClick={() => handleDeleteRelationship(r)} className="text-[#ef4444] hover:opacity-70 p-1" aria-label="Remove">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add connection */}
                  {!addingConn ? (
                    <button
                      onClick={() => setAddingConn(true)}
                      className="w-full text-xs text-[var(--gold)] font-bold hover:underline flex items-center justify-center gap-1 py-2"
                      data-testid="detail-add-conn"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add a connection
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl space-y-2" style={{ background: 'var(--card)', border: '1px solid var(--b)' }}>
                      <Label className="text-[11px] text-[var(--t4)]">Connected to</Label>
                      <Select value={newSourceKey} onValueChange={setNewSourceKey}>
                        <SelectTrigger className="input-field select-themed"><SelectValue placeholder="Select a person or entity" /></SelectTrigger>
                        <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)] max-h-64">
                          {sourceOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Label className="text-[11px] text-[var(--t4)] mt-2">As the…</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {ROLE_OPTIONS.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => setNewRole(r.id)}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-full transition-all"
                            style={{
                              background: newRole === r.id ? 'var(--gold)' : 'transparent',
                              color: newRole === r.id ? '#0b1120' : 'var(--t3)',
                              border: newRole === r.id ? '1px solid var(--gold)' : '1px solid var(--b)',
                            }}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                      {(newRole === 'owner' || newRole === 'gp' || newRole === 'lp') && (
                        <>
                          <Label className="text-[11px] text-[var(--t4)] mt-2">Ownership %</Label>
                          <Input type="number" min="0" max="100" value={newPct} onChange={(e) => setNewPct(e.target.value)} className="input-field" placeholder="e.g. 100" />
                        </>
                      )}
                      <div className="flex gap-2 pt-1">
                        <Button variant="outline" onClick={() => setAddingConn(false)} className="btn-outline-cta">Cancel</Button>
                        <Button onClick={handleAddConnection} disabled={!newSourceKey || saving} className="btn-gold-cta px-4 py-2 rounded-md text-sm font-semibold">
                          {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</> : 'Add'}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-[var(--b)]">
                    <Button
                      variant="ghost"
                      onClick={handleDeleteEntity}
                      className="text-[#ef4444] hover:bg-[rgba(239,68,68,0.1)] w-full"
                      data-testid="detail-delete-entity"
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Delete this entity
                    </Button>
                  </div>
                </>
              )}

              {isExternal && (
                <>
                  {[...incomingRels, ...outgoingRels].length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-2">Connections</div>
                      {[...incomingRels, ...outgoingRels].map((r) => (
                        <div key={r.id} className="text-[12px] text-[var(--t3)] py-1">
                          {labelFor(r.source_type, r.source_id)} → {labelFor(r.target_type, r.target_id)} ({r.role})
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 border-t border-[var(--b)]">
                    <Button
                      variant="ghost"
                      onClick={handleDeleteExternal}
                      className="text-[#ef4444] hover:bg-[rgba(239,68,68,0.1)] w-full"
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Remove this person
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Custom confirm modal — PWA-iOS blocks window.confirm */}
        {confirmPrompt && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-4" data-testid="entity-confirm-modal">
            <div
              className="rounded-2xl p-5 max-w-sm w-full"
              style={{ background: 'var(--bg2)', border: '1px solid var(--b)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}
            >
              <div className="text-sm font-bold text-[var(--t)] mb-3">{confirmPrompt.message}</div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmPrompt(null)} className="btn-outline-cta" data-testid="entity-confirm-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    const fn = confirmPrompt.action;
                    setConfirmPrompt(null);
                    if (fn) await fn();
                  }}
                  className="px-4 py-2 rounded-md text-sm font-semibold"
                  style={{ background: '#ef4444', color: '#fff' }}
                  data-testid="entity-confirm-yes"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
