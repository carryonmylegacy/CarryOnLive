import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Settings2 } from 'lucide-react';

// Platform billing rules the founder controls: grace period after a failed payment, and whether a
// plan change credits unused time. Saves through PUT /admin/billing-rules.
export const BillingRulesCard = ({ settings, onSave }) => {
  const [grace, setGrace] = useState(String(settings?.grace_period_days ?? 30));
  const proration = settings?.proration_enabled !== false;

  const saveGrace = async () => {
    const days = parseInt(grace, 10);
    if (Number.isNaN(days) || days < 0 || days > 365) return;
    await onSave({ grace_period_days: days });
  };

  return (
    <Card className="glass-card" data-testid="billing-rules-card">
      <CardContent className="p-5 space-y-4">
        <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-[var(--gold)]" />
          Billing Rules
        </h3>
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--s)] flex-wrap">
          <div>
            <p className="font-bold text-sm text-[var(--t)]">Grace period after a failed payment</p>
            <p className="text-xs text-[var(--t5)]">Days of continued access before a lapsed subscription is restricted.</p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="number" min="0" max="365" value={grace} onChange={(e) => setGrace(e.target.value)} className="input-field w-20 text-base" data-testid="billing-rules-grace-input" />
            <span className="text-xs text-[var(--t5)]">days</span>
            <Button size="sm" className="gold-button text-xs" onClick={saveGrace} data-testid="billing-rules-grace-save">Save</Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--s)] flex-wrap">
          <div>
            <p className="font-bold text-sm text-[var(--t)]">Credit unused time on plan change</p>
            <p className="text-xs text-[var(--t5)]">
              {proration
                ? 'On: the unused part of the current period is credited against the new plan.'
                : 'Off: a plan change charges the new plan in full; no credit for unused time.'}
            </p>
          </div>
          <Switch checked={proration} onCheckedChange={(v) => onSave({ proration_enabled: v })} data-testid="billing-rules-proration-switch" />
        </div>
      </CardContent>
    </Card>
  );
};
