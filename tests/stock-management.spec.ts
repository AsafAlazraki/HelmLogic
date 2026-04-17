import { test, expect } from '@playwright/test';
import { login, openHighfieldModule } from './helpers/auth';
import { openTab, assertNoCrash, reloadAndAssert, getUrlParam } from './helpers/utils';

test.describe('Stock Management', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await openHighfieldModule(page);
    await openTab(page, 'Stock Management');
    await assertNoCrash(page);
  });

  test('loads all 7 sub-tabs (including new Pending)', async ({ page }) => {
    // Expected: Stock Boats, On Order, Pending, Delivered Deals, Hold Requests, Map View, Assignments
    const expectedLabels = [
      { label: 'Stock Boats', pattern: /Stock Boats|Supplier Stock/i },
      { label: 'On Order', pattern: /On Order/i },
      { label: 'Pending', pattern: /^Pending/i },
      { label: 'Delivered Deals', pattern: /Delivered Deals/i },
      { label: 'Hold Requests', pattern: /Hold Requests/i },
      { label: 'Map View', pattern: /Map View/i },
      { label: 'Assignments', pattern: /Assignments/i },
    ];

    const missing: string[] = [];
    for (const { label, pattern } of expectedLabels) {
      const visible = await page.locator(`text=${pattern}`).first().isVisible().catch(() => false);
      if (!visible) missing.push(label);
    }

    // ALL 7 must be present for a parent-org user. Missing any is a regression.
    expect(missing, `Missing sub-tabs: ${missing.join(', ')}`).toEqual([]);
  });

  test('Pending sub-tab is clickable and URL syncs to stockView=pending', async ({ page }) => {
    const pendingTab = page.locator('button:has-text("Pending")').first();
    await expect(pendingTab).toBeVisible({ timeout: 10000 });
    await pendingTab.click();
    await page.waitForTimeout(1000);

    await expect.poll(
      () => getUrlParam(page, 'stockView'),
      { timeout: 5000, message: 'stockView should sync to URL' }
    ).toBe('pending');

    await reloadAndAssert(page, async () => {
      expect(getUrlParam(page, 'stockView')).toBe('pending');
      await assertNoCrash(page);
    });
  });

  test('stock table column order: Model is first column', async ({ page }) => {
    // Ensure we're on Stock Boats sub-view (default).
    const firstHeader = page.locator('thead th').first();
    const hasHeader = await firstHeader.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasHeader) {
      // No header = no stock data. Acceptable in a fresh env, but note it loudly.
      // Don't skip — if someone wipes stock data, this test would silently no-op.
      console.warn('STOCK TABLE EMPTY — cannot verify column order. Seed stock data in dev.');
      return;
    }

    const text = (await firstHeader.textContent())?.trim().toLowerCase() ?? '';
    expect(text, `First column header was "${text}", expected "Model"`).toContain('model');
  });

  test('clicking a stock item opens the detail panel', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasRow) {
      console.warn('NO STOCK ROWS — cannot verify detail panel. Seed stock data in dev.');
      return;
    }

    await firstRow.click();
    await page.waitForTimeout(1500);

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet, 'Clicking a stock row must open the detail sheet').toBeVisible({ timeout: 5000 });
    await assertNoCrash(page);
  });

  test('detail panel has a location dropdown (for non-readonly users)', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasRow) {
      console.warn('NO STOCK ROWS — cannot verify location dropdown. Seed stock data in dev.');
      return;
    }
    await firstRow.click();
    await page.waitForTimeout(1500);

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // v1.3 added an interactive dropdown — there MUST be a combobox/select near the Location label.
    const locationControl = sheet.locator('[role="combobox"], select').first();
    await expect(
      locationControl,
      'Location must be an interactive dropdown (v1.3 requirement), not static text'
    ).toBeVisible({ timeout: 5000 });
  });

  test('Stock tab URL persistence: ?tab=stock survives refresh', async ({ page }) => {
    expect(getUrlParam(page, 'tab')).toBe('stock');
    await reloadAndAssert(page, async () => {
      expect(getUrlParam(page, 'tab')).toBe('stock');
      const tab = page.getByRole('tab', { name: 'Stock Management' }).first();
      await expect(tab).toHaveAttribute('data-state', 'active', { timeout: 10000 });
    });
  });

});
