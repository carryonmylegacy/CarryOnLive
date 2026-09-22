import { useEffect, useState } from 'react';
import { getPublic } from '../utils/publicCache';

// No hardcoded fallback: the trial length is founder-configurable (Founder Portal →
// Finance → Trials) and copy must never show a number the portal did not supply.
// Callers receive `null` until the value arrives (or if the request fails).
export const trialDaysLabel = (n) => (n == null ? '—' : n === 1 ? '1 day' : `${n} days`);

let cached = null;
let inflight = null;

export default function useTrialDays() {
  const [trialDays, setTrialDays] = useState(cached);
  useEffect(() => {
    if (cached !== null) return undefined;
    if (!inflight) {
      inflight = getPublic('/public/site-content')
        .then((d) => {
          cached = Number(d?.trial_days) || null;
          return cached;
        })
        .catch(() => null);
    }
    let alive = true;
    inflight.then((v) => {
      if (alive) setTrialDays(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return trialDays;
}
