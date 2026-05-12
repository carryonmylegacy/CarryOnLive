/**
 * EntityDetailPanel — slide-in panel that surfaces details for any node
 * tapped in the EntityOrgChart. Supports edit/delete for entities and
 * external people, surfaces the full set of incoming/outgoing
 * relationships, and lets the user add new relationships in place.
 */
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import SlidePanel from '../../SlidePanel';
import {
  ChevronLeft, Loader2, Trash2, Plus, Edit2, Users,
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../ui/button';
import { buildGraph, computeInitialLayout } from './EntityOrgChart';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { toast } from '../../../utils/toast';
import { API_URL } from '../../../config';
import {
  ROLE_OPTIONS, rolesForCategory, isEquityRole, FORMATION_STATES, getTypeMeta, getBucketMeta, getEntityPalette,
} from '../../../config/entityCatalog';
import DocumentLinker from './DocumentLinker';
import FinancialFields from './FinancialFields';
import EntityCredentialsField from './EntityCredentialsField';
import ExternalPersonPhotoField from './ExternalPersonPhotoField';
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
  chartLayout,
  onChanged,
  onLayoutOptimistic,
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
  // The connection picker always shows the full legal-role catalog.
  // The user explicitly wants "anything to anything using the proper
  // applicable legal terms" — i.e., never have a role hidden by a
  // category-based smart-default. (The expander state is kept so
  // future tweaks can re-introduce filtering without touching the
  // render code.)
  const [showAllRolesAdd, setShowAllRolesAdd] = useState(true);
  const [newPct, setNewPct] = useState('');
  // Bulk "Add beneficiaries" picker — lets the user multi-select
  // people from their beneficiary list and assign them all as
  // beneficiaries of the current entity in one tap. After save,
  // the platform auto-positions them in a tight horizontal row
  // beneath the entity so the tree stays visually tidy (vs. each
  // one having to be dragged into place individually).
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(() => new Set());
  // Whether to include the benefactor themselves as a beneficiary of
  // the entity (e.g. classic revocable trust where the grantor is also
  // a beneficiary). Defaults to off — user opts in via checkbox.
  const [bulkIncludeBenefactor, setBulkIncludeBenefactor] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  // Quick-add: people typed in directly inside the bulk modal that
  // don't exist on the estate yet. Each row holds {tmpId, first_name,
  // last_name} — on confirm we POST each to /financial/external-people
  // (no email required, unlike full beneficiaries) and then link them
  // to the entity in the same bulk operation. They auto-position
  // alongside the pre-existing beneficiaries in the tidy row.
  const [bulkNewPeople, setBulkNewPeople] = useState([]);
  const [bulkNewFirst, setBulkNewFirst] = useState('');
  const [bulkNewLast, setBulkNewLast] = useState('');
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
    const showPct = isEquityRole(newRole);
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

  // Bulk-add beneficiaries handler.
  // Creates a "beneficiary" relationship for every selected person in
  // parallel, then computes a tight horizontal row of override
  // positions beneath the entity so the auto-rendered tree stays
  // visually tidy. Override math mirrors the constants used by
  // EntityOrgChart (ENTITY_W=200, PERSON_W=110, COL_GAP=30, ROW_GAP=70)
  // so the bulk row aligns perfectly with the rest of the chart.
  const handleBulkAddBeneficiaries = async () => {
    if (!ent || bulkSaving) return;
    const existingIds = Array.from(bulkSelected);
    // Count existing beneficiaries already linked to this entity — if
    // there are any, the user can click Confirm with no new picks
    // just to re-tidy the existing cluster.
    const linkedKeyEarly = `entity:${ent.id}`;
    const existingCountEarly = (relationships || []).filter((r) =>
      r.role === 'beneficiary' && `${r.target_type}:${r.target_id}` === linkedKeyEarly
    ).length;
    if (existingIds.length === 0 && bulkNewPeople.length === 0 && !bulkIncludeBenefactor && existingCountEarly === 0) return;
    setBulkSaving(true);
    const headers = getAuthHeaders();
    try {
      // 0) Create any newly-typed people first so we have their
      // server IDs to link to. They're created as external_people
      // (no email required) — the chart still tags them with the
      // "Beneficiary" role chip via the relationship below.
      const createdExternals = await Promise.all(bulkNewPeople.map((p) => axios.post(
        `${API_URL}/financial/external-people`,
        {
          estate_id: ent.estate_id,
          first_name: p.first_name,
          last_name: p.last_name || null,
        },
        headers,
      ).then((r) => r.data)));

      // 1) Create the beneficiary relationships in parallel.
      // Direction matches the platform convention used everywhere else:
      // SOURCE = the person inheriting, TARGET = the entity they
      // inherit from, role = 'beneficiary'. (Earlier this was reversed,
      // which caused the API to return a 422 validation error rendered
      // in the toast as the unhelpful "[object Object]".)
      const linkOps = [
        ...existingIds.map((bid) => ({ source_id: bid, source_type: 'beneficiary' })),
        ...createdExternals.map((ep) => ({ source_id: ep.id, source_type: 'external_person' })),
      ];
      if (bulkIncludeBenefactor && user?.id) {
        linkOps.push({ source_id: user.id, source_type: 'user' });
      }
      await Promise.all(linkOps.map((op) => axios.post(
        `${API_URL}/financial/entity-relationships`,
        {
          estate_id: ent.estate_id,
          source_id: op.source_id,
          source_type: op.source_type,
          target_id: ent.id,
          target_type: 'entity',
          role: 'beneficiary',
          ownership_pct: null,
        },
        headers,
      )));

      // 2) Compute compact mini-grid positions beneath the entity.
      // Bulk-added beneficiaries render as a tight cluster of small
      // avatars (5 per row, wraps, staggered like bricks), flagged
      // with `mini: true` in the override so EntityOrgChart knows to
      // render them in mini mode. Stagger means even-numbered rows
      // (0, 2, …) are aligned to the entity center; odd rows offset
      // by half a column so circles sit BETWEEN circles above them.
      // Cluster constants:
      const ENTITY_W = 200, ENTITY_H = 92;
      const MINI_W = 56, MINI_H = 70;
      const MINI_COL_GAP = 8;      // horizontal gap between mini tiles
      const MINI_ROW_GAP = 4;      // vertical gap between cluster rows
      const CLUSTER_GAP = 50;      // gap between entity bottom and top row
      const PER_ROW = 5;
      const currentOverrides = (chartLayout && typeof chartLayout === 'object') ? chartLayout : {};
      const entityKey = `entity:${ent.id}`;
      // Resolve the entity's effective position in the chart. Priority:
      //   1. Saved override in `chartLayout` (user already dragged the
      //      entity to a custom spot)
      //   2. Naturally-computed initial layout (the position the
      //      EntityOrgChart would have placed the entity at if no
      //      override exists)
      //   3. Hard fallback (0, 0) — only happens if the graph is empty
      //
      // The previous code fell back STRAIGHT to (0, 0), which placed
      // the bulk-added mini cluster at the canvas origin regardless of
      // where the target entity actually rendered. The user reported
      // adding beneficiaries to "Harris Family Trust" only to see them
      // pop up under the top-level "Trust" tile with edges crossing
      // through the middle of Harris Family — that's the bug fixed here.
      let initialPositions = {};
      try {
        const g = buildGraph({ entities, externals, relationships, beneficiaries, user });
        const init = computeInitialLayout(g.nodes, g.depth);
        initialPositions = init?.positions || {};
      } catch {
        // If graph-build fails (e.g., during a partial mount), we fall
        // back to (0, 0) below — never throw.
      }
      const anchor = currentOverrides[entityKey]
        || initialPositions[entityKey]
        || { x: 0, y: 0 };
      // Combined ordered list of EVERY node connected to this entity
      // as a beneficiary — existing relationships (so the cluster
      // re-tidies them, not just newly-linked people) + newly-created
      // externals + benefactor if included. This is the trick that
      // makes the brick-stack happen even when the user opens the
      // modal with no new selections: clicking Confirm will simply
      // re-compact whoever is already linked.
      const linkedKey = `entity:${ent.id}`;
      const existingClusterKeys = (relationships || [])
        .filter((r) => r.role === 'beneficiary'
          && `${r.target_type}:${r.target_id}` === linkedKey)
        .map((r) => {
          // Match the EntityOrgChart per-trust instance keying: a
          // beneficiary→entity relationship resolves to the cloned
          // `beneficiary:<bid>@<eid>` node so multiple trusts can each
          // host their own visual instance of the same beneficiary.
          if (r.source_type === 'beneficiary') {
            return `beneficiary:${r.source_id}@${ent.id}`;
          }
          return `${r.source_type}:${r.source_id}`;
        });
      // De-dupe while preserving order: existing first, then
      // newly-added picks (avoiding double-add since the picker
      // already filtered out anyone in `alreadyLinked`), then new
      // externals, then benefactor.
      const orderedKeys = [];
      const seen = new Set();
      const pushIfNew = (k) => { if (!seen.has(k)) { seen.add(k); orderedKeys.push(k); } };
      existingClusterKeys.forEach(pushIfNew);
      // Newly-added beneficiaries also use the per-entity instance key
      // so they land in this trust's cluster (not in some unrelated
      // trust where the same beneficiary might already be visible).
      existingIds.forEach((bid) => pushIfNew(`beneficiary:${bid}@${ent.id}`));
      createdExternals.forEach((ep) => pushIfNew(`external_person:${ep.id}`));
      if (bulkIncludeBenefactor && user?.id) pushIfNew(`user:${user.id}`);
      const n = orderedKeys.length;
      const rowY0 = anchor.y + ENTITY_H + CLUSTER_GAP;
      const HALF_STEP = (MINI_W + MINI_COL_GAP) / 2;
      const additions = {};
      orderedKeys.forEach((key, i) => {
        const row = Math.floor(i / PER_ROW);
        const col = i % PER_ROW;
        const itemsInThisRow = Math.min(PER_ROW, n - row * PER_ROW);
        const rowW = itemsInThisRow * MINI_W + (itemsInThisRow - 1) * MINI_COL_GAP;
        // Even rows centered under the entity; odd rows shifted right
        // by half a column-step so the avatars on row N+1 sit between
        // the avatars on row N (brick / honeycomb feel).
        const stagger = row % 2 === 1 ? HALF_STEP : 0;
        const rowStartX = anchor.x + (ENTITY_W - rowW) / 2 + stagger;
        additions[key] = {
          x: rowStartX + col * (MINI_W + MINI_COL_GAP),
          y: rowY0 + row * (MINI_H + MINI_ROW_GAP),
          mini: true,
        };
      });

      // 3) Merge + persist. The layout endpoint replaces the whole
      // overrides map, so we MUST include every existing override or
      // the user's prior drags will be wiped. Also pin the target
      // entity's own position to its current anchor — otherwise if
      // the entity had no prior override, the next layout-recompute
      // could move it out from under the freshly-positioned mini
      // cluster, and the cluster would drift visually.
      const merged = {
        ...currentOverrides,
        // Only write the entity anchor if it isn't already a saved
        // override (don't clobber an existing user-drag position).
        ...(currentOverrides[entityKey] ? {} : { [entityKey]: { x: anchor.x, y: anchor.y } }),
        ...additions,
      };

      // 3a) Apply the merged layout to the parent's local state
      // BEFORE awaiting the network round-trip. Two reasons:
      //
      //   • Snappier UI — the mini cluster snaps into place
      //     instantly rather than waiting for both the PUT and the
      //     subsequent fetchAll to complete.
      //   • Resilience — if the layout PUT silently fails (403
      //     because the user isn't the estate owner, 500 from a
      //     backend hiccup, etc.), the user STILL sees the correct
      //     mini cluster instead of full-size avatars with spaghetti
      //     edges. Previously the .catch(()=>{}) on the PUT swallowed
      //     the error and the user had no idea persistence had been
      //     lost; this turn we both keep the visual state correct
      //     locally AND surface a warning toast if the persist fails.
      if (typeof onLayoutOptimistic === 'function') {
        try { onLayoutOptimistic(merged); } catch { /* parent will heal on next fetchAll */ }
      }

      let putFailed = false;
      let putError = null;
      try {
        await axios.put(
          `${API_URL}/financial/entities/${ent.estate_id}/layout`,
          { overrides: merged },
          headers,
        );
      } catch (err) {
        putFailed = true;
        putError = err;
        // Don't re-throw — relationships were already saved
        // successfully and the user has the correct visual state
        // thanks to the optimistic local update above.
        console.warn('Bulk-add: layout save failed (cluster will revert on hard reload).', err?.response?.status, err?.response?.data);
      }

      const newlyAdded = existingIds.length + createdExternals.length + (bulkIncludeBenefactor && user?.id ? 1 : 0);
      if (newlyAdded > 0) {
        toast.success(`Added ${newlyAdded} — cluster of ${n} compacted.`);
      } else {
        toast.success(`Compacted ${n} beneficiar${n === 1 ? 'y' : 'ies'} into a mini cluster.`);
      }
      if (putFailed) {
        // Beneficiary relationships were saved successfully and the
        // local view shows the correct mini cluster, but the layout
        // override didn't persist server-side. Tell the user so they
        // know to re-tidy (and report a status code if there is one).
        const status = putError?.response?.status;
        toast.warning(
          status === 403
            ? 'Cluster shape saved locally — only the estate owner can persist layout.'
            : 'Cluster shape saved locally — layout sync failed; reload may reset shape.'
        );
      }
      setBulkOpen(false);
      setBulkSelected(new Set());
      setBulkIncludeBenefactor(false);
      setBulkNewPeople([]);
      setBulkNewFirst(''); setBulkNewLast('');
      onChanged?.();
    } catch (err) {
      // FastAPI validation errors come back as `detail: [{loc, msg, …}]`,
      // which renders as "[object Object]" if dumped directly into the
      // toast. Normalize to a readable string before showing the user.
      const detail = err?.response?.data?.detail;
      let message = 'Failed to add beneficiaries';
      if (typeof detail === 'string') message = detail;
      else if (Array.isArray(detail)) message = detail.map((d) => d?.msg || JSON.stringify(d)).join('; ');
      else if (detail && typeof detail === 'object') message = JSON.stringify(detail);
      else if (err?.message) message = err.message;
      toast.error(message);
    } finally {
      setBulkSaving(false);
    }
  };

  // -------- render --------
  // Use the platform's proven SlidePanel component (used by every other
  // slide-in surface across CarryOn). It ships with a battle-tested
  // mobile/PWA scroll mechanism (`position: absolute; top:48px; bottom:0;
  // overflow-y:auto`) that gives the inner scroller a concrete pixel
  // height — unlike a flex-1 child of `100dvh`, that survives iOS PWA
  // standalone, OverlayScrollbars ancestors, and transform parents.
  const titleText = isEntity
    ? (ent?.name || 'Untitled entity')
    : isExternal
      ? `${node.label} ${externals.find(x => x.id === node.id)?.last_name || ''}`.trim()
      : node.label;
  const subtitleText = isEntity
    ? `${getBucketMeta(ent?.category)?.label || ''} · ${meta?.friendly || ''}`
    : isExternal
      ? 'Outside party (not in beneficiaries)'
      : node.kind === 'beneficiary' ? 'Beneficiary' : 'You';

  return (
    <SlidePanel open={open} onClose={onClose} title={titleText} subtitle={subtitleText}>
      <div className="cfp-edit-surface space-y-4" data-testid="entity-detail-panel">
        {/* Edit-mode entry button (top-right of body, only shown when not editing) */}
        {(isEntity || isExternal) && !editing && (
          <div className="flex justify-end">
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-bold text-[#3b82f6] hover:underline inline-flex items-center gap-1"
              data-testid="detail-edit"
              aria-label="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          </div>
        )}
          {/* Entity edit mode */}
          {isEntity && editing && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-[var(--t4)]">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="input-field" data-testid="detail-edit-name" />
              </div>
              {meta?.state_relevant && (
                <div className="space-y-2 border-t border-[var(--b2)] pt-4">
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
              <div className="space-y-2 border-t border-[var(--b2)] pt-4">
                <Label className="text-[var(--t4)]">Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field min-h-[80px]" rows={3} />
              </div>
              <div className="space-y-2 border-t border-[var(--b2)] pt-4">
                <Label className="text-[var(--t4)]">Financial snapshot</Label>
                <FinancialFields
                  assets={grossAssets}
                  debts={grossDebts}
                  onChange={({ assets, debts }) => { setGrossAssets(assets); setGrossDebts(debts); }}
                />
              </div>
              <div className="space-y-2 border-t border-[var(--b2)] pt-4">
                <Label className="text-[var(--t4)]">Linked documents (SDV)</Label>
                <DocumentLinker
                  value={linkedDocIds}
                  onChange={setLinkedDocIds}
                  documents={documents || []}
                />
              </div>
              <div className="space-y-2 border-t border-[var(--b2)] pt-4">
                <Label className="text-[var(--t4)]">
                  Digital credentials
                  <span className="text-[11px] font-normal text-[var(--t5)] ml-1.5">— saved to your DAV</span>
                </Label>
                <EntityCredentialsField
                  credentials={credentials}
                  onChange={setCredentials}
                  defaultAccountName={name ? `${name} portal` : ''}
                  davEntries={walletEntries || []}
                />
              </div>
              {/* Cancel / Save changes are rendered at the very bottom
                  of the panel (after the connections section) so the
                  user always lands on the action buttons after they've
                  reviewed every section. See the editing-actions block
                  near the end of this file. */}
            </div>
          )}

          {/* External person edit mode */}
          {isExternal && editing && (
            <div className="space-y-3">
              <ExternalPersonPhotoField
                personId={node.id}
                currentUrl={(externals || []).find((p) => p.id === node.id)?.photo_url || null}
                getAuthHeaders={getAuthHeaders}
                onUploaded={() => onChanged?.()}
              />
              <div className="space-y-2 border-t border-[var(--b2)] pt-4"><Label>First name</Label>
                <Input value={extFirst} onChange={(e) => setExtFirst(e.target.value)} className="input-field" /></div>
              <div className="space-y-2 border-t border-[var(--b2)] pt-4"><Label>Last name</Label>
                <Input value={extLast} onChange={(e) => setExtLast(e.target.value)} className="input-field" /></div>
              <div className="space-y-2 border-t border-[var(--b2)] pt-4"><Label>Notes</Label>
                <Textarea value={extNotes} onChange={(e) => setExtNotes(e.target.value)} className="input-field min-h-[80px]" rows={3} /></div>
              {/* Cancel / Save changes rendered at the bottom — see
                  the editing-actions block near the end of this file. */}
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
            </>
          )}

          {/* Connections section — ALWAYS visible (in both edit-mode and
              read-only mode). The "Add a connection" button used to be
              gated behind !editing, which meant a user who tapped the
              pencil on a Trust tile to add themselves as a beneficiary
              was stuck staring at the entity edit form with no obvious
              way to manage relationships. Pulling it out of the edit
              gate makes the feature discoverable from every entry point
              into this panel. */}
          {isEntity && (
            <>
                  <div className="border-t border-[var(--b2)] pt-4">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-2">Who connects in</div>
                    {incomingRels.length === 0 && (
                      <div className="text-[12px] text-[var(--t5)] italic">No connections yet.</div>
                    )}
                    {incomingRels.map((r) => {
                      const role = ROLE_OPTIONS.find((x) => x.id === r.role);
                      return (
                        <div key={r.id} className="flex items-center gap-2 p-2 rounded-md" style={{ background: 'var(--card)', border: '1px solid var(--b2)' }}>
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
                          <div key={r.id} className="flex items-center gap-2 p-2 rounded-md" style={{ background: 'var(--card)', border: '1px solid var(--b2)' }}>
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
                    <div className="flex flex-col items-stretch gap-2 pt-1">
                      <button
                        onClick={() => setAddingConn(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold text-[var(--gold)] whitespace-nowrap border border-[var(--gold)]/70 bg-[rgba(212,165,55,0.10)] hover:bg-[rgba(212,165,55,0.20)] hover:border-[var(--gold)] transition-colors"
                        data-testid="detail-add-conn"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add a connection
                      </button>
                      {/* Bulk-add beneficiaries — separate button so the
                          user can assign many people at once without
                          stepping through the single-connection wizard
                          N times. Always available; the modal lets the
                          user pick from the beneficiary list AND/OR
                          quick-add new people inline. */}
                      <button
                        onClick={() => { setBulkSelected(new Set()); setBulkIncludeBenefactor(false); setBulkNewPeople([]); setBulkOpen(true); }}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold text-[#22C993] whitespace-nowrap border border-[#22C993]/60 bg-[rgba(34,201,147,0.08)] hover:bg-[rgba(34,201,147,0.18)] hover:border-[#22C993] transition-colors"
                        data-testid="detail-bulk-add-beneficiaries"
                      >
                        <Users className="w-3.5 h-3.5" /> Add beneficiaries (bulk)
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl space-y-2" style={{ background: 'var(--card)', border: '1px solid var(--b2)' }}>
                      <Label className="text-[11px] text-[var(--t4)]">Connected to</Label>
                      <Select value={newSourceKey} onValueChange={setNewSourceKey}>
                        <SelectTrigger className="input-field select-themed"><SelectValue placeholder="Select a person or entity" /></SelectTrigger>
                        <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)] max-h-64">
                          {sourceOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Label className="text-[11px] text-[var(--t4)] mt-2">As the…</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {rolesForCategory(ent?.category, showAllRolesAdd).map((r) => (
                          <button
                            key={r.id}
                            onClick={() => setNewRole(r.id)}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-full transition-all"
                            style={{
                              background: newRole === r.id ? 'var(--gold)' : 'transparent',
                              color: newRole === r.id ? '#0b1120' : 'var(--t3)',
                              border: newRole === r.id ? '1px solid var(--gold)' : '1px solid var(--b)',
                            }}
                            title={r.help}
                          >
                            {r.label}
                          </button>
                        ))}
                        {!showAllRolesAdd && ent?.category && (
                          <button
                            type="button"
                            onClick={() => setShowAllRolesAdd(true)}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-full transition-all text-[var(--gold)]"
                            style={{ border: '1px dashed rgba(212,165,55,0.45)' }}
                            data-testid="detail-add-conn-role-show-all"
                          >
                            + Show all roles
                          </button>
                        )}
                      </div>
                      {isEquityRole(newRole) && (
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

                  {!editing && (
                    <div className="pt-2 border-t border-[var(--b2)]">
                      <Button
                        variant="ghost"
                        onClick={handleDeleteEntity}
                        className="text-[#ef4444] hover:bg-[rgba(239,68,68,0.1)] w-full"
                        data-testid="detail-delete-entity"
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete this entity
                      </Button>
                    </div>
                  )}
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
                  {!editing && (
                    <div className="pt-2 border-t border-[var(--b2)]">
                      <Button
                        variant="ghost"
                        onClick={handleDeleteExternal}
                        className="text-[#ef4444] hover:bg-[rgba(239,68,68,0.1)] w-full"
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Remove this person
                      </Button>
                    </div>
                  )}
                </>
              )}

        {/* Bottom-of-panel Cancel / Save changes — always rendered at
            the very end of the scroll surface (after the connections
            section) when the user is editing, so the action buttons
            are the LAST thing the user sees before the dock. The two
            edit forms above used to render their own inline buttons
            mid-page; users had to scroll past them to manage
            connections. Single canonical block here removes that
            confusion. */}
        {editing && (isEntity || isExternal) && (
          <div className="flex gap-2 pt-4 border-t border-[var(--b2)]">
            <Button
              variant="outline"
              onClick={() => setEditing(false)}
              className="btn-outline-cta"
              data-testid="detail-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={isEntity ? handleSaveEntity : handleSaveExternal}
              disabled={saving}
              className="btn-gold-cta px-4 py-2 rounded-md text-sm font-semibold"
              data-testid="detail-save"
            >
              {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</> : 'Save changes'}
            </Button>
          </div>
        )}

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

        {/* Bulk-add beneficiaries modal — multi-select picker. Filters
            out anyone who is already a beneficiary of this entity so
            the user can't double-link. After confirm, every selected
            person is linked + auto-positioned in a tidy row. */}
        {bulkOpen && isEntity && (() => {
          const linkedKey = `entity:${ent.id}`;
          // Pre-existing beneficiary IDs already linked as a
          // beneficiary of this entity (source-side, per the corrected
          // relationship direction).
          const alreadyLinked = new Set(
            (relationships || [])
              .filter((r) => r.role === 'beneficiary'
                && `${r.target_type}:${r.target_id}` === linkedKey
                && r.source_type === 'beneficiary')
              .map((r) => r.source_id)
          );
          // Is the benefactor themselves already linked as a
          // beneficiary of this entity? (Same role, source = user).
          const benefactorAlreadyLinked = (relationships || []).some(
            (r) => r.role === 'beneficiary'
              && `${r.target_type}:${r.target_id}` === linkedKey
              && r.source_type === 'user'
              && r.source_id === user?.id
          );
          const pickable = (beneficiaries || []).filter((b) => !alreadyLinked.has(b.id));
          // Count of beneficiaries currently linked to this entity —
          // enables the Confirm button even with 0 new picks so the
          // user can re-tidy the existing cluster (snap to mini grid).
          const existingCount = (relationships || []).filter((r) =>
            r.role === 'beneficiary' && `${r.target_type}:${r.target_id}` === linkedKey
          ).length;
          const allSelected = pickable.length > 0 && pickable.every((b) => bulkSelected.has(b.id));
          const toggle = (bid) => {
            const next = new Set(bulkSelected);
            if (next.has(bid)) next.delete(bid); else next.add(bid);
            setBulkSelected(next);
          };
          const toggleAll = () => {
            if (allSelected) setBulkSelected(new Set());
            else setBulkSelected(new Set(pickable.map((b) => b.id)));
          };
          return createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
              data-testid="bulk-add-beneficiaries-overlay"
              onClick={() => !bulkSaving && setBulkOpen(false)}
              style={{
                // Belt-and-suspenders: the picker dialog ALWAYS scrolls
                // internally. iOS Safari was bubbling vertical-swipe
                // gestures to the SlidePanel below because the dialog
                // used to be rendered as a `position: absolute` child
                // of the SlidePanel's own overflow-y scroller. We now
                // portal the dialog to document.body so it lives in a
                // sibling layer of the page chrome — no parent scroller
                // to leak gestures into.
                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
                paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
              }}
            >
              <div
                className="rounded-2xl max-w-sm w-full flex flex-col"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--b)',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                  // The outer overlay already pads for safe areas, so
                  // 100% here means "all the available space inside the
                  // padded region." That guarantees the Confirm/Cancel
                  // footer stays above the iPhone home indicator and
                  // the inner scroll body has somewhere to scroll to.
                  maxHeight: '100%',
                }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                data-testid="bulk-add-beneficiaries-modal"
              >
                <div className="px-5 pt-5 pb-3 border-b border-[var(--b2)]">
                  <div className="text-[15px] font-bold text-[var(--t)]">Add beneficiaries</div>
                  <div className="text-[11px] text-[var(--t4)] mt-0.5">
                    Pick everyone who inherits from <span style={{ color: 'var(--gold)' }}>{ent?.name || 'this entity'}</span>. We'll fan them out in a tidy row below the tile — no dragging required.
                  </div>
                </div>

                <div
                  className="flex-1 min-h-0 overflow-y-auto px-5 py-3"
                  style={{
                    // iOS Safari requires these explicit hints to allow
                    // touch-scrolling inside a dialog that lives inside
                    // a `position: fixed` SlidePanel. Without them, the
                    // gesture bubbles up to the SlidePanel's own
                    // scroller (the user saw the SlidePanel scrollbar
                    // moving in the background while this picker stayed
                    // frozen) and the bulk-add picker is unreachable
                    // past the visible viewport.
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-y',
                    overscrollBehavior: 'contain',
                  }}
                >
                  {pickable.length === 0 && bulkNewPeople.length === 0 && benefactorAlreadyLinked ? (
                    <div className="text-[12px] text-[var(--t4)] py-4 text-center">
                      Every beneficiary on this estate (and you) is already linked to {ent?.name || 'this entity'}. Add a new person below to include someone else.
                    </div>
                  ) : (
                    <>
                      {pickable.length > 0 && (
                        <button
                          type="button"
                          onClick={toggleAll}
                          className="text-[11px] font-bold uppercase tracking-wide text-[var(--gold)] mb-2"
                          data-testid="bulk-add-toggle-all"
                        >
                          {allSelected ? 'Clear all' : 'Select all'}
                        </button>
                      )}
                      <div className="space-y-1.5">
                        {/* Benefactor (estate owner) row — lets the
                            user include THEMSELVES as a beneficiary
                            of the entity (e.g. classic revocable
                            trust where the grantor is also a
                            current beneficiary). Hidden if they're
                            already linked to this entity. */}
                        {!benefactorAlreadyLinked && user?.id && (
                          <label
                            key="__benefactor__"
                            className="flex items-center gap-3 p-2 rounded-md cursor-pointer"
                            style={{
                              background: bulkIncludeBenefactor ? 'rgba(212,165,55,0.10)' : 'var(--card)',
                              border: `1px solid ${bulkIncludeBenefactor ? 'var(--gold)' : 'var(--b2)'}`,
                            }}
                            data-testid="bulk-add-row-benefactor"
                          >
                            <input
                              type="checkbox"
                              checked={bulkIncludeBenefactor}
                              onChange={() => setBulkIncludeBenefactor((v) => !v)}
                              className="w-4 h-4 accent-[var(--gold)]"
                              data-testid="bulk-add-check-benefactor"
                            />
                            {user.photo_url ? (
                              <img src={user.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
                                style={{ background: 'var(--gold)', color: '#0b1120' }}
                              >
                                {((user.first_name || user.name || 'Y')[0] || 'Y').toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-semibold text-[var(--t)] truncate">
                                You ({(user.first_name || user.name || 'Benefactor')}{user.last_name ? ' ' + user.last_name : ''})
                              </div>
                              <div className="text-[11px] truncate" style={{ color: 'var(--gold)' }}>
                                Benefactor — also a beneficiary
                              </div>
                            </div>
                          </label>
                        )}
                        {pickable.map((b) => {
                          const checked = bulkSelected.has(b.id);
                          const label = `${b.first_name || b.name || 'Beneficiary'}${b.last_name ? ' ' + b.last_name : ''}`;
                          return (
                            <label
                              key={b.id}
                              className="flex items-center gap-3 p-2 rounded-md cursor-pointer"
                              style={{
                                background: checked ? 'rgba(34,201,147,0.10)' : 'var(--card)',
                                border: `1px solid ${checked ? '#22C993' : 'var(--b2)'}`,
                              }}
                              data-testid={`bulk-add-row-${b.id}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggle(b.id)}
                                className="w-4 h-4 accent-[#22C993]"
                                data-testid={`bulk-add-check-${b.id}`}
                              />
                              {b.photo_url ? (
                                <img src={b.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                              ) : (
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
                                  style={{ background: b.avatar_color || 'var(--gold)', color: '#0b1120' }}
                                >
                                  {(b.first_name?.[0] || 'B').toUpperCase()}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-semibold text-[var(--t)] truncate">{label}</div>
                                {b.relation && (
                                  <div className="text-[11px] text-[var(--t4)] truncate">{b.relation}</div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                        {/* Just-typed new people — auto-included in the
                            bulk action, with a × to remove if the user
                            changes their mind before confirming. */}
                        {bulkNewPeople.map((p) => {
                          const label = `${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`;
                          return (
                            <div
                              key={p.tmpId}
                              className="flex items-center gap-3 p-2 rounded-md"
                              style={{ background: 'rgba(34,201,147,0.10)', border: '1px solid #22C993' }}
                              data-testid={`bulk-add-new-row-${p.tmpId}`}
                            >
                              <div className="w-4 h-4 flex items-center justify-center text-[#22C993] text-[11px] font-bold">NEW</div>
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
                                style={{ background: '#22C993', color: '#0b1120' }}
                              >
                                {(p.first_name?.[0] || '?').toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-semibold text-[var(--t)] truncate">{label}</div>
                                <div className="text-[11px] text-[var(--t4)] truncate">Will be created on save</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setBulkNewPeople((prev) => prev.filter((x) => x.tmpId !== p.tmpId))}
                                className="text-[#ef4444] hover:opacity-70 p-1"
                                aria-label="Remove"
                                data-testid={`bulk-add-new-remove-${p.tmpId}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Inline new-person mini-form — lets the user add
                      someone who isn't yet in their beneficiary list
                      directly into the bulk operation. They get
                      created as external_people (no email required)
                      and tagged with the "Beneficiary" chip via the
                      relationship role on save. */}
                  <div className="mt-4 pt-3 border-t border-[var(--b2)]">
                    <Label className="text-[11px] text-[var(--t4)]">Not in your list? Add a new person</Label>
                    <div className="flex gap-2 mt-1.5">
                      <Input
                        value={bulkNewFirst}
                        onChange={(e) => setBulkNewFirst(e.target.value)}
                        placeholder="First name"
                        className="input-field flex-1"
                        data-testid="bulk-add-new-first"
                      />
                      <Input
                        value={bulkNewLast}
                        onChange={(e) => setBulkNewLast(e.target.value)}
                        placeholder="Last name (optional)"
                        className="input-field flex-1"
                        data-testid="bulk-add-new-last"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const first = bulkNewFirst.trim();
                        if (!first) return;
                        setBulkNewPeople((prev) => [...prev, {
                          tmpId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                          first_name: first,
                          last_name: bulkNewLast.trim(),
                        }]);
                        setBulkNewFirst(''); setBulkNewLast('');
                      }}
                      disabled={!bulkNewFirst.trim()}
                      className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-full text-[12px] font-bold border border-[#22C993]/60 text-[#22C993] bg-[rgba(34,201,147,0.08)] hover:bg-[rgba(34,201,147,0.18)] disabled:opacity-40 disabled:cursor-not-allowed"
                      data-testid="bulk-add-new-submit"
                    >
                      <Plus className="w-3 h-3" /> Queue this person
                    </button>
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-[var(--b2)] flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBulkOpen(false);
                      setBulkSelected(new Set());
                      setBulkIncludeBenefactor(false);
                      setBulkNewPeople([]);
                      setBulkNewFirst(''); setBulkNewLast('');
                    }}
                    disabled={bulkSaving}
                    className="btn-outline-cta"
                    data-testid="bulk-add-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleBulkAddBeneficiaries}
                    disabled={bulkSaving || (bulkSelected.size === 0 && bulkNewPeople.length === 0 && !bulkIncludeBenefactor && existingCount === 0)}
                    className="px-4 py-2 rounded-md text-sm font-semibold"
                    style={{ background: '#22C993', color: '#0b1120' }}
                    data-testid="bulk-add-confirm"
                  >
                    {(() => {
                      if (bulkSaving) return <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</>;
                      const newCount = bulkSelected.size + bulkNewPeople.length + (bulkIncludeBenefactor ? 1 : 0);
                      const total = newCount + existingCount;
                      if (newCount === 0 && existingCount > 0) {
                        return `Compact ${existingCount} beneficiar${existingCount === 1 ? 'y' : 'ies'}`;
                      }
                      return `Add ${newCount}${existingCount ? ` + compact ${existingCount}` : ''} (${total} total)`;
                    })()}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          );
        })()}
      </div>
    </SlidePanel>
  );
}
