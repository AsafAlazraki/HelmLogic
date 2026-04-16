import { test, expect, type Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import { openTab, assertNoCrash, reloadAndAssert, getUrlParam } from './helpers/utils';

async function openYamahaCatalog(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  const yamahaCard = page
    .locator('a[href*="/modules/"]')
    .filter({ hasText: /yamaha/i })
    .first();
  // Yamaha module is expected in the dev seed. Missing = regression, fail loud.
  await expect(yamahaCard, 'Yamaha module must be on dashboard (dev seed expectation)').toBeVisible({ timeout: 10000 });

  await yamahaCard.click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[role="tab"]', { timeout: 15000 });
  await page.waitForTimeout(2000);
  await assertNoCrash(page);

  // Catalog is the default Yamaha tab but we click explicitly to assert tab activation.
  await openTab(page, 'Catalog');
  await page.waitForTimeout(1500);
}

test.describe('Yamaha Motors', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await openYamahaCatalog(page);
  });

  test('catalog loads with motor cards', async ({ page }) => {
    // Motor cards display an HP value
    const hpBadge = page.locator('text=/\\d+\\s?HP/i').first();
    await expect(hpBadge, 'At least one motor card with HP badge must render').toBeVisible({ timeout: 10000 });

    // Multiple cards expected
    const cards = page.locator('[class*="card"], [class*="rounded-2xl"]');
    const count = await cards.count();
    expect(count, 'Yamaha catalog must show multiple motor cards').toBeGreaterThan(1);
  });

  test('motor card titles show engine model names, not Firestore IDs', async ({ page }) => {
    await page.waitForTimeout(2000);

    const allTitles = await page
      .locator('h1, h2, h3, h4, [class*="CardTitle"], [class*="font-black"]')
      .allTextContents();

    // Firestore IDs are 18–22 char alphanumeric with no spaces.
    const firestoreIdPattern = /^[A-Za-z0-9]{18,22}$/;
    const rawIdTitles = allTitles.filter((t) => firestoreIdPattern.test(t.trim()));

    expect(
      rawIdTitles,
      `Motor cards showing raw Firestore IDs: ${rawIdTitles.join(', ')} (MODEL field missing from data)`
    ).toEqual([]);
  });

  test('multi-engine HP badges show "N × M HP" format', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Multi-engine motors render "2 × 300 HP" / "3 × 250 HP". Accept × or x.
    const multiEngineBadge = page.locator('text=/\\d+\\s*[×x]\\s*\\d+\\s*HP/i').first();
    const hasMulti = await multiEngineBadge.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasMulti) {
      // Twin-engine motor may not exist in test seed. Warn but don't fail.
      console.warn('No multi-engine motors in dev Yamaha catalog — cannot verify "N × M HP" format');
      return;
    }

    const text = (await multiEngineBadge.textContent()) ?? '';
    expect(text, `Expected "N × M HP" format, got "${text}"`).toMatch(/[×x]/);
    // v1.3 regression: confirm the HP value is the per-engine HP, not the engine count.
    // Badge must contain a 3-digit HP number (Yamaha range is F25-F450, so 25-450).
    expect(text).toMatch(/[×x]\s*\d{2,3}/);
  });

  test('clicking a motor card opens the detail sheet', async ({ page }) => {
    const firstCard = page.locator('[class*="card"], [class*="rounded-2xl"]').filter({ hasText: /HP/i }).first();
    await expect(firstCard, 'At least one motor card must be clickable').toBeVisible({ timeout: 10000 });

    await firstCard.click();
    await page.waitForTimeout(1500);
    await assertNoCrash(page);

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet, 'Motor detail sheet must open').toBeVisible({ timeout: 8000 });
  });

  test('detail sheet has a dealer fit options section', async ({ page }) => {
    const firstCard = page.locator('[class*="card"], [class*="rounded-2xl"]').filter({ hasText: /HP/i }).first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();
    await page.waitForTimeout(2000);

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 8000 });

    const dealerFit = sheet.locator('text=/Dealer Fit|Rigging|Propeller/i').first();
    await expect(
      dealerFit,
      'Motor detail sheet must have a Dealer Fit section (v1.2 requirement)'
    ).toBeVisible({ timeout: 5000 });
  });

  test('Yamaha motorTab URL persistence: Pricing tab survives refresh', async ({ page }) => {
    // Click Pricing (motor workspace tab, not the boat workspace tab).
    const pricingTab = page.locator('button:has-text("Pricing")').first();
    await expect(pricingTab).toBeVisible({ timeout: 10000 });
    await pricingTab.click();
    await page.waitForTimeout(1500);

    await expect.poll(
      () => getUrlParam(page, 'motorTab'),
      { timeout: 5000, message: 'motorTab should sync to URL' }
    ).toBe('pricing');

    await reloadAndAssert(page, async () => {
      expect(getUrlParam(page, 'motorTab')).toBe('pricing');
      await assertNoCrash(page);
    });
  });

});
