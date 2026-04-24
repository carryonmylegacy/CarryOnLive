/**
 * CarryOn — Post-Login Offline Warm-up (with progress events — Phase 6)
 * ============================================================================
 * Fire-and-forget bootstrap that pre-fills the local IndexedDB mirror
 * with the entities most likely to be visited first. Called on every
 * successful login and every session boot.
 *
 * Phase 6 added: the warm-up now dispatches progress events on `window`
 * so the root `<OfflineSyncProgress />` widget can surface a subtle
 * "Syncing for offline use" pill while the initial sync runs. The
 * warm-up still never blocks login — the pill simply updates in the
 * background.
 *
 * Event contract (all dispatched on `window`):
 *   'carryon:sync:start'    { detail: { total } }
 *   'carryon:sync:progress' { detail: { done, total, label } }
 *   'carryon:sync:finish'   { detail: { done, total, ms } }
 *
 * Gated by the offline feature flag. When mode is 'off' nothing fires
 * and no events are dispatched.
 */

import axios from 'axios';
import { API_URL } from '../config';
import { upsertLocalBeneficiaries } from './repos/beneficiariesRepo';
import { upsertLocalEstates } from './repos/estatesRepo';
import { upsertLocalProfile } from './repos/profileRepo';
import { upsertLocalSubscription } from './repos/subscriptionRepo';
import {
  upsertLocalDashboardTile,
  upsertLocalReadiness,
} from './repos/dashboardRepo';
import {
  upsertLocalChannels,
  upsertLocalContacts,
  upsertLocalMessages as upsertLocalChatMessages,
} from './repos/chatRepo';
import { upsertLocalVaultItems } from './repos/vaultRepo';
import { upsertLocalVoices } from './repos/voicesRepo';
import { upsertLocalMessages } from './repos/messagesRepo';
import { prefetchPhotosFrom } from './prefetchPhotos';

function emit(type, detail) {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent(type, { detail })); } catch {}
}

function taskProfile(headers) {
  return {
    label: 'profile',
    run: async () => {
      const res = await axios.get(`${API_URL}/auth/profile`, headers);
      await upsertLocalProfile(res.data || {});
      prefetchPhotosFrom(res.data);
    },
  };
}

function taskSubscription(headers) {
  return {
    label: 'subscription',
    run: async () => {
      const res = await axios.get(`${API_URL}/subscriptions/status`, headers);
      await upsertLocalSubscription(res.data || {});
    },
  };
}

function taskChat(headers) {
  return {
    label: 'chat',
    run: async () => {
      const [channelsRes, contactsRes] = await Promise.all([
        axios.get(`${API_URL}/estate-chat/channels`, headers).catch(() => null),
        axios.get(`${API_URL}/estate-chat/contacts`, headers).catch(() => null),
      ]);
      if (channelsRes?.data) await upsertLocalChannels(channelsRes.data);
      if (contactsRes?.data) await upsertLocalContacts(contactsRes.data);
      const top = (channelsRes?.data || []).slice(0, 5);
      await Promise.all(top.map(async (ch) => {
        try {
          const msgs = await axios.get(`${API_URL}/estate-chat/channels/${ch.id}/messages`, headers);
          if (msgs?.data) await upsertLocalChatMessages(ch.id, msgs.data);
        } catch { /* isolated */ }
      }));
    },
  };
}

function taskVoices() {
  return {
    label: 'voices',
    run: async () => {
      const res = await axios.get(`${API_URL}/share-cards/voices/public?limit=48`);
      const items = res?.data?.items || [];
      if (items.length) await upsertLocalVoices(items);
    },
  };
}

function taskDashboard(estateId, headers) {
  return {
    label: `dashboard:${estateId.slice(0, 6)}`,
    run: async () => {
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
      if (readiness?.data) await upsertLocalReadiness(estateId, readiness.data);
      if (bens?.data) {
        await upsertLocalBeneficiaries(estateId, bens.data);
        // Pre-warm every beneficiary photo into the SW IMAGE_CACHE so
        // the family tree paints correctly on airplane mode.
        prefetchPhotosFrom(bens.data);
      }
      if (msgs?.data) await upsertLocalMessages(estateId, msgs.data);
      if (docs?.data) await upsertLocalVaultItems(estateId, docs.data);
    },
  };
}

/** Drain a list of lazy tasks with a concurrency cap, dispatching progress. */
async function runTasksWithProgress(tasks) {
  const total = tasks.length;
  let done = 0;
  emit('carryon:sync:start', { total });
  const started = Date.now();

  // True concurrency limiter — tasks are invoked lazily.
  const LIMIT = 3;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(LIMIT, total) }, async () => {
    while (cursor < tasks.length) {
      const t = tasks[cursor++];
      try { await t.run(); } catch (err) {
        console.warn(`[offline] task ${t.label} failed:`, err);
      }
      done += 1;
      emit('carryon:sync:progress', { done, total, label: t.label });
    }
  });
  await Promise.all(workers);

  const ms = Date.now() - started;
  emit('carryon:sync:finish', { done, total, ms });
  console.log(`[offline] warm-up complete: ${done}/${total} tasks in ${ms}ms`);
}

export async function warmUpAfterLogin(token) {
  // Flag-agnostic as of Apr 24, 2026. Previously gated on
  // `isOfflineEnabled()`, which meant any user who never explicitly
  // flipped offline mode to 'on' had an EMPTY local mirror — so every
  // page's airplane-mode rescue fell through to an empty first-run
  // state. Always warming the local cache is cheap (a handful of
  // background GETs) and gives every user airplane-mode survival.
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
  // Pre-warm estate / owner photos for the tree + dashboard header.
  prefetchPhotosFrom(allEstates);

  const tasks = [
    taskProfile(headers),
    taskSubscription(headers),
    taskChat(headers),
    taskVoices(),
    ...ownedEstateIds.map((id) => taskDashboard(id, headers)),
  ];

  await runTasksWithProgress(tasks);
}

export default warmUpAfterLogin;
