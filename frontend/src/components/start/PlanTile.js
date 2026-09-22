import React from 'react';
import { Check, CreditCard, Users } from 'lucide-react';
import { StripeNote } from '../landing/TrustBadges';

const CYCLE_BILLED = { quarterly: 'every 3 months', annual: 'annually' };

// One plan card for /start — main and special tiers share it so every tile reads the same way.
// `features` = [{ key, name, added }] — existing features first (plain), then what this tier adds (gold check).
export const PlanTile = ({ plan, price, total, cycle, selected, onSelect, onCheckout, features, invitedLine, ctaLabel, disabled, className = '' }) => {
  const paid = parseFloat(plan.price) > 0;
  return (
    <div className={`rounded-2xl p-5 sm:p-6 transition-all cursor-pointer flex flex-col ${className}`}
      onClick={onSelect}
      style={{
        background: selected ? 'rgba(212,175,55,0.06)' : 'var(--s)',
        border: `2px solid ${selected ? 'rgba(212,175,55,0.4)' : 'var(--b)'}`,
        transform: selected ? 'scale(1.02)' : 'scale(1)',
      }}
      data-testid={`plan-${plan.id}`}>
      <h3 className="text-lg font-bold text-[var(--t)] mb-1">{plan.name}</h3>
      {plan.note && <p className="text-xs text-[var(--t5)] mb-2" data-testid={`plan-note-${plan.id}`}>{plan.note}</p>}
      <div className="flex items-baseline gap-1 mb-4">
        <span className="text-3xl font-bold text-[var(--t)]">${parseFloat(price).toFixed(2)}</span>
        <span className="text-sm text-[var(--t5)]">/mo</span>
      </div>
      {cycle !== 'monthly' && paid && (
        <div className="text-xs text-[var(--t5)] mb-3">Billed ${total} {CYCLE_BILLED[cycle]}</div>
      )}
      <ul className="space-y-1.5 mb-5 flex-1">
        {features.map(f => (
          <li key={f.key} className={`flex items-start gap-2 text-xs ${f.added ? 'font-bold text-[var(--t)]' : 'text-[var(--t3)]'}`}
            data-testid={`start-feature-${plan.id}-${f.key}`} data-added={f.added ? 'true' : 'false'}>
            {f.added
              ? <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[#d4af37]" />
              : <span className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />}
            {f.name}
          </li>
        ))}
        {invitedLine && (
          <li className="flex items-start gap-2 text-xs text-[var(--t3)]" data-testid={`start-invited-${plan.id}`}>
            <Users className="w-3.5 h-3.5 text-[#3b82f6] flex-shrink-0 mt-0.5" />
            <span>{invitedLine}</span>
          </li>
        )}
      </ul>
      <button
        onClick={(e) => { e.stopPropagation(); onCheckout(); }}
        disabled={disabled}
        className="w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
        style={{
          background: selected ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(255,255,255,0.06)',
          color: selected ? '#080e1a' : 'var(--t3)',
          border: `1px solid ${selected ? 'transparent' : 'var(--b)'}`,
        }}
        data-testid={`checkout-${plan.id}`}>
        <CreditCard className="w-4 h-4 inline mr-1" />
        {ctaLabel}
      </button>
      {paid && <StripeNote className="w-full mt-2.5" testId={`start-stripe-note-${plan.id}`} />}
    </div>
  );
};
