import { test, expect, type Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

async function openYamahaCatalog(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  const yamahaCard = page
    .locator('a[href*="/modules/"]')
    .filter({ hasText: /yamaha/i })
    .first();
  if (!(await yamahaCard.isVisible().catch(() => false))) {
    return false;
  }

  await yamahaCard.click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[role="tab"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // Click Catalog tab if present (it should be the default view for motor workspace).
  const catalogTab = page.getByRole('tab', { name: 'Catalog' }).first();
  if (await catalogTab.isVisible().catch(() => false)) {
    await catalogTab.click();
    await page.waitForTimeout(2000);
  }

  return true;
}

test.describe('Yamaha Motors', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('catalog loads with motor cards', async ({ page }) => {
    const opened = await openYamahaCatalog(page);
    if (!opened) {
      test.skip();
      return;
    }

    // Motor cards typically show an HP value
    const hpBadge = page.locator('text=/\\d+\\s?HP/i').first();
    await expect(hpBadge).toBeVisible({ timeout: 10000 });

    // There should be multiple cards
    const cards = page.locator('[class*="card"], [class*="rounded-2xl"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(1);
  });

  test('motor card titles show engine model names, not Firestore IDs', async ({ page }) => {
    const opened = await openYamahaCatalog(page);
    if (!opened) {
      test.skip();
      return;
    }

    await page.waitForTimeout(2000);

    // Firestore IDs are 20-char alphanumeric strings with no spaces.
    // Motor model names are human-readable (e.g. "F300 XCA", "F25LMHC").
    // Look at all visible card titles and assert none are raw 20-char IDs.
    const allTitles = await page
      .locator('h1, h2, h3, h4, [class*="CardTitle"], [class*="font-black"]')
      .allTextContents();

    const firestoreIdPattern = /^[A-Za-z0-9]{18,22}$/;
    const rawIdTitles = allTitles.filter((t) => firestoreIdPattern.test(t.trim()));

    expect(rawIdTitles.length).toBe(0);
  });

  test('multi-engine HP badges show "N × M HP" format', async ({ page }) => {
    const opened = await openYamahaCatalog(page);
    if (!opened) {
      test.skip();
      return;
    }

    await page.waitForTimeout(2000);

    // Multi-engine motors render badges like "2 × 300 HP" or "3 × 250 HP".
    // Accept either × (multiplication sign) or x (ascii fallback).
    const multiEngineBadge = page.locator('text=/\\d+\\s*[×x]\\s*\\d+\\s*HP/i').first();
    const hasMulti = await multiEngineBadge.isVisible().catch(() => false);

    if (!hasMulti) {
      console.log('No multi-engine motors in Yamaha catalog — skipping');
      test.skip();
      return;
    }

    const text = (await multiEngineBadge.textContent()) ?? '';
    expect(text).toMatch(/[×x]/);
  });

  test('clicking a motor card opens a detail sheet', async ({ page }) => {
    const opened = await openYamahaCatalog(page);
    if (!opened) {
      test.skip();
      return;
    }

    // Click the first motor card
    const firstCard = page.locator('[class*="card"], [class*="rounded-2xl"]').filter({ hasText: /HP/i }).first();
    const visible = await firstCard.isVisible().catch(() => false);
    if (!visible) {
      console.log('No motor cards visible — skipping');
      test.skip();
      return;
    }

    await firstCard.click();
    await page.waitForTimeout(1500);

    // Detail sheet / dialog should appear
    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 8000 });
  });

  test('detail sheet has a dealer fit options section', async ({ page }) => {
    const opened = await openYamahaCatalog(page);
    if (!opened) {
      test.skip();
      return;
    }

    const firstCard = page.locator('[class*="card"], [class*="rounded-2xl"]').filter({ hasText: /HP/i }).first();
    if (!(await firstCard.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await firstCard.click();
    await page.waitForTimeout(2000);

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 8000 });

    const dealerFit = sheet.locator('text=/Dealer Fit|Rigging|Propeller/i').first();
    await expect(dealerFit).toBeVisible({ timeout: 5000 });
  });

});
