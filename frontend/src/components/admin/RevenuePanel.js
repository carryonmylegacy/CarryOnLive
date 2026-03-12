import React from 'react';

export const RevenuePanel = ({ revenue }) => {
  if (!revenue) return null;
  return (
    <div className="mb-4" data-testid="revenue-panel">
      <p className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2">Revenue</p>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div className="glass-card p-3 text-center">
          <div className="text-xl font-bold text-[#22C993]">${revenue.mrr.toLocaleString()}</div>
          <div className="text-[10px] text-[var(--t4)] font-bold">MRR</div>
          <div className="text-[9px] text-[var(--t5)]">${revenue.arr.toLocaleString()}/yr ARR</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-xl font-bold text-[#d4af37]">${revenue.total_revenue.toLocaleString()}</div>
          <div className="text-[10px] text-[var(--t4)] font-bold">Total Revenue</div>
          <div className="text-[9px] text-[var(--t5)]">${revenue.revenue_this_month.toLocaleString()} this month</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-xl font-bold" style={{ color: revenue.mom_growth >= 0 ? '#22C993' : '#EF4444' }}>
            {revenue.mom_growth >= 0 ? '+' : ''}{revenue.mom_growth}%
          </div>
          <div className="text-[10px] text-[var(--t4)] font-bold">MoM Growth</div>
          <div className="text-[9px] text-[var(--t5)]">${revenue.revenue_last_month.toLocaleString()} last month</div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div className="glass-card p-2.5 text-center">
          <div className="text-lg font-bold text-[var(--t)]">{revenue.paying_subscribers}</div>
          <div className="text-[9px] text-[var(--t5)]">Paying</div>
        </div>
        <div className="glass-card p-2.5 text-center">
          <div className="text-lg font-bold text-[#3B82F6]">${revenue.arpu_monthly}</div>
          <div className="text-[9px] text-[var(--t5)]">ARPU/mo</div>
        </div>
        <div className="glass-card p-2.5 text-center">
          <div className="text-lg font-bold" style={{ color: revenue.churn_rate > 5 ? '#EF4444' : '#22C993' }}>{revenue.churn_rate}%</div>
          <div className="text-[9px] text-[var(--t5)]">Churn</div>
        </div>
        <div className="glass-card p-2.5 text-center">
          <div className="text-lg font-bold text-[#d4af37]">${revenue.ltv}</div>
          <div className="text-[9px] text-[var(--t5)]">LTV</div>
        </div>
      </div>
    </div>
  );
};
