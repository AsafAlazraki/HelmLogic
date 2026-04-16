import { test, expect } from '@playwright/test';
import { login, openHighfieldModule } from './helpers/auth';
import {
  waitForToast,
  reloadAndAssert,
  openTab,
  getUrlParam,
  openFirstModelEditor,
  waitForFirestoreSettle,
  assertNoCrash,
} from './helpers/utils';

/**
 * PERSISTENCE TESTS — the class of bug that hits hardest in production:
 * user does X, UI appears to succeed, but a reload wipes the change.
 *
 * Every test here performs:
 *   1. An action the user expects to persist
 *   2. A page.reload()
 *   3. An assertion that the action's effect is still present
 *
 * If any of these fail, do NOT ship. Silent save-drops are the worst UX
 * failure mode in this app and are exactly what broke Update Config
 * on the dev deploy in April 2026.
 */

test.describe('Persistence — actions survive refresh', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // --------------------------------------------------------------------------
  // Module-level state persistence
  // --------------------------------------------------------------------------

  test('all 5 module tabs persist across refresh', async ({ page }) => {
    await openHighfieldModule(page);
    const tabs: { label: string; urlValue: string | null }[] = [
      { label: 'Dashboard', urlValue: null }, // default — no URL param
      { label: 'Catalog', urlValue: 'catalog' },
      { label: 'Stock Management', urlValue: 'stock' },
      { label: 'Pricing', urlValue: 'pricing' },
      { label: 'Settings', urlValue: 'settings' },
    ];

    for (const { label, urlValue } of tabs) {
      await openTab(page, label);
      // Verify URL param matches expectation (Dashboard is the default and writes no param)
      const actual = getUrlParam(page, 'tab');
      expect(actual, `tab=${label} expected URL param ${urlValue}, got ${actual}`).toBe(urlValue);

      await reloadAndAssert(page, async () => {
        const tabLocator = page.getByRole('tab', { name: label }).first();
        await expect(tabLocator).toHaveAttribute('data-state', 'active', { timeout: 15000 });
      });
    }
  });

  test('catalog drill-down (range → model) persists across refresh', async ({ page }) => {
    await openHighfieldModule(page);
    const opened = await openFirstModelEditor(page);
    expect(opened).toBe(true);

    const view = getUrlParam(page, 'view');
    const range = getUrlParam(page, 'range');
    const model = getUrlParam(page, 'model');

    expect(view, 'view= should be bmt after opening a model').toBe('bmt');
    expect(range).toBeTruthy();
    expect(model).toBeTruthy();

    await reloadAndAssert(page, async () => {
      // Model editor's Update Config button should still be visible.
      const saveBtn = page.locator('button:has-text("Update Config"), button:has-text("Update Master")').first();
      await expect(saveBtn).toBeVisible({ timeout: 15000 });

      // URL params preserved
      expect(getUrlParam(page, 'view')).toBe('bmt');
      expect(getUrlParam(page, 'range')).toBe(range);
      expect(getUrlParam(page, 'model')).toBe(model);
    });
  });

  // --------------------------------------------------------------------------
  // Model editor save roundtrip
  // --------------------------------------------------------------------------

  test('model editor save roundtrip: edit → save → reload → value persisted', async ({ page }) => {
    await openHighfieldModule(page);
    const opened = await openFirstModelEditor(page);
    expect(opened).toBe(true);

    const nameInput = page.locator('input[placeholder*="model name" i]').first();
    const original = (await nameInput.inputValue()) || '';
    const marker = `-p-${Date.now().toString().slice(-5)}`;
    const newValue = `${original}${marker}`;

    await nameInput.fill(newValue);
    const save = page.locator('button:has-text("Update Config"), button:has-text("Update Master")').first();
    await save.click();

    await waitForToast(page, { text: /Updated/i, timeout: 15000 });
    await waitForFirestoreSettle(page);

    await reloadAndAssert(page, async () => {
      const afterInput = page.locator('input[placeholder*="model name" i]').first();
      await expect(afterInput).toHaveValue(newValue, { timeout: 15000 });
    });

    // Restore
    const restore = page.locator('input[placeholder*="model name" i]').first();
    await restore.fill(original);
    await page.locator('button:has-text("Update Config"), button:has-text("Update Master")').first().click();
    await waitForToast(page, { text: /Updated/i, timeout: 15000 });
  });

  // --------------------------------------------------------------------------
  // Dashboard / cross-page persistence
  // --------------------------------------------------------------------------

  test('refreshing inside a module never bounces the user back to /dashboard', async ({ page }) => {
    await openHighfieldModule(page);
    await openTab(page, 'Pricing');

    const urlBefore = page.url();
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await assertNoCrash(page);

    const urlAfter = page.url();
    const pathBefore = new URL(urlBefore).pathname;
    const pathAfter = new URL(urlAfter).pathname;

    // Path must match (we're still in the module, not at /dashboard)
    expect(pathAfter, `Refresh redirected from ${pathBefore} to ${pathAfter}`).toBe(pathBefore);
    expect(pathAfter).not.toBe('/dashboard');
    expect(pathAfter).not.toBe('/login');

    // Pricing tab is still the active one
    const pricingTab = page.getByRole('tab', { name: 'Pricing' }).first();
    await expect(pricingTab).toHaveAttribute('data-state', 'active', { timeout: 15000 });
  });

});
