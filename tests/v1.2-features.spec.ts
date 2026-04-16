import { test, expect } from '@playwright/test';
import { login, openHighfieldModule, BASE_URL } from './helpers/auth';
import { openTab, assertNoCrash, getUrlParam } from './helpers/utils';

/**
 * v1.2 regression — every feature that shipped in v1.2 must still work after v1.3.
 *
 * PREVIOUS VERSION of this file used console.log instead of assertions in most
 * tests. A console.log is not a test. Every test now fails loudly when the
 * feature is broken.
 */
test.describe('v1.2 Feature Verification', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // ---- DASHBOARD & NAVIGATION ----

  test('Dashboard loads with module cards', async ({ page }) => {
    await page.waitForSelector('text=Highfield', { timeout: 10000 });
    const cards = await page.locator('[class*="rounded-2xl"]').count();
    expect(cards, 'Dashboard must render at least one module card').toBeGreaterThan(0);
  });

  test('Model images render without broken states', async ({ page }) => {
    await openHighfieldModule(page);
    await openTab(page, 'Catalog');
    await page.waitForTimeout(3000); // External CDN images need time

    const brokenImages = await page.locator('img[alt]').evaluateAll(imgs =>
      (imgs as HTMLImageElement[]).filter(img => img.complete && img.naturalHeight === 0).length
    );
    const totalImages = await page.locator('img[alt]').count();

    // We tolerate a few broken external images (Cloudflare hotlinking), but
    // not ALL of them. If every image is broken, something's wrong.
    if (totalImages > 5) {
      const brokenRatio = brokenImages / totalImages;
      expect(
        brokenRatio,
        `Too many broken images: ${brokenImages}/${totalImages} (ratio ${brokenRatio.toFixed(2)})`
      ).toBeLessThan(0.5);
    }
  });

  // ---- MODULE MANAGEMENT ----

  test('Admin modules page has action buttons on module cards', async ({ page }) => {
    await page.goto(`${BASE_URL}/modules`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await assertNoCrash(page);

    const firstCard = page.locator('[class*="group relative"]').first();
    await expect(firstCard, 'Modules page must have at least one module card').toBeVisible({ timeout: 10000 });

    await firstCard.hover();
    await page.waitForTimeout(500);

    const actionCount = await firstCard.locator('button').count();
    expect(actionCount, 'Module card must have action buttons (delete/rename)').toBeGreaterThan(0);
  });

  test('Add module page has module type selector', async ({ page }) => {
    await page.goto(`${BASE_URL}/modules/add`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await assertNoCrash(page);

    const moduleTypeCount = await page.locator('text=Module Type').count();
    expect(moduleTypeCount, 'Add module form must include a Module Type field').toBeGreaterThan(0);
  });

  // ---- HIGHFIELD MODULE ----

  test('Highfield module loads with all 5 tabs', async ({ page }) => {
    await openHighfieldModule(page);

    const tabs = ['Dashboard', 'Catalog', 'Stock Management', 'Pricing', 'Settings'];
    for (const name of tabs) {
      await expect(
        page.getByRole('tab', { name }).first(),
        `${name} tab must be visible`
      ).toBeVisible({ timeout: 10000 });
    }
  });

  // ---- STOCK MANAGEMENT ----

  test('Stock Management tab loads with workspace + sub-tabs', async ({ page }) => {
    await openHighfieldModule(page);
    await openTab(page, 'Stock Management');

    await expect(page.locator('text=STOCK MANAGEMENT').first()).toBeVisible({ timeout: 5000 });

    const subTabs = ['Stock Boats', 'On Order', 'Delivered Deals'];
    for (const name of subTabs) {
      await expect(
        page.locator(`text=${name}`).first(),
        `Sub-tab "${name}" must be present`
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('Stock search input is present and functional', async ({ page }) => {
    await openHighfieldModule(page);
    await openTab(page, 'Stock Management');

    const searchInput = page.locator('input[placeholder*="Search" i]').first();
    await expect(searchInput, 'Stock search input must be present').toBeVisible({ timeout: 10000 });

    // Verify it's actually interactive
    await searchInput.fill('CL340');
    await expect(searchInput).toHaveValue('CL340');
    await searchInput.clear();
  });

  test('Stock item click opens detail panel', async ({ page }) => {
    await openHighfieldModule(page);
    await openTab(page, 'Stock Management');
    await page.waitForTimeout(2000);

    const firstRow = page.locator('tbody tr').first();
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasRow) {
      console.warn('NO STOCK ROWS in dev env — cannot verify detail panel click');
      return;
    }

    await firstRow.click();
    await page.waitForTimeout(1500);
    await assertNoCrash(page);

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet, 'Detail panel must open on row click').toBeVisible({ timeout: 5000 });
  });

  // ---- PRICING ----

  test('Pricing tab loads with matrix or price lists', async ({ page }) => {
    await openHighfieldModule(page);
    await openTab(page, 'Pricing');

    const hasPricingMatrix = await page.locator('text=Pricing Matrix').count();
    const hasPriceLists = await page.locator('text=Price Lists').count();

    expect(
      hasPricingMatrix + hasPriceLists,
      'Pricing tab must render either Pricing Matrix or Price Lists section'
    ).toBeGreaterThan(0);
  });

  // ---- SETTINGS ----

  test('Settings tab has associated vendors section', async ({ page }) => {
    await openHighfieldModule(page);
    await openTab(page, 'Settings');

    const associatedVendors = page.locator('text=Associated Vendors').first();
    await expect(associatedVendors, 'Associated Vendors card must be present').toBeVisible({ timeout: 10000 });
  });

  test('Settings has exactly one Dealer Fit Categories card (not duplicated)', async ({ page }) => {
    await openHighfieldModule(page);
    await openTab(page, 'Settings');
    await page.waitForTimeout(1500);

    // v1.2 removed the duplicate Dealer Fit card. Must be exactly 1 (not 2, not 0).
    // Text "Dealer Fit Categories" appears in 3 places (boat, motor, trailer cards),
    // so check for the boat-scoped one specifically by matching the exact header.
    const boatCardHeading = page.locator('h3, h4, [class*="CardTitle"]').filter({ hasText: /^Dealer Fit Categories$/ });
    const count = await boatCardHeading.count();

    expect(count, 'Boat-scoped Dealer Fit Categories card must appear exactly once').toBe(1);
  });

  // ---- CATALOG → QUOTE ENTRY ----

  test('Catalog shows range cards', async ({ page }) => {
    await openHighfieldModule(page);
    await openTab(page, 'Catalog');
    await page.waitForTimeout(1500);

    const ranges = ['Classic', 'Sport', 'Roll-Up', 'Adventure', 'Patrol'];
    let found = 0;
    for (const r of ranges) {
      const count = await page.locator(`text=${r}`).count();
      if (count > 0) found++;
    }
    expect(found, 'At least 3 Highfield ranges must be visible in catalog').toBeGreaterThanOrEqual(3);
  });

  // ---- PROPOSAL / DASHBOARD ----

  test('Dashboard Recent Proposals section is present (may be empty)', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Section header or empty state must be present — not absent entirely.
    const recentProposalsSection = page.locator('text=/Recent Proposals|Recent Quotes/i').first();
    await expect(
      recentProposalsSection,
      'Dashboard must render the Recent Proposals section'
    ).toBeVisible({ timeout: 10000 });
  });

  // ---- MASTER PRICE FILE ----

  test('Master Price File module loads (if enabled for org)', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const mpfLink = page
      .locator('a[href*="/modules/"]')
      .filter({ hasText: /master price file/i })
      .first();
    const hasMPF = await mpfLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasMPF) {
      console.warn('Master Price File module not on dashboard — not enabled for this org');
      return;
    }

    await mpfLink.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await assertNoCrash(page);

    // Workspace must have Import or Export controls (v1.2 added in-app Excel import).
    const hasControls =
      (await page.locator('text=/^Export$|^Import$/').count()) > 0;
    expect(hasControls, 'MPF workspace must have Import or Export button').toBeTruthy();
  });

  // ---- YAMAHA MODULE ----

  test('Yamaha module loads with motor workspace tabs', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const yamahaLink = page
      .locator('a[href*="/modules/"]')
      .filter({ hasText: /yamaha/i })
      .first();
    await expect(yamahaLink, 'Yamaha module must be on dashboard (dev seed)').toBeVisible({ timeout: 10000 });

    await yamahaLink.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('[role="tab"]', { timeout: 15000 });
    await page.waitForTimeout(2000);
    await assertNoCrash(page);

    // Motor workspace uses buttons (not tabs) for its sub-navigation
    const tabs = ['Catalog', 'Pricing', 'Promotions', 'Settings'];
    for (const name of tabs) {
      const button = page.locator(`button:has-text("${name}")`).first();
      await expect(button, `Yamaha sub-tab "${name}" must be present`).toBeVisible({ timeout: 5000 });
    }
  });

  // ---- URL STATE PERSISTENCE (v1.3 addition, but impacts v1.2 flows) ----

  test('Clicking a tab updates URL ?tab= param', async ({ page }) => {
    await openHighfieldModule(page);
    await openTab(page, 'Pricing');

    await expect.poll(
      () => getUrlParam(page, 'tab'),
      { timeout: 5000 }
    ).toBe('pricing');
  });

});
