/**
 * EntitiesSection — the new Entities & Structures area on the CFP page.
 *
 * Renders ABOVE the FinancialSummary tiles. Stays completely hidden until
 * the user creates their first entity. Once populated, height/width grows
 * commensurately with the structure's complexity.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Plus, Network, List as ListIcon, Maximize2, RotateCcw, Wand2, Lock, Unlock, Frame, Crosshair, Map } from 'lucide-react';
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
  const [resetTick, setResetTick] = useState(0);
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

  if (!estateId) return null;
  if (!loaded) return null;

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
              onClick={() => {
                resetEntityChartPositions(estateId);
                setResetTick((t) => t + 1);
              }}
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

      <div style={{ height: maxH, position: 'relative' }}>
        {viewMode === 'chart' ? (
          <>
            <EntityOrgChart
              key={resetTick}
              estateId={estateId}
              entities={entities}
              externals={externals}
              relationships={relationships}
              beneficiaries={beneficiaries || []}
              onSingleClickNode={handleSingleClick}
              onDoubleClickNode={handleDoubleClick}
              onInfoClickNode={handleInfoClick}
              onEditClickNode={handleEditClick}
              cleanUpSignal={cleanUpSignal}
              locked={locked}
              fitOnLoad={fitOnLoad}
            />
            {/* Floating draggable legend — positioned inside the same
                relative-wrapper as the chart so it sits ON TOP of the
                chart's scroll viewport but does NOT scroll with the
                chart's panned content. */}
            <EntityLegend
              estateId={estateId}
              entities={entities}
              relationships={relationships}
              hidden={legendHidden}
              onHiddenChange={setLegendHidden}
            />
          </>
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
        onChanged={() => { fetchAll(); onEntitiesChanged?.(); }}
        onClose={() => { setEditingNode(null); setEditStartInEdit(false); }}
      />
    </div>
  );
}
