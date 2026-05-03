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
import { fetchAndStoreImageBlob } from './imageBlobsRepo';
import { saveList } from '../utils/localListCache';

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
      // Phase 9b — persist the user's own profile photo BYTES under a
      // stable cache key so it survives S3 presigned-URL rotation
      // across sessions. Without this, the FamilyTree root node + the
      // top-bar avatar fall back to initials on offline relaunch even
      // though every beneficiary photo cached fine.
      try {
        if (res.data?.photo_url && res.data?.id) {
          fetchAndStoreImageBlob(res.data.photo_url, `user:${res.data.id}:photo`, 'photo')
            .catch(() => {});
        }
      } catch {}
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
      // Phase 9a — prime pinned-document blobs so they're viewable on
      // a fresh device the moment warmup finishes. Fire-and-forget;
      // failures are non-fatal (the blob will be re-attempted next
      // warmup, and the server flag still surfaces the pin to the UI).
      if (docs?.data && Array.isArray(docs.data)) {
        try {
          const { isPinnedLocally, pinDocument } = await import('./pinnedDocsRepo');
          const headerObj = headers?.headers || {};
          for (const d of docs.data) {
            if (d?.pinned_offline && d?.id && d?.file_url) {
              isPinnedLocally(d.id).then((already) => {
                if (!already) pinDocument(d, headerObj).catch(() => {});
              }).catch(() => {});
            }
          }
        } catch { /* dynamic import / quota issues — skip */ }
      }
      if (bens?.data) {
        await upsertLocalBeneficiaries(estateId, bens.data);
        // Pre-warm every beneficiary photo into the SW IMAGE_CACHE so
        // the family tree paints correctly on airplane mode.
        prefetchPhotosFrom(bens.data);
        // Phase 9b — also persist photo BYTES under stable cache keys
        // so they survive S3 presigned-URL rotation across sessions.
        // Fire-and-forget; failures are non-fatal.
        for (const b of bens.data) {
          if (b.photo_url && b.id) {
            fetchAndStoreImageBlob(b.photo_url, `beneficiary:${b.id}:photo`, 'photo')
              .catch(() => {});
          }
        }
      }
      if (msgs?.data) await upsertLocalMessages(estateId, msgs.data);
      if (docs?.data) await upsertLocalVaultItems(estateId, docs.data);
    },
  };
}

function taskFFN(estateId, headers) {
  return {
    label: `ffn:${estateId.slice(0, 6)}`,
    run: async () => {
      const res = await axios.get(`${API_URL}/ffn/${estateId}`, headers);
      const list = Array.isArray(res?.data) ? res.data : [];
      saveList(`ffn:${estateId}`, list);
    },
  };
}

function taskFinancial(estateId, headers) {
  return {
    label: `financial:${estateId.slice(0, 6)}`,
    run: async () => {
      const [bills, debts, accts, props, summary, bens, cBills, cDebts, cAccts, dav] = await Promise.all([
        axios.get(`${API_URL}/financial/bills/${estateId}`, headers).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/financial/debts/${estateId}`, headers).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/financial/accounts/${estateId}`, headers).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/financial/property/${estateId}`, headers).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/financial/summary/${estateId}`, headers).catch(() => ({ data: null })),
        axios.get(`${API_URL}/beneficiaries/${estateId}`, headers).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/financial/categories/${estateId}?module=bills`, headers).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/financial/categories/${estateId}?module=debts`, headers).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/financial/categories/${estateId}?module=accounts`, headers).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/digital-wallet/${estateId}`, headers).catch(() => ({ data: [] })),
      ]);
      const pick = (r) => (Array.isArray(r?.data) ? r.data : []);
      saveList(`financial:bills:${estateId}`, pick(bills));
      saveList(`financial:debts:${estateId}`, pick(debts));
      saveList(`financial:accounts:${estateId}`, pick(accts));
      saveList(`financial:property:${estateId}`, pick(props));
      saveList(`financial:beneficiaries:${estateId}`, pick(bens));
      saveList(`financial:dav:${estateId}`, pick(dav));
      if (summary?.data) saveList(`financial:summary:${estateId}`, summary.data);
      saveList(`financial:categories:${estateId}`, {
        bills: pick(cBills),
        debts: pick(cDebts),
        accounts: pick(cAccts),
      });
    },
  };
}

function taskDTS(estateId, headers) {
  return {
    label: `dts:${estateId.slice(0, 6)}`,
    run: async () => {
      const [bens, tasks] = await Promise.all([
        axios.get(`${API_URL}/beneficiaries/${estateId}`, headers).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/dts/tasks/${estateId}`, headers).catch(() => ({ data: [] })),
      ]);
      const mapped = (Array.isArray(tasks?.data) ? tasks.data : []).map((t) => ({
        ...t,
        type: t.task_type || t.type,
        desc: t.description || t.desc,
        lineItems: (t.line_items || t.lineItems || []),
        paymentMethod: t.payment_method || t.paymentMethod,
        discloseTo: t.disclose_to || t.discloseTo || [],
        timedRelease: t.timed_release || t.timedRelease,
        created: t.created_at?.split('T')[0] || t.created,
      }));
      saveList(`dts:beneficiaries:${estateId}`, Array.isArray(bens?.data) ? bens.data : []);
      saveList(`dts:tasks:${estateId}`, mapped);
    },
  };
}

function taskChecklist(estateId, headers) {
  return {
    label: `checklist:${estateId.slice(0, 6)}`,
    run: async () => {
      const res = await axios.get(`${API_URL}/checklists/${estateId}`, headers);
      saveList(`checklist:items:${estateId}`, Array.isArray(res?.data) ? res.data : []);
    },
  };
}

function taskCCP(estateId, headers) {
  return {
    label: `ccp:${estateId.slice(0, 6)}`,
    run: async () => {
      const res = await axios.get(`${API_URL}/ccp/plans/${estateId}`, headers);
      saveList(`ccp:plans:${estateId}`, Array.isArray(res?.data) ? res.data : []);
    },
  };
}

function taskDAVBeneficiaries(estateId, headers) {
  return {
    label: `dav:bens:${estateId.slice(0, 6)}`,
    run: async () => {
      const res = await axios.get(`${API_URL}/beneficiaries/${estateId}`, headers);
      saveList(`dav:beneficiaries:${estateId}`, Array.isArray(res?.data) ? res.data : []);
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
        // Warmup is best-effort — a 4xx from a single task just means
        // the current user can't see that resource (e.g. a stale
        // estate id, a feature gated off for their tier). Log loudly
        // only for 5xx and network errors; quiet for expected denials
        // so we don't flood the console with the same 403 every time
        // the user navigates and AuthContext re-warms.
        const status = err?.response?.status;
        if (status && status >= 400 && status < 500) {
          // Expected: insufficient access / not-found / gated.
        } else {
          console.warn(`[offline] task ${t.label} failed:`, err);
        }
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
  // Phase 9b — persist estate cover + owner photo BYTES under stable
  // cache keys so they survive S3 URL rotation. Fire-and-forget.
  for (const e of allEstates) {
    if (e.estate_photo_url && e.id) {
      fetchAndStoreImageBlob(e.estate_photo_url, `estate:${e.id}:cover`, 'photo').catch(() => {});
    }
    if (e.owner_photo_url && e.id) {
      fetchAndStoreImageBlob(e.owner_photo_url, `estate:${e.id}:owner`, 'photo').catch(() => {});
    }
  }

  // Apr 27, 2026 — scope warm-up to the CURRENTLY-SELECTED estate only.
  // Previously we fanned out 7 task families × 5 calls = ~35 GETs per owned
  // estate; for a multi-estate user (e.g. our founder admin with 97 estates)
  // that produced 3,000+ parallel requests on every login and tripped the
  // server-side rate limiter, then cascaded a 429 storm into every page
  // mount. We now warm just the active estate; other estates are warmed
  // lazily the first time the user actually navigates into them via the
  // estate-switcher, which is the only time they need offline survival
  // for THAT estate's data anyway.
  let activeEstateId = null;
  try {
    activeEstateId = (typeof localStorage !== 'undefined' && localStorage.getItem('selected_estate_id')) || null;
  } catch {}
  if (!activeEstateId && ownedEstateIds.length > 0) {
    activeEstateId = ownedEstateIds[0];
  }
  const warmEstateIds = activeEstateId && ownedEstateIds.includes(activeEstateId)
    ? [activeEstateId]
    : ownedEstateIds.slice(0, 1);

  const tasks = [
    taskProfile(headers),
    taskSubscription(headers),
    taskChat(headers),
    taskVoices(),
    ...warmEstateIds.map((id) => taskDashboard(id, headers)),
    ...warmEstateIds.map((id) => taskFFN(id, headers)),
    ...warmEstateIds.map((id) => taskFinancial(id, headers)),
    ...warmEstateIds.map((id) => taskDTS(id, headers)),
    ...warmEstateIds.map((id) => taskChecklist(id, headers)),
    ...warmEstateIds.map((id) => taskCCP(id, headers)),
    ...warmEstateIds.map((id) => taskDAVBeneficiaries(id, headers)),
  ];

  await runTasksWithProgress(tasks);
}

export default warmUpAfterLogin;
