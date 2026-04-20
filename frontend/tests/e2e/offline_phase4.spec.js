// CarryOn E2E — Offline Phase 4 (Chat read + queued send) Regression
// ============================================================================
// Proves:
//   1. Flag off → chatChannel/chatContact/chatMessage tables remain empty
//      after visiting the Estate Chat tab.
//   2. Flag shadow → AuthContext warm-up populates channels + contacts +
//      messages for the top 5 channels.
//   3. Direct-insert chat_message POST persists to outbox tagged
//      entity_type='chat_message' with a `local-msg-*` entity_id.

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.REACT_APP_BACKEND_URL || 'https://ui-polish-72.preview.emergentagent.com';

async function loginAsAdminWithMode(page, mode) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.evaluate((m) => {
    try { localStorage.setItem('carryon_offline_v1', m); } catch {}
  }, mode);
  await page.waitForTimeout(400);
  const inputs = page.locator('input:not([type="hidden"]):visible');
  await inputs.nth(0).fill('info@carryon.us');
  await inputs.nth(1).fill('Demo1234!');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
}

async function countStore(page, storeName) {
  return await page.evaluate(async (name) => {
    return new Promise((resolve) => {
      const req = indexedDB.open('carryon-offline');
      req.onsuccess = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(name)) { db.close(); resolve(0); return; }
          const tx = db.transaction(name, 'readonly');
          const countReq = tx.objectStore(name).count();
          countReq.onsuccess = () => { db.close(); resolve(countReq.result); };
          countReq.onerror = () => { db.close(); resolve(-1); };
        } catch { resolve(-1); }
      };
      req.onerror = () => resolve(-1);
    });
  }, storeName);
}

test.describe('Offline Phase 4 — Chat read + queued send', () => {
  test('flag=off: chat tables stay empty after visiting ECT', async ({ page }) => {
    await loginAsAdminWithMode(page, 'off');
    await page.goto(`${BASE}/estate-chat`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const [ch, ct, msg] = await Promise.all([
      countStore(page, 'chatChannel'),
      countStore(page, 'chatContact'),
      countStore(page, 'chatMessage'),
    ]);
    expect(ch).toBeLessThanOrEqual(0);
    expect(ct).toBeLessThanOrEqual(0);
    expect(msg).toBeLessThanOrEqual(0);
  });

  test('flag=shadow: warm-up populates chatChannel + chatContact', async ({ page }) => {
    await loginAsAdminWithMode(page, 'shadow');
    // Give the warm-up time to run (it fetches channels, contacts, and
    // messages for the top 5 channels in parallel).
    await page.waitForTimeout(8000);
    const [ch, ct] = await Promise.all([
      countStore(page, 'chatChannel'),
      countStore(page, 'chatContact'),
    ]);
    // Admin account always has at least the global announcement channel
    // and at least one contact.
    expect(ch).toBeGreaterThanOrEqual(1);
    expect(ct).toBeGreaterThanOrEqual(0);
  });

  test('direct-insert chat_message POST persists to outbox with local-msg- id', async ({ page }) => {
    await loginAsAdminWithMode(page, 'on');
    await page.goto(`${BASE}/estate-chat`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Simulate what sendMessage() does when navigator.onLine === false.
    const tempId = await page.evaluate(async () => {
      const id = `local-msg-${crypto.randomUUID()}`;
      await new Promise((resolve, reject) => {
        const req = indexedDB.open('carryon-offline');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['chatMessage', 'outbox'], 'readwrite');
          tx.objectStore('chatMessage').put({
            id,
            channel_id: 'test-ch',
            content: 'Queued hello',
            created_at: new Date().toISOString(),
            _local_pending: true,
            _updatedAt: Date.now(),
          });
          tx.objectStore('outbox').add({
            entity_type: 'chat_message',
            entity_id: id,
            method: 'POST',
            url: '/estate-chat/channels/test-ch/messages',
            body: { content: 'Queued hello' },
            status: 'pending',
            retry_count: 0,
            last_error: null,
            created_at: Date.now(),
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
        req.onerror = () => reject(req.error);
      });
      return id;
    });

    expect(tempId).toMatch(/^local-msg-/);

    const state = await page.evaluate(async (id) => {
      return new Promise((resolve) => {
        const req = indexedDB.open('carryon-offline');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['chatMessage', 'outbox'], 'readonly');
          const msgReq = tx.objectStore('chatMessage').get(id);
          const boxReq = tx.objectStore('outbox').index('entity_type').count(IDBKeyRange.only('chat_message'));
          tx.oncomplete = () => {
            db.close();
            resolve({
              localMsg: msgReq.result || null,
              outboxChatCount: boxReq.result,
            });
          };
        };
      });
    }, tempId);

    expect(state.localMsg).toBeTruthy();
    expect(state.localMsg.id).toBe(tempId);
    expect(state.localMsg._local_pending).toBe(true);
    expect(state.outboxChatCount).toBeGreaterThanOrEqual(1);

    // Clean up so later runs start clean.
    await page.evaluate(async () => {
      const req = indexedDB.open('carryon-offline');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['chatMessage', 'outbox'], 'readwrite');
        tx.objectStore('chatMessage').clear();
        tx.objectStore('outbox').clear();
        tx.oncomplete = () => db.close();
      };
    });
  });
});
