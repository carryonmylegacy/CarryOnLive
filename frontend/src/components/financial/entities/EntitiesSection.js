/**
 * EntitiesSection — the new Entities & Structures area on the CFP page.
 *
 * Renders ABOVE the FinancialSummary tiles. Stays completely hidden until
 * the user creates their first entity. Once populated, height/width grows
 * commensurately with the structure's complexity.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Network, List as ListIcon, Maximize2, RotateCcw, Wand2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../ui/button';
import { API_URL } from '../../../config';
import EntityOrgChart, { resetEntityChartPositions } from './EntityOrgChart';
import EntityWizard from './EntityWizard';
import EntityDetailPanel from './EntityDetailPanel';
import EntityListView from './EntityListView';
import EntityQuickInfoPopover from './EntityQuickInfoPopover';
import EntityDocumentsModal from './EntityDocumentsModal';

export default function EntitiesSection({ estateId, beneficiaries, onEntitiesChanged }) {
  const { user, getAuthHeaders } = useAuth();
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
      if (ent) setDocsModalEntity(ent);
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
          onCreated={() => { fetchAll(); onEntitiesChanged?.(); }}
          onCreatedExternal={() => { fetchAll(); onEntitiesChanged?.(); }}
          onCancel={() => setShowWizard(false)}
        />
      </>
    );
  }

  return (
    <div
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
            className="text-[11px] font-bold flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors"
            style={{ color: 'var(--t3)', border: '1px solid var(--b)' }}
            data-testid="entities-toggle-view"
            title={viewMode === 'chart' ? 'Switch to list view' : 'Switch to chart view'}
          >
            {viewMode === 'chart' ? <><ListIcon className="w-3 h-3" /> List</> : <><Network className="w-3 h-3" /> Chart</>}
          </button>
          {viewMode === 'chart' && (
            <button
              onClick={() => setCleanUpSignal((t) => t + 1)}
              className="text-[11px] font-bold flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors"
              style={{ color: 'var(--gold)', border: '1px solid rgba(212,165,55,0.4)' }}
              data-testid="entities-cleanup"
              title="Snap tiles to a logical grid"
            >
              <Wand2 className="w-3 h-3" /> Clean Up
            </button>
          )}
          {viewMode === 'chart' && (
            <button
              onClick={() => {
                resetEntityChartPositions(estateId);
                setResetTick((t) => t + 1);
              }}
              className="text-[11px] font-bold flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors"
              style={{ color: 'var(--t3)', border: '1px solid var(--b)' }}
              data-testid="entities-reset-layout"
              title="Reset tile positions to auto-layout"
            >
              <RotateCcw className="w-3 h-3" /> Reset layout
            </button>
          )}
          {viewMode === 'chart' && (
            <button
              onClick={() => setExpanded((x) => !x)}
              className="text-[11px] font-bold flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors"
              style={{ color: 'var(--t3)', border: '1px solid var(--b)' }}
              data-testid="entities-toggle-expand"
              title={expanded ? 'Collapse' : 'Expand'}
            >
              <Maximize2 className="w-3 h-3" /> {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
          <Button
            onClick={() => setShowWizard(true)}
            className="px-3 py-1.5 rounded-md text-xs font-semibold btn-gold-cta"
            data-testid="entities-add-button"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: maxH, WebkitOverflowScrolling: 'touch' }}>
        {viewMode === 'chart' ? (
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
          />
        ) : (
          <EntityListView
            entities={entities}
            externals={externals}
            relationships={relationships}
            beneficiaries={beneficiaries || []}
            user={effectiveUser}
            onSelectNode={(node) => setEditingNode(node)}
          />
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
