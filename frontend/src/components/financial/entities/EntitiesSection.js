/**
 * EntitiesSection — the new Entities & Structures area on the CFP page.
 *
 * Renders ABOVE the FinancialSummary tiles. Stays completely hidden until
 * the user creates their first entity. Once populated, height/width grows
 * commensurately with the structure's complexity.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { notify } from '../../AppNotification';
import { useNavigate } from 'react-router-dom';
import { Plus, Network, List as ListIcon, Maximize2, RotateCcw, Wand2, Lock, Unlock, Frame, Crosshair, Map, Printer, Users } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../ui/button';
import { API_URL } from '../../../config';
import EntityOrgChart, { resetEntityChartPositions } from './EntityOrgChart';
import EntityWizard from './EntityWizard';
import EntityDetailPanel from './EntityDetailPanel';
import EntityListView from './EntityListView';
import EntityQuickInfoPopover from './EntityQuickInfoPopover';
import EntityDocumentsModal from './EntityDocumentsModal';
import EntitiesShareToggle from './EntitiesShareToggle';
import EntityLegend from './EntityLegend';
import BlockEditModal from './BlockEditModal';

const DRAFT_KEY = (estateId) => `cfp:entityWizard:draft:${estateId || 'global'}`;
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
// Per-estate preference: should the E&S chart open zoomed-out to fit
// the whole tree, or 1× centered on the benefactor? Persists across
// reloads so users with sprawling structures don't have to re-toggle.
const FIT_KEY = (estateId) => `cfp:entities:fit-on-load:${estateId || 'global'}`;

export default function EntitiesSection({ estateId, beneficiaries, onEntitiesChanged, openEntityId }) {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [freshUser, setFreshUser] = useState(null);
  const [entities, setEntities] = useState([]);
  const [externals, setExternals] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [blocks, setBlocks] = useState([]); // beneficiary_blocks for this estate
  const [serverChartLayout, setServerChartLayout] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [walletEntries, setWalletEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [quickInfoNode, setQuickInfoNode] = useState(null);
  const [quickInfoRect, setQuickInfoRect] = useState(null);
  const [docsModalEntity, setDocsModalEntity] = useState(null);
  const [editingNode, setEditingNode] = useState(null); // opens the full SlidePanel
  const [editStartInEdit, setEditStartInEdit] = useState(false); // pencil shortcut
  const [viewMode, setViewMode] = useState('chart'); // 'chart' | 'list'
  const [expanded, setExpanded] = useState(false);
  const [blocksExpanded, setBlocksExpanded] = useState(false);
  // When the user clicks a row in the Blocks Summary card we bump
  // both the focus key (= the chart node key to center on) AND a
  // nonce so consecutive clicks on the same row still re-fire the
  // chart's focus effect.
  const [chartFocusKey, setChartFocusKey] = useState(null);
  const [chartFocusNonce, setChartFocusNonce] = useState(0);
  // Block-edit modal — opens when the user taps the pencil on a
  // named-block tile. Lets them rename + change membership in one
  // place. `editingBlock` holds the full block object (name +
  // members) so the modal can seed its form without an extra fetch.
  const [editingBlock, setEditingBlock] = useState(null);
  const focusOnBlock = useCallback((blockId) => {
    setChartFocusKey(`block:${blockId}`);
    setChartFocusNonce((n) => n + 1);
  }, []);
  const [resetTick, setResetTick] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [cleanUpSignal, setCleanUpSignal] = useState(0);
  // Auto-lock the chart on every CFP mount. This means panning around
  // (single-finger swipe / two-finger trackpad scroll) never
  // accidentally drags a tile when the user just came back from
  // somewhere else. To move tiles, the user has to deliberately tap
  // the lock chip to unlock first. We intentionally ignore any
  // previously-persisted unlocked state — locked is the safe default
  // every time CFP appears.
  const [locked, setLocked] = useState(true);
  // "Open the chart fit-to-screen" preference. Default = false (open at
  // 1× centered on the benefactor — feels right for small trees). Users
  // with bigger structures can flip it on and we remember per estate.
  // Default view = Centered (1× centered on the benefactor). Users who
  // previously opted into Fit Tree (localStorage value === '1') keep it.
  const [fitOnLoad, setFitOnLoad] = useState(() => {
    try { return window.localStorage?.getItem(FIT_KEY(estateId)) === '1'; }
    catch { return false; }
  });
  // Legend visibility — persists per estate so the user's last
  // preference survives a portal switch / hard reload.
  const [legendHidden, setLegendHidden] = useState(() => EntityLegend.readHiddenForEstate(estateId));
  useEffect(() => {
    setLegendHidden(EntityLegend.readHiddenForEstate(estateId));
  }, [estateId]);
  const showLegend = () => {
    EntityLegend.writeHiddenForEstate(estateId, false);
    setLegendHidden(false);
  };
  useEffect(() => {
    try { setFitOnLoad(window.localStorage?.getItem(FIT_KEY(estateId)) === '1'); }
    catch { setFitOnLoad(false); }
  }, [estateId]);
  const toggleFit = () => {
    setFitOnLoad((prev) => {
      const next = !prev;
      try { window.localStorage?.setItem(FIT_KEY(estateId), next ? '1' : '0'); } catch { /* quota */ }
      return next;
    });
  };

  // Re-arm the lock whenever the estate changes too (covers
  // portal-switching that reuses the same component instance).
  useEffect(() => { setLocked(true); }, [estateId]);

  // If the user was mid-wizard and navigated away (bottom nav, sidebar,
  // a deep link), drop them right back into the wizard when the CFP
  // page remounts — drafts live in localStorage scoped per estate and
  // expire after 24 h. Resuming once is enough; if they close the
  // wizard explicitly the draft is wiped.
  useEffect(() => {
    if (!estateId) return;
    try {
      const raw = window.localStorage?.getItem(DRAFT_KEY(estateId));
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || !d.savedAt || Date.now() - d.savedAt > DRAFT_TTL_MS) {
        window.localStorage?.removeItem(DRAFT_KEY(estateId));
        return;
      }
      setShowWizard(true);
    } catch { /* malformed draft */ }
  }, [estateId]);

  const toggleLocked = () => {
    // Just flip the in-memory lock — we no longer persist it because
    // the rule is "always locked on CFP mount" so the user can pan
    // without fear of accidentally moving tiles.
    setLocked((prev) => !prev);
  };

  // Deep-link: when arriving via `/financial?openEntity=<id>` from the
  // SDV or DAV, scroll the entities surface into view and open the
  // matching entity's detail panel. Runs once entities are loaded so we
  // can resolve the id to a node.
  const sectionRef = React.useRef(null);
  useEffect(() => {
    if (!openEntityId || !loaded) return;
    const ent = entities.find((e) => e.id === openEntityId);
    if (!ent) return;
    sectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    setEditingNode({ key: `entity:${ent.id}`, kind: 'entity', id: ent.id, label: ent.name, entity: ent });
    setEditStartInEdit(false);
  }, [openEntityId, loaded, entities]);

  const fetchAll = useCallback(async () => {
    if (!estateId) return;
    try {
      const [r, docResp, meResp, walletResp] = await Promise.all([
        axios.get(`${API_URL}/financial/entities/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/documents/${estateId}`, getAuthHeaders()).catch(() => ({ data: [] })),
        // Re-fetch the user so photo_url is always the freshest from settings,
        // even if the AuthContext has a stale value cached from login.
        axios.get(`${API_URL}/auth/me`, getAuthHeaders()).catch(() => ({ data: null })),
        axios.get(`${API_URL}/digital-wallet/${estateId}`, getAuthHeaders()).catch(() => ({ data: [] })),
      ]);
      setEntities(r.data?.entities || []);
      setExternals(r.data?.external_people || []);
      setRelationships(r.data?.relationships || []);
      setBlocks(r.data?.beneficiary_blocks || []);
      // chart_layout may be undefined if the server is older — leave
      // it as null in that case so the chart falls back to local
      // overrides cleanly.
      setServerChartLayout(r.data?.chart_layout || null);
      setDocuments(Array.isArray(docResp.data) ? docResp.data : []);
      setWalletEntries(Array.isArray(walletResp.data) ? walletResp.data : []);
      if (meResp.data) setFreshUser(meResp.data);
    } catch {
      // Surface = silent for read failures
    } finally {
      setLoaded(true);
    }
  }, [estateId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const isEmpty = entities.length === 0 && externals.length === 0;

  // Section height grows to fit content, capped at 50dvh / 90dvh expanded.
  const maxH = expanded ? '90vh' : '50vh';

  // The user object passed downstream uses the freshest photo_url
  // available — fall back to the auth-context user when /auth/me hasn't
  // returned yet so the chart always has SOMETHING to render.
  const effectiveUser = freshUser || user;

  // Per-tile delete dispatcher fired by EntityOrgChart's Remove modal.
  // Defined here (before any early returns) so React's hook ordering
  // stays stable on the loading-skeleton vs full-render paths. The
  // chart's modal has already confirmed user intent — this just hits
  // the right backend endpoint based on node kind and refetches.
  // Returns a Promise so the modal can show a "Deleting…" state and
  // close itself on success / leave open on error.
  const handleDeleteNode = useCallback(async (node) => {
    if (!node) return;
    const headers = getAuthHeaders();
    try {
      if (node.kind === 'entity') {
        await axios.delete(`${API_URL}/financial/entities/${node.id}`, headers);
      } else if (node.kind === 'cluster') {
        // Cluster represents N beneficiary→entity relationships for
        // a single entity. Delete every matching relationship in
        // parallel; the underlying beneficiary records stay intact.
        const entityId = node.id;
        const rels = (relationships || []).filter((r) =>
          r.source_type === 'beneficiary'
          && r.target_type === 'entity'
          && r.target_id === entityId
          && r.role === 'beneficiary'
        );
        await Promise.all(rels.map((r) => axios.delete(
          `${API_URL}/financial/entity-relationships/${r.id}`,
          headers,
        )));
      } else if (node.kind === 'beneficiary') {
        await axios.delete(`${API_URL}/beneficiaries/${node.id}`, headers);
      } else if (node.kind === 'external_person') {
        await axios.delete(`${API_URL}/financial/external-people/${node.id}`, headers);
      } else if (node.kind === 'block') {
        // Soft-deletes the block + cascade-unlinks every entity it
        // was attached to (handled server-side).
        await axios.delete(`${API_URL}/financial/beneficiary-blocks/${node.id}`, headers);
      } else {
        // node.kind === 'user' shouldn't reach here — the chart's
        // modal hides the Delete button for the benefactor — but
        // bail loudly so a future regression is obvious.
        notify.error("This tile can't be deleted (it's your own benefactor record).");
        return;
      }
      // Success: the chart already showed an undoable "Deleted X"
      // toast, so we stay silent here to avoid double-toasting.
      // Refresh local state + bubble up so sibling cards (CFP totals,
      // beneficiary count chip, etc.) re-read.
      await fetchAll();
      onEntitiesChanged?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      let msg = 'Delete failed';
      if (typeof detail === 'string') msg = detail;
      else if (Array.isArray(detail)) msg = detail.map((d) => d?.msg || JSON.stringify(d)).join('; ');
      else if (err?.message) msg = err.message;
      notify.error(msg);
      throw err; // chart will restore the optimistically-hidden tile
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAuthHeaders, relationships, onEntitiesChanged]);

  if (!estateId) return null;
  if (!loaded) {
    // Render a same-shape skeleton placeholder while `fetchAll` is
    // in flight. The user previously complained that the CFP page would
    // paint, then ~2-3 s later the E&S section would mount and shove
    // the Financial Summary tiles downward. We now reserve roughly the
    // same vertical space up front so there is no jump-down on load.
    // After load completes:
    //   • If the estate has no entities, the section unmounts and the
    //     summary tiles slide up once (single small one-time shift,
    //     down→up instead of the prior up→down) — far less jarring.
    //   • If the estate has entities, the skeleton swaps for the real
    //     tree in-place with effectively no layout shift.
    return (
      <div
        className="mb-6 rounded-2xl overflow-hidden"
        data-testid="entities-section-skeleton"
        style={{
          background: 'var(--bg2, #0F1729)',
          border: '1px solid var(--b, rgba(255,255,255,0.06))',
          minHeight: '280px',
          position: 'relative',
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.10)' }}>
            <Network className="w-4 h-4" style={{ color: '#d4af37' }} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold" style={{ color: 'var(--t)' }}>Entities &amp; Structures</div>
            <div className="text-[11px]" style={{ color: 'var(--t5)' }}>Loading your structure…</div>
          </div>
        </div>
        <div style={{ position: 'relative', height: '220px', overflow: 'hidden' }}>
          {/* Faint node skeletons — three "nodes" arranged tree-style so
              the silhouette matches the real chart and the swap doesn't
              feel like a content change. */}
          {[
            { left: '50%', top: 28, size: 56 },
            { left: '28%', top: 130, size: 48 },
            { left: '72%', top: 130, size: 48 },
          ].map((n, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: n.left,
                top: n.top,
                width: n.size,
                height: n.size,
                marginLeft: -(n.size / 2),
                borderRadius: '50%',
                background: 'rgba(212,175,55,0.06)',
                border: '1px solid rgba(212,175,55,0.12)',
              }}
            />
          ))}
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'linear-gradient(110deg, transparent 25%, rgba(212,175,55,0.10) 50%, transparent 75%)',
              animation: 'entities-section-shimmer 1.6s ease-in-out infinite',
            }}
          />
          <style>{`
            @keyframes entities-section-shimmer {
              0%   { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  // Click handlers:
  //   single click on tile body  → documents modal (or quick info for non-entity nodes)
  //   "i" button on tile         → quick info popover
  //   pencil button on tile      → edit panel (auto-jumps to edit mode)
  //   double click on tile body  → documents modal (entities only)
  const handleSingleClick = (node) => {
    if (node.kind === 'entity') {
      const ent = entities.find((e) => e.id === node.id);
      if (!ent) return;
      const docIds = (ent.document_ids || []).filter(Boolean);
      // Shortcut: if the entity has exactly one linked SDV document, go
      // straight to its full preview. Skip the chooser modal — there's
      // nothing to choose. Multi-doc entities still open the modal so
      // the user can pick which one to open.
      if (docIds.length === 1) {
        navigate(`/vault?openDoc=${encodeURIComponent(docIds[0])}`);
        return;
      }
      setDocsModalEntity(ent);
    } else {
      // For person nodes, single click shows the quick info bubble (centered)
      setQuickInfoNode(node);
      setQuickInfoRect({
        left: window.innerWidth / 2 - 50,
        right: window.innerWidth / 2 + 50,
        top: window.innerHeight / 2 - 50,
        bottom: window.innerHeight / 2 + 50,
      });
    }
  };
  const handleDoubleClick = (node) => {
    if (node.kind === 'entity') {
      const ent = entities.find((e) => e.id === node.id);
      if (ent) setDocsModalEntity(ent);
    }
  };
  const handleInfoClick = (node, rect) => {
    setQuickInfoNode(node);
    setQuickInfoRect(rect);
  };
  const handleEditClick = (node) => {
    setEditStartInEdit(true);
    setEditingNode(node);
  };

  // (handleDeleteNode is defined ABOVE the early returns to keep hook
  //  ordering stable on every render — see line ~170.)

  if (isEmpty) {
    return (
      <>
        <div className="flex justify-end" data-testid="entities-empty-cta">
          <button
            onClick={() => setShowWizard(true)}
            className="text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors hover:bg-[var(--s)]"
            style={{ color: 'var(--gold)', border: '1px solid rgba(212,165,55,0.3)' }}
            data-testid="entities-add-empty"
          >
            <Plus className="w-3.5 h-3.5" /> Map your entities &amp; trusts
          </button>
        </div>
        <EntityWizard
          open={showWizard}
          estateId={estateId}
          user={effectiveUser}
          beneficiaries={beneficiaries || []}
          entities={entities}
          externals={externals}
          documents={documents}
          walletEntries={walletEntries}
          onCreated={() => { fetchAll(); onEntitiesChanged?.(); }}
          onCreatedExternal={() => { fetchAll(); onEntitiesChanged?.(); }}
          onCancel={() => setShowWizard(false)}
        />
      </>
    );
  }

  return (
    <div
      ref={sectionRef}
      className="rounded-2xl"
      style={{
        background: 'radial-gradient(ellipse at top, rgba(212,165,55,0.08), transparent 60%), var(--card)',
        border: '1px solid var(--b)',
      }}
      data-testid="entities-section"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--b)] flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(212,165,55,0.14)', color: 'var(--gold)' }}>
            <Network className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[var(--t)] truncate" style={{ fontFamily: 'var(--sans)' }}>
              Entities &amp; Structures
            </h2>
            <p className="text-[11px] text-[var(--t5)]">
              {entities.length} entit{entities.length === 1 ? 'y' : 'ies'} · {relationships.length} connection{relationships.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setViewMode((v) => v === 'chart' ? 'list' : 'chart')}
            className="text-[11px] font-bold flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full transition-colors whitespace-nowrap"
            style={{ color: 'var(--t3)', border: '1px solid var(--b)' }}
            data-testid="entities-toggle-view"
            title={viewMode === 'chart' ? 'Switch to list view' : 'Switch to chart view'}
            aria-label={viewMode === 'chart' ? 'List view' : 'Chart view'}
          >
            {viewMode === 'chart'
              ? <><ListIcon className="w-3 h-3" /><span className="hidden sm:inline">List</span></>
              : <><Network className="w-3 h-3" /><span className="hidden sm:inline">Chart</span></>}
          </button>
          {viewMode === 'chart' && (
            <button
              onClick={toggleFit}
              className="text-[11px] font-bold flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full transition-colors whitespace-nowrap"
              style={{
                color: fitOnLoad ? 'var(--gold)' : 'var(--t3)',
                border: fitOnLoad ? '1px solid rgba(212,165,55,0.4)' : '1px solid var(--b)',
              }}
              data-testid="entities-toggle-fit"
              title={fitOnLoad ? 'Currently: open zoomed-out to fit the whole tree. Tap to switch to 1× centered on you.' : 'Currently: open 1× centered on you. Tap to switch to fit-the-whole-tree.'}
              aria-label={fitOnLoad ? 'Switch to centered open' : 'Switch to fit-tree open'}
              aria-pressed={fitOnLoad}
            >
              {fitOnLoad ? <Frame className="w-3 h-3" /> : <Crosshair className="w-3 h-3" />}
              <span className="hidden sm:inline">{fitOnLoad ? 'Fit tree' : 'Centered'}</span>
            </button>
          )}
          {viewMode === 'chart' && (
            <button
              onClick={toggleLocked}
              className="text-[11px] font-bold flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full transition-all whitespace-nowrap"
              style={locked ? {
                color: '#1A1A1A',
                background: 'var(--gold)',
                border: '1px solid var(--gold)',
                boxShadow: '0 0 12px rgba(212,165,55,0.55), 0 0 24px rgba(212,165,55,0.25)',
              } : {
                color: 'var(--t4)',
                background: 'transparent',
                border: '1px solid var(--b)',
              }}
              data-testid="entities-toggle-lock"
              title={locked ? 'Unlock tile positions' : 'Lock tile positions'}
              aria-label={locked ? 'Unlock tile positions' : 'Lock tile positions'}
              aria-pressed={locked}
            >
              {locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              <span className="hidden sm:inline">{locked ? 'Locked' : 'Lock'}</span>
            </button>
          )}
          {viewMode === 'chart' && (
            <button
              onClick={() => setCleanUpSignal((t) => t + 1)}
              className="text-[11px] font-bold flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full transition-colors whitespace-nowrap"
              style={{
                color: 'var(--gold)',
                border: '1px solid rgba(212,165,55,0.4)',
              }}
              data-testid="entities-cleanup"
              title="Snap tiles to a logical grid (works while locked too)"
              aria-label="Clean up layout"
            >
              <Wand2 className="w-3 h-3" /><span className="hidden sm:inline">Clean Up</span>
            </button>
          )}
          {viewMode === 'chart' && (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="text-[11px] font-bold flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full transition-colors whitespace-nowrap"
              style={{
                color: 'var(--t3)',
                border: '1px solid var(--b)',
              }}
              data-testid="entities-reset-layout"
              title="Reset tile positions to auto-layout (works while locked too)"
              aria-label="Reset layout"
            >
              <RotateCcw className="w-3 h-3" /><span className="hidden sm:inline">Reset layout</span>
            </button>
          )}
          {viewMode === 'chart' && (
            <button
              onClick={() => setExpanded((x) => !x)}
              className="text-[11px] font-bold flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full transition-colors whitespace-nowrap"
              style={{ color: 'var(--t3)', border: '1px solid var(--b)' }}
              data-testid="entities-toggle-expand"
              title={expanded ? 'Collapse' : 'Expand'}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              <Maximize2 className="w-3 h-3" /><span className="hidden sm:inline">{expanded ? 'Collapse' : 'Expand'}</span>
            </button>
          )}
          {viewMode === 'chart' && legendHidden && (
            <button
              onClick={showLegend}
              className="text-[11px] font-bold flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full transition-colors whitespace-nowrap"
              style={{
                color: 'var(--gold)',
                border: '1px solid rgba(212,165,55,0.4)',
              }}
              data-testid="entities-show-legend"
              title="Show legend"
              aria-label="Show legend"
            >
              <Map className="w-3 h-3" /><span className="hidden sm:inline">Legend</span>
            </button>
          )}
          {viewMode === 'chart' && estateId && (
            <button
              onClick={() => {
                // Same-tab navigation — `window.open(..., '_blank')`
                // in iOS standalone PWA mode opens a chromeless
                // window with no Back button, leaving the user
                // stranded after dismissing the OS print dialog.
                // Same-tab keeps the SPA history intact so the
                // print page's own Back chip returns the user to
                // the live chart on a single tap.
                navigate(`/financial/entities/${estateId}/print`);
              }}
              className="text-[11px] font-bold flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full transition-colors whitespace-nowrap"
              style={{
                color: 'var(--gold)',
                border: '1px solid rgba(212,165,55,0.4)',
              }}
              data-testid="entities-print-button"
              title="Print as PDF (8.5×11)"
              aria-label="Print"
            >
              <Printer className="w-3 h-3" /><span className="hidden sm:inline">Print</span>
            </button>
          )}
          <EntitiesShareToggle
            estateId={estateId}
            beneficiaries={beneficiaries || []}
            getAuthHeaders={getAuthHeaders}
          />
          <Button
            onClick={() => setShowWizard(true)}
            className="px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold btn-gold-cta whitespace-nowrap"
            data-testid="entities-add-button"
            aria-label="Add entity"
          >
            <Plus className="w-3.5 h-3.5 sm:mr-1" /><span className="hidden sm:inline">Add</span>
          </Button>
        </div>
      </div>

      {/* Beneficiary Blocks summary card. Renders only if there's at
          least one block on the estate. Collapsed by default — click
          to expand and see each block's member count and the entities
          it's attached to. Lets the user verify the "shared block"
          relationships at a glance without hunting through individual
          entity panels. */}
      {(blocks || []).length > 0 && (
        <div
          className="mb-2 rounded-lg overflow-hidden"
          style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.35)' }}
          data-testid="blocks-summary-card"
        >
          <button
            type="button"
            onClick={() => setBlocksExpanded((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[rgba(212,175,55,0.08)]"
            data-testid="blocks-summary-toggle"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#D4AF37' }} />
              <span className="text-[12px] font-bold uppercase tracking-wide truncate" style={{ color: '#D4AF37' }}>
                Beneficiary blocks ({(blocks || []).length})
              </span>
            </div>
            <span className="text-[11px] font-bold" style={{ color: 'var(--t4)' }}>
              {blocksExpanded ? '▾ Hide' : '▸ Show'}
            </span>
          </button>
          {blocksExpanded && (
            <div className="px-3 pb-2 pt-1 space-y-1.5">
              {(blocks || []).map((b) => {
                const attachedEntityIds = (relationships || [])
                  .filter((r) => r.source_type === 'beneficiary_block'
                    && r.source_id === b.id
                    && r.target_type === 'entity'
                    && r.role === 'beneficiary')
                  .map((r) => r.target_id);
                const attachedNames = attachedEntityIds
                  .map((eid) => (entities || []).find((e) => e.id === eid)?.name)
                  .filter(Boolean);
                return (
                  <button
                    type="button"
                    key={b.id}
                    onClick={() => {
                      setBlocksExpanded(true);
                      focusOnBlock(b.id);
                    }}
                    className="w-full text-left flex items-start justify-between gap-3 px-2 py-1.5 rounded-md hover:bg-[rgba(212,175,55,0.10)] transition-colors"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
                    data-testid={`blocks-summary-row-${b.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold truncate" style={{ color: 'var(--t)' }}>{b.name}</div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--t4)' }}>
                        {(b.members || []).length} member{(b.members || []).length === 1 ? '' : 's'}
                        {attachedNames.length > 0 && (
                          <> · attached to <span style={{ color: 'var(--gold)' }}>{attachedNames.join(', ')}</span></>
                        )}
                        {attachedEntityIds.length === 0 && (
                          <> · <span style={{ color: 'var(--t3)' }}>not attached to any entity yet</span></>
                        )}
                      </div>
                    </div>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                      style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.4)' }}
                    >
                      {attachedEntityIds.length}× linked
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ height: maxH, position: 'relative' }}>
        {viewMode === 'chart' ? (
          <EntityOrgChart
            key={resetTick}
            estateId={estateId}
            entities={entities}
            externals={externals}
            relationships={relationships}
            beneficiaries={beneficiaries || []}
            blocks={blocks}
            focusKey={chartFocusKey}
            focusNonce={chartFocusNonce}
            onSingleClickNode={handleSingleClick}
            onDoubleClickNode={handleDoubleClick}
            onInfoClickNode={handleInfoClick}
            onEditClickNode={handleEditClick}
            onDeleteNode={handleDeleteNode}
            onEditBlockClick={(node) => {
              // Two paths into the same modal:
              //
              // 1) node.kind === 'block' (a first-class named block):
              //    Look up the full block from the local cache so the
              //    modal can seed name + members. Save = PATCH the
              //    block in-place.
              //
              // 2) node.kind === 'cluster' (auto-aggregated from flat
              //    beneficiary→entity relationships, no name yet):
              //    Build a synthetic block-shape from the cluster's
              //    members and hand the modal the conversion context
              //    (entity id + the rel ids that constitute the
              //    cluster). Save = POST a new named block + POST one
              //    block→entity rel + bulk-DELETE the N old flat
              //    rels. After save the tile becomes a proper named
              //    block and behaves like any other.
              if (node.kind === 'block') {
                const full = (blocks || []).find((b) => b.id === node.id);
                if (full) setEditingBlock({ mode: 'edit', block: full, convert: null });
              } else if (node.kind === 'cluster') {
                const entityId = node.id; // cluster.id IS the entity id
                const memberRelIds = (relationships || [])
                  .filter((r) => r.source_type === 'beneficiary'
                    && r.target_type === 'entity'
                    && r.target_id === entityId
                    && r.role === 'beneficiary')
                  .map((r) => r.id);
                const synthetic = {
                  // No `id` — modal sees mode='convert' and POSTs a
                  // brand-new block instead of PATCHing.
                  name: '',
                  members: (node.members || []).map((m) => ({ kind: 'beneficiary', id: m.id })),
                };
                setEditingBlock({
                  mode: 'convert',
                  block: synthetic,
                  convert: { entityId, memberRelIds, estateId },
                });
              }
            }}
            cleanUpSignal={cleanUpSignal}
            locked={locked}
            fitOnLoad={fitOnLoad}
            legendHidden={legendHidden}
            onHideLegend={() => {
              EntityLegend.writeHiddenForEstate(estateId, true);
              setLegendHidden(true);
            }}
            serverOverrides={serverChartLayout}
            onSaveLayout={async (overrides, opts = {}) => {
              // Two paths:
              //   • opts.userInitiated === true  → user tapped the
              //     lock chip while still on the page — toast on
              //     SUCCESS only (we await the PUT first so a 5xx /
              //     offline call doesn't show a false "saved" toast).
              //   • opts.userInitiated === false → unmount cleanup
              //     fired because the user navigated away — silent
              //     fire-and-forget so the toast never flashes.
              if (!opts.userInitiated) {
                try {
                  axios.put(
                    `${API_URL}/financial/entities/${estateId}/layout`,
                    { overrides: overrides || {} },
                    getAuthHeaders(),
                  ).catch(() => { /* offline / 5xx — local cache covers us */ });
                } catch { /* axios threw before promise — ignore */ }
                return;
              }
              try {
                const res = await axios.put(
                  `${API_URL}/financial/entities/${estateId}/layout`,
                  { overrides: overrides || {} },
                  getAuthHeaders(),
                );
                // Server explicitly answers `{ ok: true }` on a clean
                // upsert. Only celebrate when we have that proof.
                if (res?.data?.ok === true) {
                  notify.success('Tree structure saved');
                } else {
                  notify.warning("Couldn't confirm save — try again");
                }
              } catch {
                notify.error("Couldn't save tree structure");
              }
            }}
          />
        ) : (
          <div className="overflow-auto" style={{ height: maxH, WebkitOverflowScrolling: 'touch' }}>
            <EntityListView
              entities={entities}
              externals={externals}
              relationships={relationships}
              beneficiaries={beneficiaries || []}
              user={effectiveUser}
              onSelectNode={(node) => setEditingNode(node)}
            />
          </div>
        )}
      </div>

      <EntityWizard
        open={showWizard}
        estateId={estateId}
        user={effectiveUser}
        beneficiaries={beneficiaries || []}
        entities={entities}
        externals={externals}
        documents={documents}
        walletEntries={walletEntries}
        onCreated={() => { fetchAll(); onEntitiesChanged?.(); }}
        onCreatedExternal={() => { fetchAll(); onEntitiesChanged?.(); }}
        onCancel={() => setShowWizard(false)}
      />

      <EntityQuickInfoPopover
        open={!!quickInfoNode}
        anchorRect={quickInfoRect}
        node={quickInfoNode}
        entities={entities}
        externals={externals}
        beneficiaries={beneficiaries || []}
        user={effectiveUser}
        relationships={relationships}
        onClose={() => { setQuickInfoNode(null); setQuickInfoRect(null); }}
        onEdit={() => {
          const node = quickInfoNode;
          setQuickInfoNode(null); setQuickInfoRect(null);
          setEditStartInEdit(true);
          setEditingNode(node);
        }}
        onShowDocuments={() => {
          if (quickInfoNode?.kind === 'entity') {
            const ent = entities.find((e) => e.id === quickInfoNode.id);
            if (ent) setDocsModalEntity(ent);
          }
          setQuickInfoNode(null); setQuickInfoRect(null);
        }}
      />

      <EntityDocumentsModal
        open={!!docsModalEntity}
        entity={docsModalEntity}
        documents={documents}
        onClose={() => setDocsModalEntity(null)}
      />

      <BlockEditModal
        block={editingBlock?.block}
        mode={editingBlock?.mode}
        convert={editingBlock?.convert}
        beneficiaries={beneficiaries || []}
        externals={externals}
        entities={entities}
        relationships={relationships}
        user={effectiveUser}
        onClose={() => setEditingBlock(null)}
        onSaved={async () => { await fetchAll(); onEntitiesChanged?.(); }}
      />

      <EntityDetailPanel
        open={!!editingNode}
        node={editingNode}
        startInEdit={editStartInEdit}
        user={effectiveUser}
        beneficiaries={beneficiaries || []}
        entities={entities}
        externals={externals}
        documents={documents}
        walletEntries={walletEntries}
        relationships={relationships}
        blocks={blocks}
        onChanged={() => { fetchAll(); onEntitiesChanged?.(); }}
        onClose={() => { setEditingNode(null); setEditStartInEdit(false); }}
      />

      {/* Reset-layout confirmation modal. Native `window.confirm` is
          silently blocked in iOS standalone PWA mode (the user lost
          this dialog completely on their iPad), so we render a
          custom React modal instead. */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          data-testid="reset-layout-confirm-overlay"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            className="rounded-2xl shadow-2xl max-w-sm w-full p-5"
            style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-layout-confirm-title"
            data-testid="reset-layout-confirm-modal"
          >
            <h3
              id="reset-layout-confirm-title"
              className="text-lg font-bold mb-2"
              style={{ color: 'var(--gold)' }}
            >
              Reset chart layout?
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--t2)' }}>
              This will discard every tile and legend position you've manually
              arranged on this Entities &amp; Structures chart and snap them
              back to the default auto-layout. Your entities, people, and
              relationships will NOT be deleted — only their positions on
              the canvas. This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-full text-sm font-bold"
                style={{ border: '1px solid var(--b)', color: 'var(--t2)' }}
                data-testid="reset-layout-confirm-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  resetEntityChartPositions(estateId);
                  setResetTick((t) => t + 1);
                  setShowResetConfirm(false);
                }}
                className="px-4 py-2 rounded-full text-sm font-bold"
                style={{ background: 'var(--gold)', color: '#0F172A' }}
                data-testid="reset-layout-confirm-yes"
              >
                Yes, reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
