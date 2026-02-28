import React from 'react';

export const BillingToggle = ({ billing, onChangeBilling }) => (
  <div className="flex justify-center gap-1 mb-6 p-1 rounded-xl bg-[var(--s)] border border-[var(--b)] w-fit mx-auto" data-testid="billing-toggle">
    {['monthly', 'quarterly', 'annual'].map((b) => (
      <button
        key={b}
        onClick={() => onChangeBilling(b)}
        className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all duration-300 capitalize relative ${
          billing === b
            ? 'bg-[var(--gold)] text-[#0F1629] shadow-[0_2px_12px_rgba(212,175,55,0.3)]'
            : 'text-[var(--t5)] hover:text-[var(--t3)]'
        }`}
        data-testid={`billing-${b}`}
      >
        {b}
        {b === 'quarterly' && <span className="absolute -top-2.5 -right-1 text-[9px] bg-[#22C993] text-white px-1.5 py-0.5 rounded-full font-bold shadow-[0_2px_8px_rgba(34,201,147,0.4)]">-10%</span>}
        {b === 'annual' && <span className="absolute -top-2.5 -right-1 text-[9px] bg-[#22C993] text-white px-1.5 py-0.5 rounded-full font-bold shadow-[0_2px_8px_rgba(34,201,147,0.4)]">-20%</span>}
      </button>
    ))}
  </div>
);
