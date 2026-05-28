/**
 * BeneficiaryEntitiesPage — strictly READ-ONLY view of the benefactor's
 * Entities & Structures chart for beneficiaries.
 *
 * Inviolable: zero edit affordances are rendered. The chart is shown
 * with `readOnly` + `locked`, the list view has no edit hooks, and
 * tapping a tile only opens a modal that lists linked SDV documents
 * (server-supplied URLs only) and credentials whose visibility rules
 * permit them at the current transition state.
 *
 * Data shape comes from GET /api/financial/entities/beneficiary-view/{estate_id}
 * which already enforces the gating server-side. The frontend cannot
 * exfiltrate hidden credentials regardless of UI bugs.
 */
import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft, Network, List as ListIcon, Loader2, Lock,
  KeyRound, FileText, Eye, EyeOff, X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import EntityOrgChart from '../../components/financial/entities/EntityOrgChart';
import EntityListView from '../../components/financial/entities/EntityListView';
import { API_URL } from '../../config';

export default function BeneficiaryEntitiesPage() {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const { estateId } = useParams();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState(null);
  const [viewMode, setViewMode] = useState('chart');
  const [tappedNode, setTappedNode] = useState(null);
  // 'docs' = single-tap on tile → "go to the documents associated";
  // 'info' = tap on the (i) button → "additional information such as
  //          login credentials". Both flows reuse the same modal but
  //          render only the relevant section so each tap surfaces
  //          exactly what the user asked for and nothing else.
  const [tapMode, setTapMode] = useState('docs');

  useEffect(() => {
    if (!estateId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(
          `${API_URL}/financial/entities/beneficiary-view/${estateId}`,
          getAuthHeaders ? getAuthHeaders() : {}
        );
        if (!cancelled) setPayload(res.data || null);
      } catch {
        if (!cancelled) setPayload(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [estateId, getAuthHeaders]);

  const docsById = useMemo(
    () => Object.fromEntries((payload?.documents || []).map((d) => [d.id, d])),
    [payload]
  );
  const credsByEntityId = useMemo(() => {
    const map = {};
    (payload?.credentials || []).forEach((c) => {
      const k = c.linked_entity_id;
      if (!k) return;
      if (!map[k]) map[k] = [];
      map[k].push(c);
    });
    return map;
  }, [payload]);

  // Build "fake" beneficiaries array so the chart renders the
  // current user's chip with their name + colour. We never pass any
  // edit handlers — every tap routes through `setTappedNode` only.
  const beneficiaries = useMemo(() => {
    if (!user) return [];
    return [{
      id: user.id,
      first_name: user.first_name || (user.name || '').split(' ')[0],
      last_name: user.last_name || (user.name || '').split(' ').slice(1).join(' '),
      avatar_color: '#22C993',
    }];
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[var(--gold)] animate-spin" />
      </div>
    );
  }

  if (!payload || !payload.visible) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 text-[var(--t3)]">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div
          className="glass-card p-6 text-center"
          data-testid="beneficiary-entities-locked"
        >
          <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: 'rgba(var(--gold-rgb), 0.1)' }}>
            <Lock className="w-6 h-6 text-[var(--gold)]" />
          </div>
          <h3 className="font-bold text-[var(--t)] mb-1">Entities & Structures Locked</h3>
          <p className="text-sm text-[var(--t4)] leading-relaxed max-w-md mx-auto">
            Your benefactor has chosen not to share their Entities & Structures with you
            at this time. This view will become available after transition.
          </p>
        </div>
      </div>
    );
  }

  const handleSingleClickNode = (node) => { setTapMode('docs'); setTappedNode(node); };
  const handleInfoClickNode = (node) => { setTapMode('info'); setTappedNode(node); };

  return (
    <div className="w-full max-w-[1400px] mx-auto min-h-screen bg-[var(--bg)] p-4 lg:p-6" data-testid="beneficiary-entities-page">
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 text-[var(--t3)]">
        <ChevronLeft className="w-4 h-4 mr-1" /> Back
      </Button>

      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold text-[var(--t)]">Entities & Structures</h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setViewMode((v) => v === 'chart' ? 'list' : 'chart')}
            className="text-[11px] font-bold flex items-center gap-1 px-2.5 py-1 rounded-full"
            style={{ color: 'var(--t3)', border: '1px solid var(--b)' }}
            data-testid="beneficiary-entities-toggle-view"
            aria-label="Toggle view"
          >
            {viewMode === 'chart'
              ? <><ListIcon className="w-3 h-3" /><span>List</span></>
              : <><Network className="w-3 h-3" /><span>Chart</span></>}
          </button>
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: '70vh', WebkitOverflowScrolling: 'touch' }}>
        {viewMode === 'chart' ? (
          <EntityOrgChart
            estateId={estateId}
            entities={payload.entities || []}
            externals={payload.external_people || []}
            relationships={payload.relationships || []}
            beneficiaries={beneficiaries}
            onSingleClickNode={handleSingleClickNode}
            onInfoClickNode={handleInfoClickNode}
            // Edit / double-click / cleanup handlers are intentionally
            // omitted so no write path can ever be reached from this
            // page. `locked` + `readOnly` block tile drag and the
            // pencil/edit chips. `onSaveLayout` is also unset, so even
            // if the chart's persistence flushed somehow, no PUT
            // would fire from the beneficiary surface.
            cleanUpSignal={0}
            locked
            readOnly
          />
        ) : (
          <EntityListView
            entities={payload.entities || []}
            externals={payload.external_people || []}
            relationships={payload.relationships || []}
            beneficiaries={beneficiaries}
            user={user}
            onSelectNode={handleSingleClickNode}
          />
        )}
      </div>

      {tappedNode && (
        <BeneficiaryNodeInfoModal
          node={tappedNode}
          docsById={docsById}
          credsByEntityId={credsByEntityId}
          mode={tapMode}
          onClose={() => setTappedNode(null)}
        />
      )}
    </div>
  );
}

function BeneficiaryNodeInfoModal({ node, docsById, credsByEntityId, mode = 'docs', onClose }) {
  const [revealed, setRevealed] = useState({});
  const isEntity = node?.kind === 'entity';
  const e = node?.entity;
  const linkedDocIds = (e?.document_ids || []).filter((id) => docsById[id]);
  const linkedCreds = e ? (credsByEntityId[e.id] || []) : [];
  const title = isEntity ? (e?.name || 'Entity') : (node?.label || 'Node');
  // 'docs' = single-tap on a tile → show ONLY linked documents (the
  //          user's "go to the document associated" intent).
  // 'info' = (i) button on a tile → show ONLY the additional info the
  //          benefactor has chosen to share pre-transition (currently
  //          credentials, extensible to other facets later).
  const showDocs = mode === 'docs';
  const showInfo = mode === 'info';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      data-testid="beneficiary-node-info-modal"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl"
        style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--b)]">
          <div className="text-sm font-bold text-[var(--t)] truncate">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--t5)] hover:text-[var(--t)] hover:bg-[var(--s)]"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-auto">
          {/* Linked documents — surfaced only when the user single-tapped a tile. */}
          {showDocs && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-1.5">
              Linked documents
            </div>
            {linkedDocIds.length === 0 ? (
              <p className="text-[12px] italic text-[var(--t5)]">None linked.</p>
            ) : (
              <div className="space-y-1.5">
                {linkedDocIds.map((id) => {
                  const d = docsById[id];
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
                      data-testid={`ben-entity-doc-${id}`}
                    >
                      <FileText className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />
                      <span className="text-[13px] text-[var(--t)] truncate">
                        {d.name || d.title || 'Document'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {/* Linked credentials — surfaced only when the user tapped (i). */}
          {showInfo && isEntity && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-1.5">
                Credentials
              </div>
              {linkedCreds.length === 0 ? (
                <p className="text-[12px] italic text-[var(--t5)]">
                  No credentials shared by your benefactor for this entity.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {linkedCreds.map((c) => {
                    const isShown = !!revealed[c.id];
                    return (
                      <div
                        key={c.id}
                        className="px-3 py-2 rounded-lg"
                        style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
                        data-testid={`ben-entity-cred-${c.id}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <KeyRound className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />
                            <span className="text-[13px] text-[var(--t)] truncate font-medium">
                              {c.account_name || 'Credential'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setRevealed((r) => ({ ...r, [c.id]: !r[c.id] }))}
                            className="text-[11px] font-bold px-2 py-1 rounded-md text-[var(--t4)] hover:text-[var(--t)] hover:bg-[var(--s)]"
                            aria-label={isShown ? 'Hide details' : 'Reveal details'}
                            data-testid={`ben-entity-cred-toggle-${c.id}`}
                          >
                            {isShown ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                        {isShown && (
                          <div className="space-y-0.5 text-[12px] text-[var(--t)]">
                            {c.login_username && (
                              <div><span className="text-[var(--t5)]">Username:</span> {c.login_username}</div>
                            )}
                            {c.password && (
                              <div><span className="text-[var(--t5)]">Password:</span> {c.password}</div>
                            )}
                            {c.additional_access && (
                              <div><span className="text-[var(--t5)]">Additional:</span> {c.additional_access}</div>
                            )}
                            {c.notes && (
                              <div className="text-[11px] text-[var(--t4)] mt-1">{c.notes}</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
