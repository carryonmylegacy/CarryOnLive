/**
 * CarryOn — Post-Login Offline Warm-up
 * ============================================================================
 * Fire-and-forget bootstrap that pre-fills the local IndexedDB mirror
 * with the entities most likely to be visited first. Called once, the
 * moment a user successfully logs in.
 *
 * Runs entirely in the background — never blocks the login flow, never
 * throws. If anything fails the user just sees the current (server-fetch)
 * behavior on their next page visit, which is the pre-offline baseline.
 *
 * Gated by the feature flag: completely skipped when mode === 'off'.
 *
 * Adding new entities to warm up is a one-liner — just add a fetch +
 * a matching repo `upsert` below. Keep the parallel count small so we
 * don't saturate the user's uplink right after login.
 */

import axios from 'axios';
import { API_URL } from '../config';
import { isOfflineEnabled } from './featureFlag';
import { upsertLocalBeneficiaries } from './repos/beneficiariesRepo';

export async function warmUpAfterLogin(token) {
  if (!isOfflineEnabled()) return;
  if (!token) return;
  const headers = { headers: { Authorization: `Bearer ${token}` } };

  // Fetch the user's estate list first so we know which estate IDs to
  // warm beneficiaries for. A user can own multiple estates.
  let ownedEstateIds = [];
  try {
    const estates = await axios.get(`${API_URL}/estates`, headers).then((r) => r.data);
    ownedEstateIds = (estates || [])
      .filter((e) => e.user_role_in_estate === 'owner' || (!e.user_role_in_estate && !e.is_beneficiary_estate))
      .map((e) => e.id);
  } catch (err) {
    // Silent — the user will just see the normal fetch path on next visit.
    console.warn('[offline] warm-up estates fetch failed:', err);
    return;
  }

  // Warm beneficiaries for each owned estate in parallel, capped at 3 at a
  // time so slow networks don't choke. Each failure is isolated — one
  // estate's beneficiaries failing doesn't stop the others.
  const tasks = ownedEstateIds.map((estateId) => async () => {
    try {
      const list = await axios.get(`${API_URL}/beneficiaries/${estateId}`, headers).then((r) => r.data);
      await upsertLocalBeneficiaries(estateId, list || []);
    } catch (err) {
      console.warn(`[offline] warm-up beneficiaries(${estateId}) failed:`, err);
    }
  });

  // Simple concurrency limiter.
  const limit = 3;
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) {
      const my = tasks[i++];
      await my();
    }
  });
  await Promise.all(workers);
  console.log(`[offline] warm-up complete: ${ownedEstateIds.length} estate(s) seeded`);
}

export default warmUpAfterLogin;
