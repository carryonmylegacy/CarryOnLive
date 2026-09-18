import React from 'react';
import { SpeedometerGauge } from './DashboardWidgets';
import { CircleGauge } from './CircleGauge';
import { useDashboardPrefs } from '../../hooks/useDashboardPrefs';

/**
 * ReadinessDial — unified readiness visualization.
 *
 * Reads the per-device `dashboard.gauge` preference and renders either
 * the classic colored-arc speedometer OR the slim serif circle gauge.
 * Used on both the desktop Dashboard and the mobile/PWA Dashboard so
 * the user's chosen graphic travels with them between form factors.
 *
 * Callers can force a specific variant via `variant` — used by the
 * Settings preview card to render both options side by side.
 */
export function ReadinessDial({ score, labelText, labelColor, id = 'main', variant, showPolicyLink = true }) {
  const { gauge } = useDashboardPrefs();
  const effective = variant || gauge;
  const dial = effective === 'circle'
    ? <CircleGauge score={score} id={id} labelText={labelText} labelColor={labelColor} />
    : <SpeedometerGauge score={score} id={id} labelText={labelText} labelColor={labelColor} />;
  if (!showPolicyLink) return dial;
  return (
    <div className="flex flex-col items-center">
      {dial}
      <a href="/readiness-score" target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[var(--t4)] hover:text-[var(--gold)] underline-offset-2 hover:underline -mt-1" data-testid={`readiness-policy-link-${id}`}>
        How is this calculated?
      </a>
    </div>
  );
}

export default ReadinessDial;
