import { test, expect, type Page } from '@playwright/test';
import { login, openHighfieldModule, BASE_URL } from './helpers/auth';

const TEMP_CATEGORY_NAME = `E2E_TEMP_${Date.now()}`;

async function addAndRemoveCategory(page: Page, cardTitle: string): Promise<void> {
  // Find the Card whose title matches `cardTitle`
  const card = page.locator(
    `[class*="card"], [data-slot="card"]`
  ).filter({ hasText: new RegExp(cardTitle, 'i') }).first();

  // Fall back to locating by title text then walking up to a parent card-like ancestor.
  const titleEl = page.locator(`text=${cardTitle}`).first();
  await expect(titleEl).toBeVisible({ timeout: 10000 });

  // Use the nearest section that contains an Input + Add button
  const section = titleEl.locator(
    'xpath=ancestor::*[self::section or self::div][.//input and .//button][1]'
  );

  const input = section.locator('input[placeholder*="category"], input[placeholder*="Enter"]').first();
  await input.fill(TEMP_CATEGORY_NAME);

  const addBtn = section.locator('button:has-text("Add")').first();
  await addBtn.click();
  await page.waitForTimeout(1200);

  // Verify it shows up
  const chip = page.locator(`text=${TEMP_CATEGORY_NAME}`).first();
  await expect(chip).toBeVisible({ timeout: 5000 });

  // Now delete it — find the row and click the X / trash button next to the label.
  const row = page.locator(`div:has(> * > span:has-text("${TEMP_CATEGORY_NAME}"))`).first();
  const rowByText = page.locator(`xpath=//span[normalize-space()="${TEMP_CATEGORY_NAME}"]/ancestor::div[1]`).first();

  const removeBtn = rowByText
    .locator('button')
    .filter({ has: page.locator('svg') })
    .last();
  await removeBtn.click();
  await page.waitForTimeout(1200);

  // Confirm it was removed
  await expect(page.locator(`text=${TEMP_CATEGORY_NAME}`)).toHaveCount(0, { timeout: 5000 });
}

test.describe('Settings — Highfield Module', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await openHighfieldModule(page);
    await page.getByRole('tab', { name: 'Settings' }).first().click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
  });

  test('has 4 dealer-fit section cards', async ({ page }) => {
    const expectedCards = [
      'Associated Vendors',
      'Dealer Fit Categories',
      'Motor Dealer Fit Categories',
      'Trailer Dealer Fit Categories',
    ];

    for (const title of expectedCards) {
      const card = page.locator(`text=${title}`).first();
      await expect(card).toBeVisible({ timeout: 10000 });
    }
  });

  test('can add & remove a category on Dealer Fit Categories card', async ({ page }) => {
    await addAndRemoveCategory(page, 'Dealer Fit Categories');
  });

  test('can add & remove a category on Motor Dealer Fit Categories card', async ({ page }) => {
    await addAndRemoveCategory(page, 'Motor Dealer Fit Categories');
  });

  test('can add & remove a category on Trailer Dealer Fit Categories card', async ({ page }) => {
    await addAndRemoveCategory(page, 'Trailer Dealer Fit Categories');
  });

});

test.describe('Settings — Yamaha Module', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Yamaha settings show only Yamaha categories (not Highfield)', async ({ page }) => {
    // Navigate to Yamaha module
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    const yamahaCard = page
      .locator('a[href*="/modules/"]')
      .filter({ hasText: /yamaha/i })
      .first();
    if (!(await yamahaCard.isVisible().catch(() => false))) {
      console.log('Yamaha module not on dashboard — skipping');
      test.skip();
      return;
    }
    await yamahaCard.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Click Settings tab
    const settingsTab = page.getByRole('tab', { name: 'Settings' }).first();
    if (!(await settingsTab.isVisible().catch(() => false))) {
      console.log('Yamaha settings tab not visible — skipping');
      test.skip();
      return;
    }
    await settingsTab.click();
    await page.waitForTimeout(2000);

    // The Yamaha settings should NOT show Highfield-specific dealer fit cards
    // (Motor Dealer Fit / Trailer Dealer Fit are boat-scoped, not motor-scoped).
    const motorDealerFitOnYamaha = await page
      .locator('text=Motor Dealer Fit Categories')
      .count();
    const trailerDealerFitOnYamaha = await page
      .locator('text=Trailer Dealer Fit Categories')
      .count();

    // Those should not be present on Yamaha's own settings screen (they belong on the boat module).
    expect(motorDealerFitOnYamaha).toBe(0);
    expect(trailerDealerFitOnYamaha).toBe(0);
  });

});
