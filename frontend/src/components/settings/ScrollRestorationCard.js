import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Switch } from '../ui/switch';
import { Anchor } from 'lucide-react';
import {
  useScrollRestorationPref,
  clearAllSavedScrollPositions,
} from '../../hooks/useScrollRestoration';
import { toast } from '../../utils/toast';

/**
 * ScrollRestorationCard — Settings → Preferences
 *
 * Lets the user toggle automatic scroll-position restoration on or
 * off. When ON, every page they visit remembers where they scrolled
 * to and restores that offset on return. When OFF, navigation behaves
 * the way React Router normally does (top of page on each route).
 *
 * The pref is stored in `localStorage` so it persists offline and
 * across PWA cold-launches without a server round-trip — same model
 * as the dashboard layout / theme prefs.
 *
 * A small "Forget saved positions" button is exposed for users who
 * want to reset history without flipping the toggle.
 */

export default function ScrollRestorationCard() {
  const [enabled, setEnabled] = useScrollRestorationPref();

  const onToggle = (next) => {
    setEnabled(next);
    toast.success(next ? 'Scroll position will be remembered.' : 'Scroll position no longer saved.');
  };

  const onClear = () => {
    clearAllSavedScrollPositions();
    toast.success('Saved scroll positions cleared.');
  };

  return (
    <Card className="glass-card" data-testid="scroll-restoration-card">
      <CardContent className="pt-5 pb-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2 min-w-0">
            <Anchor className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--gold, #d4af37)' }} />
            <div className="min-w-0">
              <h3 className="font-bold text-[14px]" style={{ color: 'var(--t)' }}>
                Remember scroll position
              </h3>
              <p className="text-[12px] mt-1" style={{ color: 'var(--t2)', lineHeight: 1.45 }}>
                When you navigate away from a page and come back, CarryOn will
                restore you to the exact spot where you left off. Works across
                every page in the platform. Saved on this device only.
              </p>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            data-testid="scroll-restoration-toggle"
            aria-label="Toggle scroll position memory"
          />
        </div>

        {enabled && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px]" style={{ color: 'var(--t2)' }}>
              Stored locally on this device. Cleared if you turn this off.
            </span>
            <button
              type="button"
              onClick={onClear}
              data-testid="scroll-restoration-clear-btn"
              className="text-[11px] font-bold underline"
              style={{ color: 'var(--gold, #d4af37)' }}
            >
              Forget saved positions
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
