import React from 'react';
import { DollarSign, TrendingUp, TrendingDown, Receipt, Landmark, PiggyBank, Building2 } from 'lucide-react';

const fmt = (n) => {
  if (n == null) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const FinancialSummary = ({ summary, onNavigate }) => {
  if (!summary) return null;
  const totalAssetItems = (summary.accounts_count || 0) + (summary.property_count || 0);
  const cards = [
    {
      label: 'Monthly Bills',
      value: fmt(summary.monthly_total),
      sub: `${summary.bills_count} bill${summary.bills_count !== 1 ? 's' : ''}`,
      icon: Receipt,
      color: '#10b981',
      bg: 'rgba(16,185,129,0.1)',
      border: 'rgba(16,185,129,0.2)',
      tab: 'bills',
    },
    {
      label: 'Total Debt',
      value: fmt(summary.total_debt),
      sub: `${summary.debts_count} debt${summary.debts_count !== 1 ? 's' : ''}`,
      icon: Landmark,
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.1)',
      border: 'rgba(239,68,68,0.2)',
      tab: 'debts',
    },
    {
      label: 'Total Assets',
      value: fmt(summary.total_assets),
      sub: `${totalAssetItems} item${totalAssetItems !== 1 ? 's' : ''} (accounts + property)`,
      icon: PiggyBank,
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.1)',
      border: 'rgba(59,130,246,0.2)',
      tab: 'accounts',
    },
    {
      label: 'Net Position',
      value: fmt(summary.net_position),
      sub: summary.net_position >= 0 ? 'Positive' : 'Negative',
      icon: summary.net_position >= 0 ? TrendingUp : TrendingDown,
      color: summary.net_position >= 0 ? '#22C993' : '#ef4444',
      bg: summary.net_position >= 0 ? 'rgba(34,201,147,0.1)' : 'rgba(239,68,68,0.1)',
      border: summary.net_position >= 0 ? 'rgba(34,201,147,0.2)' : 'rgba(239,68,68,0.2)',
      tab: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="financial-summary">
      {cards.map(card => (
        <div
          key={card.label}
          className="rounded-2xl p-4 cursor-pointer transition-all active:scale-[0.97] hover:scale-[1.02]"
          style={{ background: card.bg, border: `1px solid ${card.border}` }}
          onClick={() => card.tab && onNavigate(card.tab)}
          data-testid={`summary-${card.label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          <card.icon className="w-5 h-5 mb-2" style={{ color: card.color }} />
          <div className="text-lg lg:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
            {card.value}
          </div>
          <div className="text-xs text-[var(--t4)] font-medium mt-0.5">{card.label}</div>
          <div className="text-xs mt-1" style={{ color: card.color }}>{card.sub}</div>
        </div>
      ))}
    </div>
  );
};

export default FinancialSummary;
