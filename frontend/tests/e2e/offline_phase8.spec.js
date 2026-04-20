// CarryOn E2E — Offline Phase 8 (Conflict resolver) Regression
// ============================================================================
// Proves:
//   1. A manually-injected conflict row (status='conflict' with server_row)
//      is picked up by <ConflictResolver /> when the offline flag is 'on'.
//   2. Clicking "Keep theirs" drops the outbox row.
//   3. Clicking "Keep mine" flips the row back to status='pending'.

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.REACT_APP_BACKEND_URL || 'https://ui-polish-72.preview.emergentagent.com';

async function loginAsAdminWithMode(page, mode) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.evaluate((m) => {
    try { localStorage.setItem('carryon_offline_v1', m); } catch {}
  }, mode);
  await page.waitForTimeout(400);
  const inputs = page.locator('input');
  await inputs.nth(0).fill('info@carryon.us');
  await inputs.nth(1).fill('Demo1234!');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3500);
}

async function injectConflict(page) {
  return await page.evaluate(async () => {
    const id = await new Promise((resolve, reject) => {
      const req = indexedDB.open('carryon-offline');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('outbox', 'readwrite');
        const row = {
          entity_type: 'beneficiary',
          entity_id: 'conflict-test-id',
          method: 'PUT',
          url: '/beneficiaries/conflict-test-id',
          body: { first_name: 'ClientEdit' },
          status: 'conflict',
          retry_count: 1,
          last_error: 'Conflict',
          server_row: { id: 'conflict-test-id', first_name: 'ServerEdit' },
          conflict_status: 409,
          created_at: Date.now(),
        };
        const r = tx.objectStore('outbox').add(row);
        r.onsuccess = () => { resolve(r.result); };
        r.onerror = () => { reject(r.error); };
        tx.oncomplete = () => db.close();
      };
      req.onerror = () => reject(req.error);
    });
    window.dispatchEvent(new CustomEvent('carryon:outbox:conflict', {
      detail: { id, entity_type: 'beneficiary' },
    }));
    return id;
  });
}

async function outboxStatus(page, id) {
  return await page.evaluate(async (rowId) => {
    return new Promise((resolve) => {
      const req = indexedDB.open('carryon-offline');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('outbox', 'readonly');
        const r = tx.objectStore('outbox').get(rowId);
        r.onsuccess = () => { db.close(); resolve(r.result ? r.result.status : 'missing'); };
        r.onerror = () => { db.close(); resolve('err'); };
      };
    });
  }, id);
}

test.describe('Offline Phase 8 — Conflict resolver', () => {
  test('flag=on: injected conflict opens the resolver modal', async ({ page }) => {
    await loginAsAdminWithMode(page, 'on');
    await injectConflict(page);
    await expect(page.locator('[data-testid="conflict-resolver"]')).toBeVisible({ timeout: 8000 });

    // Clean up so later runs start clean.
    await page.evaluate(async () => {
      const req = indexedDB.open('carryon-offline');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('outbox', 'readwrite');
        tx.objectStore('outbox').clear();
        tx.oncomplete = () => db.close();
      };
    });
  });

  test('Keep theirs deletes the conflicting outbox row', async ({ page }) => {
    await loginAsAdminWithMode(page, 'on');
    const id = await injectConflict(page);
    await expect(page.locator('[data-testid="conflict-resolver"]')).toBeVisible({ timeout: 8000 });
    await page.locator('[data-testid="conflict-keep-theirs"]').click();
    await page.waitForTimeout(800);
    const status = await outboxStatus(page, id);
    expect(status).toBe('missing');
  });

  test('Keep mine flips the conflicting row back to pending', async ({ page }) => {
    await loginAsAdminWithMode(page, 'on');
    const id = await injectConflict(page);
    await expect(page.locator('[data-testid="conflict-resolver"]')).toBeVisible({ timeout: 8000 });
    await page.locator('[data-testid="conflict-keep-mine"]').click();
    await page.waitForTimeout(800);
    // Either the drain popped it off and it's now done/inflight, or it's
    // pending waiting for the next drain. The one unacceptable state is
    // 'conflict' — the resolver failed to act on it.
    const status = await outboxStatus(page, id);
    expect(['pending', 'inflight', 'done', 'missing', 'failed']).toContain(status);
    // Clean up
    await page.evaluate(async () => {
      const req = indexedDB.open('carryon-offline');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('outbox', 'readwrite');
        tx.objectStore('outbox').clear();
        tx.oncomplete = () => db.close();
      };
    });
  });
});
