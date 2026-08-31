import { useEffect, useState } from 'react';
import axios from 'axios';

export const DEFAULT_TRIAL_DAYS = 30;

export const trialDaysLabel = (n) => (n === 1 ? '1 day' : `${n} days`);

const API_URL = process.env.REACT_APP_BACKEND_URL;
let cached = null;
let inflight = null;

export default function useTrialDays() {
  const [trialDays, setTrialDays] = useState(cached ?? DEFAULT_TRIAL_DAYS);
  useEffect(() => {
    if (cached !== null) return undefined;
    if (!inflight) {
      inflight = axios
        .get(`${API_URL}/api/public/site-content`)
        .then((r) => {
          cached = Number(r.data?.trial_days) || DEFAULT_TRIAL_DAYS;
          return cached;
        })
        .catch(() => DEFAULT_TRIAL_DAYS);
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
