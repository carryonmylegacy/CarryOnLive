/**
 * EntitiesSection — the new Entities & Structures area on the CFP page.
 *
 * Renders ABOVE the FinancialSummary tiles. Stays completely hidden until
 * the user creates their first entity. Once populated, height/width grows
 * commensurately with the structure's complexity.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Network, List as ListIcon, Maximize2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../ui/button';
import { API_URL } from '../../../config';
import EntityOrgChart from './EntityOrgChart';
import EntityWizard from './EntityWizard';
import EntityDetailPanel from './EntityDetailPanel';
import EntityListView from './EntityListView';

export default function EntitiesSection({ estateId, beneficiaries }) {
  const { user, getAuthHeaders } = useAuth();
  const [entities, setEntities] = useState([]);
  const [externals, setExternals] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [viewMode, setViewMode] = useState('chart'); // 'chart' | 'list'
  const [expanded, setExpanded] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!estateId) return;
    try {
      const r = await axios.get(`${API_URL}/financial/entities/${estateId}`, getAuthHeaders());
      setEntities(r.data?.entities || []);
      setExternals(r.data?.external_people || []);
      setRelationships(r.data?.relationships || []);
    } catch {
      // Surface = silent for read failures (estate may not have it yet, beneficiary view returns empty)
    } finally {
      setLoaded(true);
    }
  }, [estateId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Hidden entirely until the first entity is created.
  // Floating "+ Start mapping" button appears at the very top so the
  // entry point is discoverable even when no entities exist yet.
  const isEmpty = entities.length === 0 && externals.length === 0;

  // Section height grows with complexity (capped on desktop).
  const totalNodes = entities.length + externals.length;
  const maxH = expanded ? '80vh'
    : totalNodes <= 3 ? '260px'
    : totalNodes <= 8 ? '380px'
    : totalNodes <= 15 ? '500px'
    : '600px';

  if (!estateId) return null;
  if (!loaded) return null;

  if (isEmpty) {
    // Discreet entry pill — no orbit space, just a quiet inviter.
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
          user={user}
          beneficiaries={beneficiaries || []}
          entities={entities}
          externals={externals}
          onCreated={() => fetchAll()}
          onCreatedExternal={() => fetchAll()}
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
      {/* Header */}
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

      {/* Body */}
      <div
        className="overflow-auto"
        style={{
          maxHeight: maxH,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {viewMode === 'chart' ? (
          <EntityOrgChart
            entities={entities}
            externals={externals}
            relationships={relationships}
            beneficiaries={beneficiaries || []}
            onAddEntity={() => setShowWizard(true)}
            onSelectNode={(node) => setSelectedNode(node)}
          />
        ) : (
          <EntityListView
            entities={entities}
            externals={externals}
            relationships={relationships}
            beneficiaries={beneficiaries || []}
            user={user}
            onSelectNode={(node) => setSelectedNode(node)}
          />
        )}
      </div>

      <EntityWizard
        open={showWizard}
        estateId={estateId}
        user={user}
        beneficiaries={beneficiaries || []}
        entities={entities}
        externals={externals}
        onCreated={() => fetchAll()}
        onCreatedExternal={() => fetchAll()}
        onCancel={() => setShowWizard(false)}
      />

      <EntityDetailPanel
        open={!!selectedNode}
        node={selectedNode}
        user={user}
        beneficiaries={beneficiaries || []}
        entities={entities}
        externals={externals}
        relationships={relationships}
        onChanged={() => fetchAll()}
        onClose={() => setSelectedNode(null)}
      />
    </div>
  );
}
