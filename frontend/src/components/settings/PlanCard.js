import React from 'react';
import {
  Check,
  Shield,
  Loader2,
  ChevronRight,
  Crown,
  Star,
  Award,
  Heart,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { Button } from '../ui/button';

const TIER_COLORS = {
  premium: { accent: '#d4af37', glow: 'rgba(212,175,55,0.4)', bg: 'linear-gradient(135deg, rgba(212,175,55,0.18) 0%, rgba(20,28,51,0.95) 100%)' },
  standard: { accent: '#60A5FA', glow: 'rgba(96,165,250,0.35)', bg: 'linear-gradient(135deg, rgba(96,165,250,0.12) 0%, rgba(20,28,51,0.95) 100%)' },
  base: { accent: '#22C993', glow: 'rgba(34,201,147,0.35)', bg: 'linear-gradient(135deg, rgba(34,201,147,0.12) 0%, rgba(20,28,51,0.95) 100%)' },
  new_adult: { accent: '#B794F6', glow: 'rgba(183,148,246,0.35)', bg: 'linear-gradient(135deg, rgba(183,148,246,0.12) 0%, rgba(20,28,51,0.95) 100%)' },
  military: { accent: '#F59E0B', glow: 'rgba(245,158,11,0.35)', bg: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(20,28,51,0.95) 100%)' },
  hospice: { accent: '#ec4899', glow: 'rgba(236,72,153,0.35)', bg: 'linear-gradient(135deg, rgba(236,72,153,0.12) 0%, rgba(20,28,51,0.95) 100%)' },
};

const PLAN_ICONS = { premium: Crown, standard: Star, base: Shield, new_adult: Award, military: Shield, hospice: Heart };

export const PlanCard = ({
  plan,
  index,
  currentPlanId,
  activePlan,
  setActivePlan,
  isEligible,
  isUpgrade,
  isDowngrade,
  requiresVerification,
  billingPrice,
  billingLabel,
  onChangePlan,
  onShowPaywall,
  changingPlan,
  hasActiveSub,
}) => {
  const PlanIcon = PLAN_ICONS[plan.id] || Shield;
  const isPremium = plan.id === 'premium';
  const tc = TIER_COLORS[plan.id] || TIER_COLORS.base;
  const isCurrent = currentPlanId === plan.id;
  const upgrading = isUpgrade(plan.id);

  return (
    <div
      onClick={() => isEligible && setActivePlan(plan.name)}
      className={`relative rounded-2xl overflow-hidden transition-all duration-500 group ${
        !isEligible ? 'opacity-50 cursor-default' : 'cursor-pointer'
      } ${
        isEligible && isPremium ? 'sm:scale-[1.03] hover:-translate-y-2' : isEligible ? 'hover:-translate-y-1' : ''
      }`}
      style={{
        background: !isEligible ? 'var(--s)' : tc.bg,
        border: isCurrent
          ? `2px solid ${tc.accent}`
          : isPremium && isEligible
            ? `2px solid ${tc.accent}60`
            : `1px solid var(--b)`,
        boxShadow: !isEligible ? 'none' : isCurrent
          ? `0 0 0 1px ${tc.accent}30, 0 12px 40px -8px ${tc.glow}`
          : isPremium
            ? `0 12px 40px -8px ${tc.glow}`
            : '0 4px 16px -4px rgba(0,0,0,0.1)',
        animationDelay: `${index * 80}ms`,
      }}
      data-testid={`plan-${plan.id}`}
    >
      {(isPremium || isCurrent) && (
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${tc.accent}80, transparent)` }} />
      )}

      {isPremium && !isCurrent && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[10px] font-bold px-4 py-1 rounded-b-lg z-10"
          style={{ background: `linear-gradient(180deg, ${tc.accent}, ${tc.accent}cc)`, color: '#0F1629', boxShadow: `0 4px 16px ${tc.glow}` }}>
          Most Popular
        </div>
      )}
      {isCurrent && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[10px] font-bold px-4 py-1 rounded-b-lg z-10"
          style={{ background: `linear-gradient(180deg, ${tc.accent}, ${tc.accent}cc)`, color: '#0F1629', boxShadow: `0 4px 16px ${tc.glow}` }}>
          Current Plan
        </div>
      )}

      <div className="p-5 pt-7">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
            style={{ background: `${tc.accent}15`, border: `1px solid ${tc.accent}30`, boxShadow: `0 4px 12px ${tc.accent}15` }}>
            <PlanIcon className="w-5 h-5" style={{ color: tc.accent }} />
          </div>
          <h3 className="font-bold text-lg text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>{plan.name}</h3>
        </div>

        <div className="mb-1">
          <span className="text-4xl font-bold tracking-tight" style={{ color: tc.accent, fontFamily: 'Outfit, sans-serif' }}>
            {billingPrice}
          </span>
          {plan.price > 0 && <span className="text-[10px] text-[var(--t5)] ml-1.5">{billingLabel}</span>}
        </div>
        <div className="text-[10px] text-[var(--t5)] mb-4">Beneficiary: ${plan.ben_price?.toFixed(2)}/mo</div>

        <div className="h-px mb-4" style={{ background: `linear-gradient(90deg, transparent, ${tc.accent}30, transparent)` }} />

        <div className="space-y-2 text-left mb-5">
          {(plan.features || []).map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-[var(--t3)]">
              <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${tc.accent}15` }}>
                <Check className="w-2.5 h-2.5" style={{ color: tc.accent }} />
              </div>
              <span>{f}</span>
            </div>
          ))}
        </div>

        {plan.note && <div className="text-xs text-[var(--t5)] italic mb-3">{plan.note}</div>}

        {!isEligible && (
          <div className="w-full text-center text-xs font-medium py-3 rounded-xl text-[var(--t5)]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            Ages 18-25 only
          </div>
        )}

        {isEligible && (hasActiveSub ? (
          isCurrent ? (
            <div className="w-full text-center text-xs font-bold py-3 rounded-xl" style={{ background: `${tc.accent}10`, color: tc.accent, border: `1px solid ${tc.accent}30` }}>
              <Check className="w-3.5 h-3.5 inline mr-1" /> Your Plan
            </div>
          ) : (
            <Button
              onClick={(e) => { e.stopPropagation(); onChangePlan(plan.id); }}
              disabled={changingPlan}
              className="w-full text-sm font-bold py-5 transition-all duration-300"
              style={{
                background: requiresVerification(plan.id) ? 'transparent' : upgrading ? `linear-gradient(135deg, ${tc.accent}, ${tc.accent}cc)` : 'transparent',
                color: requiresVerification(plan.id) ? tc.accent : upgrading ? '#0F1629' : tc.accent,
                border: requiresVerification(plan.id) || !upgrading ? `2px solid ${tc.accent}40` : 'none',
                boxShadow: !requiresVerification(plan.id) && upgrading ? `0 4px 20px ${tc.glow}` : 'none',
              }}
              data-testid={`change-plan-${plan.id}`}
            >
              {changingPlan ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : requiresVerification(plan.id) ? <Shield className="w-4 h-4 mr-1" /> : upgrading ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
              {requiresVerification(plan.id) ? 'Verify & Apply' : upgrading ? 'Upgrade' : 'Downgrade'}
            </Button>
          )
        ) : (
          <Button
            onClick={(e) => { e.stopPropagation(); onShowPaywall(); }}
            className={`w-full text-sm font-bold py-5 transition-all duration-300 ${isPremium ? 'gold-button' : ''}`}
            style={!isPremium ? { background: 'transparent', border: `2px solid ${tc.accent}40`, color: tc.accent } : { boxShadow: `0 4px 20px ${tc.glow}` }}
            data-testid={`plan-subscribe-${plan.id}`}
          >
            Subscribe <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ))}
      </div>
    </div>
  );
};
