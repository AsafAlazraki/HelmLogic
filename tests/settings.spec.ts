import { test, expect, type Page } from '@playwright/test';
import { login, openHighfieldModule, BASE_URL } from './helpers/auth';
import { openTab, assertNoCrash, reloadAndAssert, waitForFirestoreSettle } from './helpers/utils';

/**
 * Each test creates a UNIQUE category name so multiple tests running in parallel
 * or retrying don't collide on the same Firestore document.
 */
const uniqueCategoryName = () => `E2E_TEMP_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

async function findCategorySection(page: Page, cardTitle: string) {
  const titleEl = page.locator(`text=${cardTitle}`).first();
  await expect(titleEl, `Settings card "${cardTitle}" should be visible`).toBeVisible({ timeout: 10000 });
  return titleEl.locator(
    'xpath=ancestor::*[self::section or self::div][.//input and .//button][1]'
  );
}

/**
 * Creates a category, VERIFIES IT PERSISTS ACROSS A PAGE RELOAD,
 * then deletes it and verifies deletion also persists. This is a proper
 * roundtrip test, not a visibility check.
 */
async function addReloadAndRemoveCategory(page: Page, cardTitle: string): Promise<void> {
  const name = uniqueCategoryName();

  // --- ADD ---
  const section = await findCategorySection(page, cardTitle);
  const input = section.locator('input[placeholder*="category" i], input[placeholder*="Enter" i]').first();
  await input.fill(name);
  await section.locator('button:has-text("Add")').first().click();
  await waitForFirestoreSettle(page);

  // Immediate visibility check
  await expect(page.locator(`text=${name}`).first()).toBeVisible({ timeout: 5000 });

  // --- RELOAD & VERIFY PERSISTED ---
  // This catches the class of bug where add-UI optimistically renders but
  // the Firestore write silently failed (exactly the kind of thing that hid
  // the Update Config bug for a sprint).
  await reloadAndAssert(page, async () => {
    // Must re-open Settings tab because refresh restores tab via URL
    const tabActive = page.getByRole('tab', { name: 'Settings' }).first();
    await expect(tabActive).toHaveAttribute('data-state', 'active', { timeout: 10000 });
    await expect(page.locator(`text=${name}`).first()).toBeVisible({ timeout: 10000 });
  });

  // --- REMOVE ---
  const rowByText = page.locator(`xpath=//span[normalize-space()="${name}"]/ancestor::div[1]`).first();
  const removeBtn = rowByText.locator('button').filter({ has: page.locator('svg') }).last();
  await removeBtn.click();
  await waitForFirestoreSettle(page);
  await expect(page.locator(`text=${name}`)).toHaveCount(0, { timeout: 5000 });

  // --- RELOAD & VERIFY DELETION PERSISTED ---
  await reloadAndAssert(page, async () => {
    await expect(page.locator(`text=${name}`)).toHaveCount(0, { timeout: 10000 });
  });
}

test.describe('Settings — Highfield Module', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await openHighfieldModule(page);
    await openTab(page, 'Settings');
    await assertNoCrash(page);
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
      await expect(card, `${title} card must be on Settings page`).toBeVisible({ timeout: 10000 });
    }
  });

  test('Dealer Fit Categories — add persists across reload', async ({ page }) => {
    await addReloadAndRemoveCategory(page, 'Dealer Fit Categories');
  });

  test('Motor Dealer Fit Categories — add persists across reload', async ({ page }) => {
    await addReloadAndRemoveCategory(page, 'Motor Dealer Fit Categories');
  });

  test('Trailer Dealer Fit Categories — add persists across reload', async ({ page }) => {
    await addReloadAndRemoveCategory(page, 'Trailer Dealer Fit Categories');
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
    // Yamaha module must exist in the test env — if not, that's a real regression
    // (dev seed data is expected to include Yamaha), so fail loudly.
    await expect(yamahaCard, 'Yamaha module card must exist on dashboard (dev seed)').toBeVisible({ timeout: 10000 });
    await yamahaCard.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await assertNoCrash(page);

    await openTab(page, 'Settings');

    // Yamaha (motor brand) settings must NOT show the boat-scoped dealer fit cards.
    // These belong on the BOAT module, not the motor module.
    const motorDealerFitOnYamaha = await page.locator('text=Motor Dealer Fit Categories').count();
    const trailerDealerFitOnYamaha = await page.locator('text=Trailer Dealer Fit Categories').count();

    expect(motorDealerFitOnYamaha, 'Motor DF Categories must NOT appear on Yamaha settings').toBe(0);
    expect(trailerDealerFitOnYamaha, 'Trailer DF Categories must NOT appear on Yamaha settings').toBe(0);
  });

});
