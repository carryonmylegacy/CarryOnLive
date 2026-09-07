import { useEffect, useState } from 'react';
import axios from 'axios';

// No hardcoded fallback: the trial length is founder-configurable (Founder Portal →
// Finance → Trials) and copy must never show a number the portal did not supply.
// Callers receive `null` until the value arrives (or if the request fails).
export const trialDaysLabel = (n) => (n == null ? '—' : n === 1 ? '1 day' : `${n} days`);

const API_URL = process.env.REACT_APP_BACKEND_URL;
let cached = null;
let inflight = null;

export default function useTrialDays() {
  const [trialDays, setTrialDays] = useState(cached);
  useEffect(() => {
    if (cached !== null) return undefined;
    if (!inflight) {
      inflight = axios
        .get(`${API_URL}/api/public/site-content`)
        .then((r) => {
          cached = Number(r.data?.trial_days) || null;
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
