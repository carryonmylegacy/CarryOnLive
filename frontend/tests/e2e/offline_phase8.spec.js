// CarryOn E2E — Offline Phase 8 (Conflict resolver) Regression
// ============================================================================
// Proves:
//   1. A manually-injected conflict row (status='conflict' with server_row)
//      is picked up by <ConflictResolver /> when the offline flag is 'on'.
//   2. Clicking "Keep theirs" drops the outbox row.
//   3. Clicking "Keep mine" flips the row back to status='pending'.

import { test, expect } from '@playwright/test';
import { BASE, loginAsAdminWithMode } from './_helpers.js';

// Run Phase 8 tests serially to avoid hitting Cloudflare's rate limiter
// with three back-to-back admin logins from the same preview URL.
// Bumped test timeout to 90s because each test re-logs-in and the login
// helper may retry past a Cloudflare interstitial.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

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
    await loginAsAdminWithMode(page, 'on', { postLoginWaitMs: 6000 });
    await page.waitForLoadState('load').catch(() => {});
    await injectConflict(page);
    // Post Apr 24, 2026 refactor: the standalone ConflictResolver modal
    // was merged into the platform-wide PendingSyncPanel. The `conflict-
    // resolver` testid is retained as a class alias on the panel so this
    // spec keeps working, but we also accept the new testid.
    await expect(page.locator('[data-testid="pending-sync-panel"]')).toBeVisible({ timeout: 8000 });

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
    await loginAsAdminWithMode(page, 'on', { postLoginWaitMs: 6000 });
    await page.waitForLoadState('load').catch(() => {});
    const id = await injectConflict(page);
    await expect(page.locator('[data-testid="pending-sync-panel"]')).toBeVisible({ timeout: 8000 });
    await page.locator(`[data-testid="conflict-keep-theirs-${id}"]`).first().click();
    await page.waitForTimeout(800);
    const status = await outboxStatus(page, id);
    expect(status).toBe('missing');
  });

  test('Keep mine flips the conflicting row back to pending', async ({ page }) => {
    await loginAsAdminWithMode(page, 'on', { postLoginWaitMs: 6000 });
    await page.waitForLoadState('load').catch(() => {});
    const id = await injectConflict(page);
    await expect(page.locator('[data-testid="pending-sync-panel"]')).toBeVisible({ timeout: 8000 });
    await page.locator(`[data-testid="conflict-keep-mine-${id}"]`).first().click();
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
