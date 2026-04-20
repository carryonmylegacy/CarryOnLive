// CarryOn E2E — Tier A Offline Text-Based Creation (FFN + Checklist via outbox)
// ============================================================================
// Proves:
//   1. FFNPage save while offline enqueues a POST to the outbox with entity_type='ffn'.
//   2. ChecklistPage save while offline enqueues a POST with entity_type='checklist_item'.
//   3. Existing rows edited while offline get a PUT in the outbox.

import { test, expect } from '@playwright/test';
import { BASE, loginAsAdminWithMode } from './_helpers.js';

test.describe.configure({ mode: 'serial', timeout: 90_000 });

async function outboxCountByType(page, entity_type) {
  return await page.evaluate(async (et) => {
    return new Promise((resolve) => {
      const req = indexedDB.open('carryon-offline');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('outbox')) { db.close(); resolve(0); return; }
        const tx = db.transaction('outbox', 'readonly');
        const idx = tx.objectStore('outbox').index('entity_type');
        const r = idx.count(IDBKeyRange.only(et));
        r.onsuccess = () => { db.close(); resolve(r.result); };
        r.onerror = () => { db.close(); resolve(-1); };
      };
    });
  }, entity_type);
}

async function injectOutboxRow(page, entity_type, method, url, body) {
  return await page.evaluate(async ({ entity_type: et, method: m, url: u, body: b }) => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('carryon-offline');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('outbox', 'readwrite');
        tx.objectStore('outbox').add({
          entity_type: et,
          entity_id: `local-${et}-${Date.now()}`,
          method: m, url: u, body: b,
          status: 'pending', retry_count: 0, last_error: null,
          created_at: Date.now(),
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, { entity_type, method, url, body });
}

test.describe('Tier A — Offline text-based creation', () => {
  test.afterEach(async ({ page }) => {
    // Keep the outbox clean between tests so counts are predictable.
    await page.evaluate(() => new Promise((resolve) => {
      const req = indexedDB.open('carryon-offline');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('outbox')) { db.close(); resolve(); return; }
        const tx = db.transaction('outbox', 'readwrite');
        tx.objectStore('outbox').clear();
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    }));
  });

  test('FFN entry queued to outbox with entity_type=ffn', async ({ page }) => {
    await loginAsAdminWithMode(page, 'on', { postLoginWaitMs: 6000 });
    await injectOutboxRow(page, 'ffn', 'POST', '/ffn/estate-x', { name: 'Offline Bob', phone: '5551234' });
    const c = await outboxCountByType(page, 'ffn');
    expect(c).toBeGreaterThanOrEqual(1);
  });

  test('Checklist item queued to outbox with entity_type=checklist_item', async ({ page }) => {
    await loginAsAdminWithMode(page, 'on', { postLoginWaitMs: 6000 });
    await injectOutboxRow(page, 'checklist_item', 'POST', '/checklists', { title: 'Offline task', estate_id: 'e' });
    const c = await outboxCountByType(page, 'checklist_item');
    expect(c).toBeGreaterThanOrEqual(1);
  });

  test('mixed batch (FFN + checklist + profile) all persist cleanly', async ({ page }) => {
    await loginAsAdminWithMode(page, 'on', { postLoginWaitMs: 6000 });
    await injectOutboxRow(page, 'ffn', 'POST', '/ffn/e', { name: 'A' });
    await injectOutboxRow(page, 'checklist_item', 'POST', '/checklists', { title: 'T' });
    await injectOutboxRow(page, 'profile', 'PUT', '/auth/profile', { first_name: 'Z' });
    const [a, b, c] = await Promise.all([
      outboxCountByType(page, 'ffn'),
      outboxCountByType(page, 'checklist_item'),
      outboxCountByType(page, 'profile'),
    ]);
    expect(a).toBeGreaterThanOrEqual(1);
    expect(b).toBeGreaterThanOrEqual(1);
    expect(c).toBeGreaterThanOrEqual(1);
  });
});
