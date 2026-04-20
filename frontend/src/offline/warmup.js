/**
 * CarryOn — Post-Login Offline Warm-up
 * ============================================================================
 * Fire-and-forget bootstrap that pre-fills the local IndexedDB mirror
 * with the entities most likely to be visited first. Called once, the
 * moment a user successfully logs in (and again on every boot via
 * AuthContext so returning users start with a fresh local cache).
 *
 * Runs entirely in the background — never blocks the login flow, never
 * throws. If anything fails the user just sees the current (server-fetch)
 * behavior on their next page visit, which is the pre-offline baseline.
 *
 * Gated by the feature flag: completely skipped when mode === 'off'.
 *
 * Phase 3 expanded scope:
 *   - Estate list (all roles)
 *   - Current user profile
 *   - Current subscription status
 *   - Per-estate dashboard tile (stats + readiness + checklists)
 *   - Per-estate beneficiaries (Phase 1)
 *
 * Keep the parallel count small so we don't saturate the user's uplink
 * right after login. Each task is isolated — one failure doesn't stop
 * the others.
 */

import axios from 'axios';
import { API_URL } from '../config';
import { isOfflineEnabled } from './featureFlag';
import { upsertLocalBeneficiaries } from './repos/beneficiariesRepo';
import { upsertLocalEstates } from './repos/estatesRepo';
import { upsertLocalProfile } from './repos/profileRepo';
import { upsertLocalSubscription } from './repos/subscriptionRepo';
import {
  upsertLocalDashboardTile,
  upsertLocalReadiness,
} from './repos/dashboardRepo';

async function warmProfile(headers) {
  try {
    const res = await axios.get(`${API_URL}/auth/profile`, headers);
    await upsertLocalProfile(res.data || {});
  } catch { /* silent */ }
}

async function warmSubscription(headers) {
  try {
    const res = await axios.get(`${API_URL}/subscriptions/status`, headers);
    await upsertLocalSubscription(res.data || {});
  } catch { /* silent */ }
}

async function warmDashboardTile(estateId, headers) {
  try {
    const [docs, msgs, bens, checklist, readiness] = await Promise.all([
      axios.get(`${API_URL}/documents/${estateId}`, headers).catch(() => null),
      axios.get(`${API_URL}/messages/${estateId}`, headers).catch(() => null),
      axios.get(`${API_URL}/beneficiaries/${estateId}`, headers).catch(() => null),
      axios.get(`${API_URL}/checklists/${estateId}`, headers).catch(() => null),
      axios.get(`${API_URL}/estate/${estateId}/readiness`, headers).catch(() => null),
    ]);
    const tile = {
      stats: {
        documents: docs?.data?.length || 0,
        messages: msgs?.data?.length || 0,
        beneficiaries: bens?.data?.length || 0,
      },
      readiness: readiness?.data || null,
      checklists: checklist?.data || [],
      financialSummary: null,
    };
    await upsertLocalDashboardTile(estateId, tile);
    if (readiness?.data) {
      await upsertLocalReadiness(estateId, readiness.data);
    }
    if (bens?.data) {
      await upsertLocalBeneficiaries(estateId, bens.data);
    }
  } catch (err) {
    console.warn(`[offline] warm-up dashboard(${estateId}) failed:`, err);
  }
}

export async function warmUpAfterLogin(token) {
  if (!isOfflineEnabled()) return;
  if (!token) return;
  const headers = { headers: { Authorization: `Bearer ${token}` } };

  // Fetch the user's estate list first so we know which estate IDs to warm.
  let allEstates = [];
  let ownedEstateIds = [];
  try {
    const estates = await axios.get(`${API_URL}/estates`, headers).then((r) => r.data);
    allEstates = estates || [];
    ownedEstateIds = allEstates
      .filter((e) => e.user_role_in_estate === 'owner' || (!e.user_role_in_estate && !e.is_beneficiary_estate))
      .map((e) => e.id);
  } catch (err) {
    console.warn('[offline] warm-up estates fetch failed:', err);
    return;
  }

  // Mirror the estate list itself for the Dashboard switcher.
  try { await upsertLocalEstates(allEstates); } catch {}

  // Warm profile + subscription in parallel with per-estate dashboard
  // tiles. Cap concurrency at 3 so a slow uplink doesn't choke.
  const tasks = [
    warmProfile(headers),
    warmSubscription(headers),
    ...ownedEstateIds.map((id) => warmDashboardTile(id, headers)),
  ];

  const limit = 3;
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) {
      const my = tasks[i++];
      try { await my; } catch { /* isolated */ }
    }
  });
  await Promise.all(workers);
  console.log(`[offline] warm-up complete: ${ownedEstateIds.length} estate(s) seeded + profile + subscription`);
}

export default warmUpAfterLogin;
