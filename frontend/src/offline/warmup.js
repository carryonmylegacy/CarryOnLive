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

import apiClient from '../utils/apiClient';
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
import { fetchAndStoreImageBlob, fetchAndStoreAuthedBlob } from './imageBlobsRepo';
import { saveList } from '../utils/localListCache';
import { cacheBenEstates, cacheBenSection } from '../utils/beneficiaryOfflineCache';

function emit(type, detail) {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent(type, { detail })); } catch {}
}

/**
 * Drain a list of items through `fn` with a bounded concurrency cap.
 * Each `fn` is best-effort (its own try/catch) so one bad item never
 * blocks the rest.
 */
async function runLimited(items, fn, limit = 2) {
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return;
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (i < arr.length) {
      const item = arr[i++];
      try { await fn(item); } catch { /* best-effort per item */ }
    }
  });
  await Promise.all(workers);
}

/**
 * NON-BLOCKING, idle-scheduled media prefetch (Jun 3 2026 — reliability fix).
 *
 * Media blobs (SDV thumbnails, MM videos, photos) must NEVER block warm-up
 * task completion or saturate the browser's ~6-connections-per-origin pool
 * while the user is looking at the page. Awaiting them (the earlier "honest
 * pill" approach) starved the visible page's own thumbnail/avatar fetches
 * and made the offline boot timing-fragile. Instead we:
 *   - return immediately (fire-and-forget — the task resolves without it),
 *   - defer the work to browser idle time (requestIdleCallback),
 *   - cap to 2 concurrent so user-initiated requests keep headroom.
 * The truthful per-item "Saved offline" badges (OfflineSavedBadge) are the
 * honest signal that a specific blob actually landed — not this prefetch.
 */
function idlePrefetch(items, fn) {
  const arr = (Array.isArray(items) ? items : []).filter(Boolean);
  if (!arr.length) return;
  // Defer ~1s so the post-login first paint + the visible page's own
  // on-render media fetches grab connections first, then drain in the
  // background at low concurrency. We use setTimeout, NOT
  // requestIdleCallback: on iOS PWA the app may never report "idle"
  // during active use, which silently skipped the prefetch and left
  // SDV thumbnails / MM videos uncached offline.
  setTimeout(() => { runLimited(arr, fn, 2).catch(() => {}); }, 1000);
}

function taskProfile(headers) {
  return {
    label: 'profile',
    run: async () => {
      const res = await apiClient.get(`${API_URL}/auth/profile`, headers);
      await upsertLocalProfile(res.data || {});
      prefetchPhotosFrom(res.data);
      // Phase 9b — persist the user's own profile photo BYTES under a
      // stable cache key so it survives S3 presigned-URL rotation
      // across sessions. Without this, the FamilyTree root node + the
      // top-bar avatar fall back to initials on offline relaunch even
      // though every beneficiary photo cached fine.
      //
      // May 3 2026 — AWAIT instead of fire-and-forget so the warmup
      // task doesn't resolve before the photo bytes are actually
      // stored in IndexedDB. Previously a user who went offline very
      // shortly after login could complete `taskProfile` (because the
      // /auth/profile fetch returned in <1s) while the photo blob
      // fetch was still in flight — and then the offline relaunch
      // had no blob to display. Awaiting it forces the warmup
      // progress signal to wait for the bytes too.
      //
      // Wrapped in its own try/catch so a CORS / 403 on the photo
      // doesn't fail the entire profile task.
      try {
        if (res.data?.photo_url && res.data?.id) {
          await fetchAndStoreImageBlob(res.data.photo_url, `user:${res.data.id}:photo`, 'photo');
        }
      } catch { /* photo blob is best-effort */ }
    },
  };
}

function taskSubscription(headers) {
  return {
    label: 'subscription',
    run: async () => {
      const res = await apiClient.get(`${API_URL}/subscriptions/status`, headers);
      await upsertLocalSubscription(res.data || {});
    },
  };
}

/**
 * Admin-only: pull the platform-settings doc from the server and, if
 * `offline_mode === 'on'`, automatically flip the DEVICE's offline flag
 * to 'on' as well. This is the missing link that lets the founder
 * survive a PWA reinstall / new deployment without having to manually
 * re-toggle Offline in the admin portal every single time. Non-admins
 * get a 403 which we swallow.
 *
 * NOTE: only ever sets 'on' → the founder opts out manually if they
 * want it off on a specific device, and we must respect that. Server
 * is the source of truth for the "should this account use offline"
 * intent; the device is the source of truth for its own behaviour.
 */
function taskAdminPlatformSettings(headers) {
  return {
    label: 'admin-platform-settings',
    run: async () => {
      try {
        const res = await apiClient.get(`${API_URL}/admin/platform-settings`, headers);
        const serverMode = res?.data?.offline_mode;
        if (serverMode === 'on') {
          try {
            if (typeof localStorage !== 'undefined'
                && localStorage.getItem('carryon_offline_v1') !== 'on') {
              localStorage.setItem('carryon_offline_v1', 'on');
              window.dispatchEvent(new CustomEvent('carryon:offline-flag-changed', { detail: { mode: 'on' } }));
            }
          } catch { /* private mode etc. */ }
        }
      } catch { /* non-admin 403 — silent */ }
    },
  };
}

function taskChat(headers) {
  return {
    label: 'chat',
    run: async () => {
      const [channelsRes, contactsRes] = await Promise.all([
        apiClient.get(`${API_URL}/estate-chat/channels`, headers).catch(() => null),
        apiClient.get(`${API_URL}/estate-chat/contacts`, headers).catch(() => null),
      ]);
      if (channelsRes?.data) await upsertLocalChannels(channelsRes.data);
      if (contactsRes?.data) await upsertLocalContacts(contactsRes.data);
      const top = (channelsRes?.data || []).slice(0, 5);
      await Promise.all(top.map(async (ch) => {
        try {
          const msgs = await apiClient.get(`${API_URL}/estate-chat/channels/${ch.id}/messages`, headers);
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
      const res = await apiClient.get(`${API_URL}/share-cards/voices/public?limit=48`);
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
        apiClient.get(`${API_URL}/documents/${estateId}`, headers).catch(() => null),
        apiClient.get(`${API_URL}/messages/${estateId}`, headers).catch(() => null),
        apiClient.get(`${API_URL}/beneficiaries/${estateId}`, headers).catch(() => null),
        apiClient.get(`${API_URL}/checklists/${estateId}`, headers).catch(() => null),
        apiClient.get(`${API_URL}/estate/${estateId}/readiness`, headers).catch(() => null),
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
            // Cloud-stored docs no longer have a static `file_url`;
            // pinDocument falls back to the auth'd API endpoint via
            // doc.id alone, so we only require `pinned_offline` + an id.
            if (d?.pinned_offline && d?.id) {
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
        // Phase 9b — also persist photo BYTES under stable cache keys so
        // they survive S3 presigned-URL rotation across sessions.
        // NON-BLOCKING + idle-scheduled (Jun 3 2026): never holds warm-up
        // worker slots or saturates connections the visible page needs.
        idlePrefetch(
          bens.data.filter((b) => b.photo_url && b.id),
          (b) => fetchAndStoreImageBlob(b.photo_url, `beneficiary:${b.id}:photo`, 'photo'),
        );
      }
      if (msgs?.data) await upsertLocalMessages(estateId, msgs.data);
      if (docs?.data) await upsertLocalVaultItems(estateId, docs.data);

      // Phase 9c — prime SDV thumbnail blobs + Milestone Message media so
      // the vault grid paints and MM videos play on airplane mode WITHOUT
      // the user having opened each one online first. Authenticated (Bearer)
      // endpoints → routed through fetchAndStoreAuthedBlob. Fire-and-forget,
      // capped, and quota-safe (putImageBlob swallows quota errors). The
      // browser's 6-connections-per-origin limit naturally throttles these.
      // Phase 9c — prime SDV thumbnail blobs + Milestone Message media so
      // the vault grid paints and MM videos play on airplane mode WITHOUT
      // the user having opened each one online first. NON-BLOCKING +
      // idle-scheduled + throttled (Jun 3 2026 reliability fix): this can
      // NEVER block warm-up completion or starve the visible page's own
      // on-render thumbnail fetches. Caps kept small; the rest lazy-load
      // on demand via DocThumbnail / the play handler.
      try {
        if (Array.isArray(docs?.data)) {
          const previewable = docs.data
            .filter((d) => d?.id && !d.is_locked && /pdf|image/i.test(d.file_type || ''))
            .slice(0, 40);
          idlePrefetch(previewable, (d) =>
            fetchAndStoreAuthedBlob(`/documents/${d.id}/preview`, `docthumb:${d.id}`, 'doc_thumb'));
        }
        if (Array.isArray(msgs?.data)) {
          const withVideo = msgs.data.filter((mm) => mm?.id && mm.video_url).slice(0, 12);
          idlePrefetch(withVideo, (mm) =>
            fetchAndStoreAuthedBlob(`/messages/video/${mm.video_url}`, `mm:${mm.id}:video`, 'milestone_media'));
        }
      } catch { /* dynamic import / quota issues — skip */ }
    },
  };
}

function taskFFN(estateId, headers) {
  return {
    label: `ffn:${estateId.slice(0, 6)}`,
    run: async () => {
      const res = await apiClient.get(`${API_URL}/ffn/${estateId}`, headers);
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
        apiClient.get(`${API_URL}/financial/bills/${estateId}`, headers).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/financial/debts/${estateId}`, headers).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/financial/accounts/${estateId}`, headers).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/financial/property/${estateId}`, headers).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/financial/summary/${estateId}`, headers).catch(() => ({ data: null })),
        apiClient.get(`${API_URL}/beneficiaries/${estateId}`, headers).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/financial/categories/${estateId}?module=bills`, headers).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/financial/categories/${estateId}?module=debts`, headers).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/financial/categories/${estateId}?module=accounts`, headers).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/digital-wallet/${estateId}`, headers).catch(() => ({ data: [] })),
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
        apiClient.get(`${API_URL}/beneficiaries/${estateId}`, headers).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/dts/tasks/${estateId}`, headers).catch(() => ({ data: [] })),
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
      const res = await apiClient.get(`${API_URL}/checklists/${estateId}`, headers);
      saveList(`checklist:items:${estateId}`, Array.isArray(res?.data) ? res.data : []);
    },
  };
}

function taskCCP(estateId, headers) {
  return {
    label: `ccp:${estateId.slice(0, 6)}`,
    run: async () => {
      const res = await apiClient.get(`${API_URL}/ccp/plans/${estateId}`, headers);
      saveList(`ccp:plans:${estateId}`, Array.isArray(res?.data) ? res.data : []);
    },
  };
}

function taskDAVBeneficiaries(estateId, headers) {
  return {
    label: `dav:bens:${estateId.slice(0, 6)}`,
    run: async () => {
      const res = await apiClient.get(`${API_URL}/beneficiaries/${estateId}`, headers);
      saveList(`dav:beneficiaries:${estateId}`, Array.isArray(res?.data) ? res.data : []);
    },
  };
}

/**
 * Beneficiary-estate warm-up (Jun 3 2026).
 *
 * Mirrors BeneficiaryDashboardPage's online fetch into the SAME
 * `beneficiary:<section>:<estateId>` localStorage cache keys that the
 * beneficiary pages read on an offline mount (via `readBenSection`).
 * Without this the Offline Capabilities card's promise — "Estate
 * switching — switch between every estate you are a beneficiary of —
 * all cached locally" — was false for any estate the beneficiary hadn't
 * manually opened page-by-page while online. Now a single login warms
 * Dashboard / Vault / Messages / Checklist / Financial for every
 * connected estate, plus the MM video + SDV thumbnail bytes.
 */
function taskBeneficiaryEstate(estateId, headers) {
  return {
    label: `ben-estate:${estateId.slice(0, 6)}`,
    run: async () => {
      const [estateRes, permRes] = await Promise.all([
        apiClient.get(`${API_URL}/estates/${estateId}`, headers).catch(() => null),
        apiClient.get(`${API_URL}/beneficiary/my-permissions/${estateId}`, headers).catch(() => null),
      ]);
      if (estateRes?.data) cacheBenSection(estateId, 'estate', estateRes.data);
      const perms = permRes?.data || null;
      if (perms) cacheBenSection(estateId, 'permissions', perms);
      // Pre-transition estates expose no post-transition content — stop here.
      if (!perms || !perms.is_transitioned) return;
      const fa = perms.feature_access || {};
      const [docsRes, msgsRes, clRes] = await Promise.all([
        fa.sdv_access !== false ? apiClient.get(`${API_URL}/documents/${estateId}`, headers).catch(() => null) : null,
        fa.mm_access !== false ? apiClient.get(`${API_URL}/messages/${estateId}`, headers).catch(() => null) : null,
        fa.iac_access !== false ? apiClient.get(`${API_URL}/checklists/${estateId}`, headers).catch(() => null) : null,
      ]);
      if (docsRes?.data) cacheBenSection(estateId, 'documents', docsRes.data);
      if (msgsRes?.data) cacheBenSection(estateId, 'messages', msgsRes.data);
      if (clRes?.data) cacheBenSection(estateId, 'checklist', clRes.data);
      // Financial designations the BeneficiaryFinancialPage reads offline.
      const [bills, debts, accts, summary] = await Promise.all([
        apiClient.get(`${API_URL}/financial/bills/${estateId}`, headers).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/financial/debts/${estateId}`, headers).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/financial/accounts/${estateId}`, headers).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/financial/summary/${estateId}`, headers).catch(() => ({ data: null })),
      ]);
      const pick = (r) => (Array.isArray(r?.data) ? r.data : []);
      cacheBenSection(estateId, 'financial_bills', pick(bills));
      cacheBenSection(estateId, 'financial_debts', pick(debts));
      cacheBenSection(estateId, 'financial_accounts', pick(accts));
      if (summary?.data) cacheBenSection(estateId, 'financial_summary', summary.data);
      // Persist MM video + SDV thumbnail BYTES so they play / paint offline.
      // NON-BLOCKING + idle-scheduled — never blocks this estate's warm-up
      // or competes with the page the beneficiary is viewing.
      const withVideo = (Array.isArray(msgsRes?.data) ? msgsRes.data : [])
        .filter((m) => m?.id && m.video_url).slice(0, 12);
      idlePrefetch(withVideo, (m) =>
        fetchAndStoreAuthedBlob(`/messages/video/${m.video_url}`, `mm:${m.id}:video`, 'milestone_media'));
      const thumbs = (Array.isArray(docsRes?.data) ? docsRes.data : [])
        .filter((d) => d?.id && !d.is_locked && /pdf|image/i.test(d.file_type || '')).slice(0, 40);
      idlePrefetch(thumbs, (d) =>
        fetchAndStoreAuthedBlob(`/documents/${d.id}/preview`, `docthumb:${d.id}`, 'doc_thumb'));
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
    const estates = await apiClient.get(`${API_URL}/estates`, headers).then((r) => r.data);
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
  // Mirror the beneficiary-connected estate list + warm each one so a
  // beneficiary can switch between EVERY estate they're connected to and
  // read its cached sections fully offline (matches the Offline
  // Capabilities card's "Estate switching — all cached locally" promise).
  // Capped low (3) to protect a user connected to many estates from a
  // login-time request storm; additional estates warm lazily on first visit.
  let beneficiaryEstateIds = [];
  try {
    cacheBenEstates(allEstates);
    beneficiaryEstateIds = allEstates
      .filter((e) => e.id && !ownedEstateIds.includes(e.id))
      .map((e) => e.id)
      .slice(0, 3);
  } catch {}
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
    taskAdminPlatformSettings(headers),
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
    ...beneficiaryEstateIds.map((id) => taskBeneficiaryEstate(id, headers)),
  ];

  await runTasksWithProgress(tasks);
}

export default warmUpAfterLogin;
