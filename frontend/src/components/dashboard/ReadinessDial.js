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
export function ReadinessDial({ score, labelText, labelColor, id = 'main', variant }) {
  const { gauge } = useDashboardPrefs();
  const effective = variant || gauge;

  if (effective === 'circle') {
    return <CircleGauge score={score} id={id} labelText={labelText} labelColor={labelColor} />;
  }
  return <SpeedometerGauge score={score} id={id} labelText={labelText} labelColor={labelColor} />;
}

export default ReadinessDial;
