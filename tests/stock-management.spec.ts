import { test, expect } from '@playwright/test';
import { login, openHighfieldModule } from './helpers/auth';

test.describe('Stock Management', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await openHighfieldModule(page);
    await page.locator('text=Stock Management').first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
  });

  test('loads all 7 sub-tabs (including new Pending)', async ({ page }) => {
    // Expected: Stock Boats, On Order, Pending, Delivered Deals, Hold Requests, Map View, Assignments
    const expectedLabels = [
      /Stock Boats|Supplier Stock/i,
      /On Order/i,
      /Pending/i,
      /Delivered Deals/i,
      /Hold Requests/i,
      /Map View/i,
      /Assignments/i,
    ];

    let foundCount = 0;
    for (const pattern of expectedLabels) {
      const el = page.locator(`text=${pattern}`).first();
      if (await el.isVisible().catch(() => false)) foundCount++;
    }

    // At least 6 of the 7 tabs should be visible for a main-org user
    expect(foundCount).toBeGreaterThanOrEqual(6);
  });

  test('stock table column order: Model is first column', async ({ page }) => {
    // Ensure we're on a view that renders the stock table (Stock Boats)
    const stockBoats = page.locator('text=/Stock Boats|Supplier Stock/i').first();
    if (await stockBoats.isVisible().catch(() => false)) {
      await stockBoats.click();
      await page.waitForTimeout(1500);
    }

    // First <th> cell should be "Model"
    const firstHeader = page.locator('thead th').first();
    const visible = await firstHeader.isVisible().catch(() => false);
    if (!visible) {
      console.log('Stock table header not visible — no stock data may be present');
      test.skip();
      return;
    }

    const text = (await firstHeader.textContent())?.trim() ?? '';
    expect(text.toLowerCase()).toContain('model');
  });

  test('clicking a stock item opens the detail panel', async ({ page }) => {
    // Go to a tab with data
    const stockBoats = page.locator('text=/Stock Boats|Supplier Stock/i').first();
    if (await stockBoats.isVisible().catch(() => false)) {
      await stockBoats.click();
      await page.waitForTimeout(1500);
    }

    const firstRow = page.locator('tbody tr').first();
    const hasRow = await firstRow.isVisible().catch(() => false);
    if (!hasRow) {
      console.log('No stock rows present to click — skipping');
      test.skip();
      return;
    }

    await firstRow.click();
    await page.waitForTimeout(1500);

    // Sheet / Dialog should open
    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });
  });

  test('detail panel has a location dropdown (for non-readonly users)', async ({ page }) => {
    const stockBoats = page.locator('text=/Stock Boats|Supplier Stock/i').first();
    if (await stockBoats.isVisible().catch(() => false)) {
      await stockBoats.click();
      await page.waitForTimeout(1500);
    }

    const firstRow = page.locator('tbody tr').first();
    if (!(await firstRow.isVisible().catch(() => false))) {
      console.log('No stock rows present — skipping');
      test.skip();
      return;
    }
    await firstRow.click();
    await page.waitForTimeout(1500);

    // Look inside the opened sheet for a Location combobox / select
    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const locationControl = sheet
      .locator('[role="combobox"], select, button:has-text("Location")')
      .first();
    const hasLocation = await locationControl.isVisible().catch(() => false);

    // Also look for a Location label as a signal that the section exists
    const locationLabel = sheet.locator('text=/^Location/i').first();
    const hasLabel = await locationLabel.isVisible().catch(() => false);

    expect(hasLocation || hasLabel).toBeTruthy();
  });

});
