import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import {
  TrendingUp,
  TrendingDown,
  Receipt,
  Landmark,
  PiggyBank,
  X,
} from 'lucide-react';
import { API_URL } from '../../config';

const fmt = (n) => {
  if (n == null) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const fmtPrecise = (n) => {
  if (n == null) return '$0';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const FinancialSummary = ({
  summary,
  bills = [],
  debts = [],
  accounts = [],
  propertyAssets = [],
  estateId,
  onNavigate,
}) => {
  const [activeModal, setActiveModal] = useState(null); // 'bills' | 'debts' | 'assets' | 'net'
  const [entities, setEntities] = useState([]);
  const [entitiesLoaded, setEntitiesLoaded] = useState(false);

  // Lazy-load entities the first time the user opens any popup — we
  // need their names + gross_assets / gross_debts to render full
  // breakdowns of what's contributing to the tile totals.
  useEffect(() => {
    if (!activeModal || entitiesLoaded || !estateId) return;
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    axios
      .get(`${API_URL}/financial/entities/${estateId}`, { headers })
      .then((r) => {
        const list = Array.isArray(r?.data?.entities) ? r.data.entities : [];
        setEntities(list);
        setEntitiesLoaded(true);
      })
      .catch(() => setEntitiesLoaded(true));
  }, [activeModal, entitiesLoaded, estateId]);

  // Quick id→name lookup so a bill/debt that carries an `entity_id`
  // can render the entity's display name in the popup's third column.
  const entityName = useMemo(() => {
    const m = {};
    entities.forEach((e) => { if (e?.id) m[e.id] = e.name || 'Unnamed entity'; });
    return m;
  }, [entities]);

  if (!summary) return null;
  const totalAssetItems = (summary.accounts_count || 0) + (summary.property_count || 0);
  const cards = [
    {
      key: 'bills',
      label: 'Monthly Bills',
      value: fmt(summary.monthly_total),
      sub: `${summary.bills_count} bill${summary.bills_count !== 1 ? 's' : ''}`,
      icon: Receipt,
      color: '#10b981',
      bg: 'rgba(16,185,129,0.1)',
      border: 'rgba(16,185,129,0.2)',
    },
    {
      key: 'debts',
      label: 'Total Debt',
      value: fmt(summary.total_debt),
      sub: `${summary.debts_count} debt${summary.debts_count !== 1 ? 's' : ''}`,
      icon: Landmark,
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.1)',
      border: 'rgba(239,68,68,0.2)',
    },
    {
      key: 'assets',
      label: 'Total Assets',
      value: fmt(summary.total_assets),
      sub: `${totalAssetItems} item${totalAssetItems !== 1 ? 's' : ''} (accounts + property)`,
      icon: PiggyBank,
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.1)',
      border: 'rgba(59,130,246,0.2)',
    },
    {
      key: 'net',
      label: 'Net Position',
      value: fmt(summary.net_position),
      sub: summary.net_position >= 0 ? 'Positive' : 'Negative',
      icon: summary.net_position >= 0 ? TrendingUp : TrendingDown,
      color: summary.net_position >= 0 ? '#22C993' : '#ef4444',
      bg: summary.net_position >= 0 ? 'rgba(34,201,147,0.1)' : 'rgba(239,68,68,0.1)',
      border: summary.net_position >= 0 ? 'rgba(34,201,147,0.2)' : 'rgba(239,68,68,0.2)',
    },
  ];

  // Build the row list for the currently-open modal. Each row carries
  // the three fields the user asked for: title, amount, entity name.
  const monthlyAmount = (b) => {
    const amt = Number(b.amount) || 0;
    switch (b.frequency) {
      case 'monthly': return amt;
      case 'quarterly': return amt / 3;
      case 'semi_annual': return amt / 6;
      case 'annual': return amt / 12;
      default: return amt;
    }
  };

  const rowsFor = (kind) => {
    if (kind === 'bills') {
      return bills.map((b) => ({
        id: b.id,
        title: b.name || 'Untitled bill',
        amount: monthlyAmount(b),
        sub: b.frequency ? `${b.frequency.replace('_', ' ')}${b.amount ? ` · ${fmtPrecise(b.amount)} per cycle` : ''}` : '',
        entity: b.entity_id ? entityName[b.entity_id] : null,
      }));
    }
    if (kind === 'debts') {
      const baseRows = debts.map((d) => ({
        id: d.id,
        title: d.name || 'Untitled debt',
        amount: Number(d.outstanding_balance) || 0,
        sub: d.creditor || d.category || '',
        entity: d.entity_id ? entityName[d.entity_id] : null,
      }));
      // Synthetic rows for entity-level gross_debts so the user can
      // see exactly which entities contributed to the rollup total.
      const entityRows = entities
        .filter((e) => Number(e.gross_debts) > 0)
        .map((e) => ({
          id: `entity-debt-${e.id}`,
          title: e.name || 'Unnamed entity',
          amount: Number(e.gross_debts) || 0,
          sub: 'Entity gross debts',
          entity: e.name || null,
          isEntityRow: true,
        }));
      return [...baseRows, ...entityRows];
    }
    if (kind === 'assets') {
      const acctRows = accounts.map((a) => ({
        id: a.id,
        title: a.name || a.account_type || 'Account',
        amount: Number(a.approximate_balance) || 0,
        sub: [a.institution, a.account_type].filter(Boolean).join(' · '),
        entity: a.entity_id ? entityName[a.entity_id] : null,
      }));
      const propRows = propertyAssets.map((p) => ({
        id: p.id,
        title: p.name || p.property_type || 'Property',
        amount: Number(p.estimated_value) || 0,
        sub: [p.property_type, p.address].filter(Boolean).join(' · '),
        entity: p.entity_id ? entityName[p.entity_id] : null,
      }));
      const entityRows = entities
        .filter((e) => Number(e.gross_assets) > 0)
        .map((e) => ({
          id: `entity-asset-${e.id}`,
          title: e.name || 'Unnamed entity',
          amount: Number(e.gross_assets) || 0,
          sub: 'Entity gross assets',
          entity: e.name || null,
          isEntityRow: true,
        }));
      return [...acctRows, ...propRows, ...entityRows];
    }
    if (kind === 'net') {
      return [
        { id: 'na-assets', title: 'Total Assets', amount: Number(summary.total_assets) || 0, sub: 'Sum of accounts, property & entity assets', entity: null },
        { id: 'na-debt', title: 'Total Debt', amount: -1 * (Number(summary.total_debt) || 0), sub: 'Sum of debts & entity gross debts', entity: null },
      ];
    }
    return [];
  };

  const modalMeta = activeModal ? cards.find((c) => c.key === activeModal) : null;
  const rows = activeModal ? rowsFor(activeModal) : [];
  // Tile total ALWAYS pulls from the canonical backend summary so it
  // matches the number on the tile face exactly — even before the
  // lazy-loaded entities arrive. Previously we summed `rows` which
  // missed entity rollups during the few hundred ms the entity fetch
  // was in flight, producing a visibly wrong total in the modal.
  const tileTotal = (() => {
    if (activeModal === 'bills') return Number(summary.monthly_total) || 0;
    if (activeModal === 'debts') return Number(summary.total_debt) || 0;
    if (activeModal === 'assets') return Number(summary.total_assets) || 0;
    if (activeModal === 'net') return Number(summary.net_position) || 0;
    return 0;
  })();

  return (
    <>
      {/* Override the app's global "hide scrollbar" rule for the
          summary detail modal so the user can see they can scroll
          when the list overflows. Scoped via .summary-detail-scroll
          so it doesn't bleed into other components. */}
      <style>{`
        .summary-detail-scrollarea::-webkit-scrollbar {
          width: 6px;
          display: block !important;
        }
        .summary-detail-scrollarea::-webkit-scrollbar-thumb {
          background: rgba(212, 165, 55, 0.55);
          border-radius: 3px;
        }
        .summary-detail-scrollarea::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="financial-summary">
        {cards.map((card) => (
          <button
            type="button"
            key={card.label}
            className="rounded-2xl p-4 cursor-pointer transition-all active:scale-[0.97] hover:scale-[1.02] text-left"
            style={{ background: card.bg, border: `1px solid ${card.border}` }}
            onClick={() => setActiveModal(card.key)}
            data-testid={`summary-${card.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <card.icon className="w-5 h-5 mb-2" style={{ color: card.color }} />
            <div className="text-lg lg:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
              {card.value}
            </div>
            <div className="text-xs text-[var(--t4)] font-medium mt-0.5">{card.label}</div>
            <div className="text-xs mt-1" style={{ color: card.color }}>{card.sub}</div>
          </button>
        ))}
      </div>

      {activeModal && modalMeta && (
        <div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center"
          style={{
            background: 'rgba(0,0,0,0.55)',
            // Pad the bottom enough to clear the fixed mobile dock
            // (~80px) PLUS the home-indicator safe-area inset PLUS a
            // breathing gap, so the modal's bottom edge is always
            // fully visible above the nav. Side padding stays tight
            // so the sheet feels mobile-native on phones.
            paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
            paddingLeft: '12px',
            paddingRight: '12px',
          }}
          onClick={() => setActiveModal(null)}
          data-testid="summary-detail-overlay"
        >
          <div
            className="rounded-2xl shadow-2xl w-full max-w-lg flex flex-col summary-detail-scroll"
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--b)',
              color: 'var(--t)',
              // Cap the modal height to the *available* viewport
              // height after our overlay's top + bottom padding so
              // the sheet always fits cleanly between the iOS status
              // bar and the bottom dock.
              maxHeight: 'calc(100dvh - 96px - env(safe-area-inset-bottom, 0px) - env(safe-area-inset-top, 0px) - 24px)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            data-testid="summary-detail-modal"
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: 'var(--b)' }}
            >
              <div className="flex items-center gap-2">
                <modalMeta.icon className="w-5 h-5" style={{ color: modalMeta.color }} />
                <h3 className="text-base font-bold" style={{ color: 'var(--t)' }}>
                  {modalMeta.label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-full hover:bg-[var(--s)]"
                data-testid="summary-detail-close"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--b)' }}>
              <div className="text-xs text-[var(--t4)]">Tile total</div>
              <div className="text-2xl font-bold" style={{ color: modalMeta.color }}>
                {fmtPrecise(tileTotal)}
              </div>
            </div>

            <div
              className="overflow-y-auto flex-1 px-2 py-2 summary-detail-scrollarea"
              style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
            >
              {rows.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-[var(--t4)]" data-testid="summary-detail-empty">
                  No line items contribute to this total yet.
                </div>
              ) : (
                <ul className="divide-y" style={{ borderColor: 'var(--b)' }}>
                  {rows.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-start justify-between gap-3 px-3 py-3"
                      data-testid={`summary-detail-row-${r.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold truncate" style={{ color: 'var(--t)' }}>
                          {r.title}
                        </div>
                        {r.sub && (
                          <div className="text-xs text-[var(--t4)] truncate">{r.sub}</div>
                        )}
                        {r.entity && (
                          <div className="text-xs font-bold mt-0.5" style={{ color: 'var(--gold)' }}>
                            Entity: {r.entity}
                          </div>
                        )}
                      </div>
                      <div
                        className="text-sm font-bold whitespace-nowrap"
                        style={{ color: r.amount < 0 ? '#ef4444' : modalMeta.color }}
                      >
                        {fmtPrecise(r.amount)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {activeModal !== 'net' && onNavigate && (
              <div
                className="px-4 py-3 border-t flex justify-end"
                style={{ borderColor: 'var(--b)' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    const tab = activeModal === 'assets' ? 'accounts' : activeModal;
                    onNavigate(tab);
                    setActiveModal(null);
                  }}
                  className="px-4 py-2 rounded-full text-sm font-bold"
                  style={{ background: 'var(--gold)', color: '#0F172A' }}
                  data-testid="summary-detail-open-tab"
                >
                  Open {modalMeta.label}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default FinancialSummary;
