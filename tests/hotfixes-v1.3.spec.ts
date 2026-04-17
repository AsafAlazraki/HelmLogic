import { test, expect } from '@playwright/test';
import { login, openHighfieldModule, BASE_URL } from './helpers/auth';
import {
  waitForToast,
  assertNoCrash,
  reloadAndAssert,
  openTab,
  getUrlParam,
  openFirstModelEditor,
  waitForFirestoreSettle,
} from './helpers/utils';

/**
 * HOTFIX REGRESSION TESTS — v1.3 eve-of-release fixes (2026-04-16).
 *
 * These tests exist specifically because the previous Playwright suite did
 * NOT catch the following production bugs:
 *
 *   1. "Update Config" did nothing (RHF swallowed validation errors silently)
 *   2. Page refresh sent the user back to dashboard (tab/view not in URL)
 *   3. "Replace" button on cover image didn't fire (label/input binding broken)
 *
 * Every test below fails if the bug is reintroduced. NO test.skip() bailouts.
 */

test.describe('v1.3 Hotfixes — Regression Suite', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // --------------------------------------------------------------------------
  // HOTFIX 1: Update Config save can never be blocked by validation.
  // --------------------------------------------------------------------------

  test('HF-1a: Update Config produces a success toast on save', async ({ page }) => {
    await openHighfieldModule(page);
    const opened = await openFirstModelEditor(page);
    expect(opened, 'Catalog/range/model must load — dev env has no models?').toBe(true);

    // Trigger a save by clicking Update Config without modifying anything.
    // Even a no-op save should succeed (validation cannot block).
    const saveBtn = page.locator('button:has-text("Update Config"), button:has-text("Update Master")').first();
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
    await expect(saveBtn).toBeEnabled();

    await saveBtn.click();

    // MUST show a success toast — never the "Save blocked" or "Persistence Error" toasts.
    const toast = await waitForToast(page, {
      text: /Master Configuration Updated|Organisation Configuration Updated|Item Updated/i,
      timeout: 15000,
    });
    expect(await toast.textContent()).toMatch(
      /Master Configuration Updated|Organisation Configuration Updated|Item Updated/i
    );

    // The "Save blocked" toast from the regression would appear instead.
    const blockedToast = page.locator('text=/Save blocked|Persistence Error/i').first();
    const wasBlocked = await blockedToast.isVisible({ timeout: 500 }).catch(() => false);
    expect(wasBlocked, 'Save was blocked by validation — the v1.3 fix has regressed').toBe(false);
  });

  test('HF-1b: Update Config persists a trivial field change across reload', async ({ page }) => {
    await openHighfieldModule(page);
    const opened = await openFirstModelEditor(page);
    expect(opened).toBe(true);

    // Find the "Series Display Name" input (model name). Modify it, save, reload, verify.
    // This exercises the full save-roundtrip + Firestore snapshot restore.
    const nameInput = page.locator('input[placeholder*="model name" i], input[placeholder*="Enter model name" i]').first();
    const hasInput = await nameInput.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasInput) {
      // If no editable name field is visible the model editor UX changed — fail loudly.
      throw new Error('Series Display Name input not found — model editor UX changed, update selector');
    }

    const originalValue = (await nameInput.inputValue()) || '';
    const testMarker = `-qa-${Date.now().toString().slice(-5)}`;
    const newValue = `${originalValue}${testMarker}`;

    await nameInput.fill(newValue);
    const saveBtn = page.locator('button:has-text("Update Config"), button:has-text("Update Master")').first();
    await saveBtn.click();

    await waitForToast(page, { text: /Updated/i, timeout: 15000 });
    await waitForFirestoreSettle(page);

    // Reload and assert the new value is still there.
    await reloadAndAssert(page, async () => {
      const nameInputAfter = page.locator('input[placeholder*="model name" i], input[placeholder*="Enter model name" i]').first();
      await expect(nameInputAfter).toHaveValue(newValue, { timeout: 15000 });
    });

    // Clean up: restore original name.
    const cleanupInput = page.locator('input[placeholder*="model name" i], input[placeholder*="Enter model name" i]').first();
    await cleanupInput.fill(originalValue);
    const saveBtn2 = page.locator('button:has-text("Update Config"), button:has-text("Update Master")').first();
    await saveBtn2.click();
    await waitForToast(page, { text: /Updated/i, timeout: 15000 });
  });

  // --------------------------------------------------------------------------
  // HOTFIX 2: Refresh restores the active tab / view / selected model.
  // --------------------------------------------------------------------------

  test('HF-2a: Stock tab survives a refresh (tab + URL persist)', async ({ page }) => {
    await openHighfieldModule(page);
    await openTab(page, 'Stock Management');

    // URL should now include ?tab=stock
    await expect.poll(
      () => getUrlParam(page, 'tab'),
      { timeout: 5000, message: 'activeTab should sync to URL' }
    ).toBe('stock');

    // Refresh and assert we're still on Stock (not back at Dashboard).
    await reloadAndAssert(page, async () => {
      const stockTab = page.getByRole('tab', { name: 'Stock Management' }).first();
      await expect(stockTab).toHaveAttribute('data-state', 'active', { timeout: 10000 });
    });
  });

  test('HF-2b: Pricing tab survives a refresh', async ({ page }) => {
    await openHighfieldModule(page);
    await openTab(page, 'Pricing');

    await expect.poll(() => getUrlParam(page, 'tab'), { timeout: 5000 }).toBe('pricing');

    await reloadAndAssert(page, async () => {
      const pricingTab = page.getByRole('tab', { name: 'Pricing' }).first();
      await expect(pricingTab).toHaveAttribute('data-state', 'active', { timeout: 10000 });
    });
  });

  test('HF-2c: Settings tab survives a refresh', async ({ page }) => {
    await openHighfieldModule(page);
    await openTab(page, 'Settings');

    await expect.poll(() => getUrlParam(page, 'tab'), { timeout: 5000 }).toBe('settings');

    await reloadAndAssert(page, async () => {
      const settingsTab = page.getByRole('tab', { name: 'Settings' }).first();
      await expect(settingsTab).toHaveAttribute('data-state', 'active', { timeout: 10000 });
    });
  });

  test('HF-2d: Opened model editor survives a refresh (range + model persisted)', async ({ page }) => {
    await openHighfieldModule(page);
    const opened = await openFirstModelEditor(page);
    expect(opened).toBe(true);

    // Both ?range= and ?model= should be in the URL now.
    const rangeParam = getUrlParam(page, 'range');
    const modelParam = getUrlParam(page, 'model');
    expect(rangeParam, 'range must be in URL after opening model editor').toBeTruthy();
    expect(modelParam, 'model must be in URL after opening model editor').toBeTruthy();

    // Refresh. We should land back in the model editor, not at the ranges grid.
    await reloadAndAssert(page, async () => {
      const saveBtn = page.locator('button:has-text("Update Config"), button:has-text("Update Master")').first();
      await expect(saveBtn).toBeVisible({ timeout: 15000 });
    });

    // URL params should still be set.
    expect(getUrlParam(page, 'range')).toBe(rangeParam);
    expect(getUrlParam(page, 'model')).toBe(modelParam);
  });

  test('HF-2e: Stock sub-view (On Order / Pending) survives a refresh', async ({ page }) => {
    await openHighfieldModule(page);
    await openTab(page, 'Stock Management');
    await page.waitForTimeout(2000);

    // Try clicking "On Order" sub-tab if present.
    const onOrder = page.locator('button:has-text("On Order")').first();
    const hasOnOrder = await onOrder.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasOnOrder) {
      throw new Error('On Order sub-tab not visible — stock workspace UX changed');
    }
    await onOrder.click();
    await page.waitForTimeout(1000);

    await expect.poll(() => getUrlParam(page, 'stockView'), { timeout: 5000 }).toBe('onorder');

    await reloadAndAssert(page, async () => {
      expect(getUrlParam(page, 'stockView')).toBe('onorder');
      await assertNoCrash(page);
    });
  });

  // --------------------------------------------------------------------------
  // HOTFIX 3: Replace cover image button fires the file picker.
  // --------------------------------------------------------------------------

  test('HF-3: Replace cover image button triggers file picker', async ({ page }) => {
    await openHighfieldModule(page);
    const opened = await openFirstModelEditor(page);
    expect(opened).toBe(true);

    // Scroll to the cover image section.
    const replaceBtn = page.locator('button:has-text("Replace")').first();
    await replaceBtn.scrollIntoViewIfNeeded().catch(() => {});
    await expect(replaceBtn).toBeVisible({ timeout: 10000 });

    // Clicking the Replace button MUST open a native file chooser.
    // Playwright exposes this via page.waitForEvent('filechooser').
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
    await replaceBtn.click();
    const fileChooser = await fileChooserPromise;
    expect(fileChooser, 'Replace button must open a file chooser — regression if this throws').toBeTruthy();
  });

});
