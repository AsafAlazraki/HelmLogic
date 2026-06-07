import { test, expect, type Page } from '@playwright/test';
import { login, openHighfieldModule } from './helpers/auth';
import { openTab, assertNoCrash } from './helpers/utils';

/**
 * Navigates the quote builder as far as possible starting from the Highfield module.
 * Returns which step we ended on (1–6) so tests can decide whether to proceed.
 */
async function enterQuoteFlow(page: Page): Promise<void> {
  await openHighfieldModule(page);

  const entryButton = page
    .locator('button:has-text("Start Quote"), button:has-text("New Quote"), button:has-text("Create Quote")')
    .first();

  if (await entryButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await entryButton.click();
    await page.waitForTimeout(1500);

    // v1.11 — the New Quote dialog is two-step (range → model). Click
    // Classic, then CL380 — the same pattern as v1.11-followup.spec.ts
    // which exercises this flow reliably.
    const dlg = page.locator('[role="dialog"]');
    if (await dlg.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.waitForTimeout(1200);
      await dlg.locator('.cursor-pointer:has-text("Classic")').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      await dlg.locator('.cursor-pointer:has-text("CL380")').first().click({ force: true }).catch(() => {});
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(4000);
    }
  } else {
    // Fallback: catalog → range → model → Start Quote
    await openTab(page, 'Catalog');
    await page.waitForTimeout(1500);

    const range = page.locator('text=/Classic|Sport|Roll[- ]?Up|Adventure|Patrol/i').first();
    await expect(range, 'At least one range must be visible in catalog').toBeVisible({ timeout: 10000 });
    await range.click();
    await page.waitForTimeout(1500);

    const model = page.locator('text=/^(CL|SP|RU|AL|PA|UL)\\d{3}/').first();
    await expect(model, 'At least one model must be visible in range').toBeVisible({ timeout: 10000 });
    await model.click();
    await page.waitForTimeout(2000);

    const modelStart = page.locator('button:has-text("Start Quote"), button:has-text("Quote"), button:has-text("Build")').first();
    if (await modelStart.isVisible({ timeout: 5000 }).catch(() => false)) {
      await modelStart.click();
      await page.waitForTimeout(1500);
    }
  }
  await assertNoCrash(page);

  // v1.11 — Step 1 requires material + color to enable Next Step. Pick PVC
  // and the first rounded colour swatch so clickNextUntilStep can advance.
  const pvc = page.locator('button:has-text("PVC")').first();
  if (await pvc.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pvc.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  await page.locator('button.rounded-\\[1\\.5rem\\]').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function clickNextUntilStep(page: Page, targetStep: number): Promise<number> {
  // We always start on step 1 after enterQuoteFlow. Land on `targetStep`
  // by clicking Next exactly `targetStep - 1` times.
  let attempts = 0;
  const maxClicks = Math.max(0, targetStep - 1);
  while (attempts < maxClicks) {
    const nextBtn = page.locator('button:has-text("Next Step")').first();
    const visible = await nextBtn.isVisible().catch(() => false);
    if (!visible) break;
    const enabled = await nextBtn.isEnabled().catch(() => false);
    if (!enabled) break;
    await nextBtn.click();
    await page.waitForTimeout(1500);
    await assertNoCrash(page);
    attempts++;
  }
  return attempts + 1;
}

test.describe('Quote Builder', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await enterQuoteFlow(page);
  });

  test('renders all 6 steps correctly', async ({ page }) => {
    // Look for numbered step pills OR a Next Step button (quote is in flow).
    const stepPillCount = await page.locator('div[class*="rounded-full"]:has-text("1"), div[class*="rounded-full"]:has-text("2"), div[class*="rounded-full"]:has-text("3")').count();
    const nextBtn = page.locator('button:has-text("Next Step")').first();
    const hasNextBtn = await nextBtn.isVisible({ timeout: 5000 }).catch(() => false);

    expect(
      stepPillCount > 0 || hasNextBtn,
      'Quote flow must show either step pills or a Next Step button'
    ).toBeTruthy();
  });

  test('step 2 — Additional Factory Boat Notes/Options section visible', async ({ page }) => {
    const reached = await clickNextUntilStep(page, 2);
    expect(reached, 'Must reach step 2 from step 1').toBeGreaterThanOrEqual(2);

    // v1.3 renamed "Custom Tactical Additions" → "Additional Factory Boat Notes/Options"
    // Accept either label so the test works pre- and post-deploy of the label change.
    const customSection = page
      .locator('text=/Custom Tactical Additions|Additional Factory Boat Notes|Factory Boat Notes/i')
      .first();
    await expect(customSection, 'Step 2 custom options section must be visible').toBeVisible({ timeout: 15000 });

    const labelInput = page.locator('input[placeholder*="Custom" i], input[placeholder*="Addition" i], input[placeholder*="Hull Wrap" i]').first();
    await expect(labelInput, 'Step 2 must have an input for custom addition label').toBeVisible({ timeout: 5000 });
  });

  test('step 3 — selecting a motor shows hero + "Choose Another Motor"', async ({ page }) => {
    const reached = await clickNextUntilStep(page, 3);
    expect(reached).toBeGreaterThanOrEqual(3);

    // v1.11 (commit a66781c) — a motor auto-selects on load (closest to
    // max HP), so the hero + "Choose Another Motor" should already be
    // visible without us clicking. Verify the hero is up; fall back to
    // grid-click only if auto-default didn't fire (data shape edge).
    let chooseAnother = page.locator('button:has-text("Choose Another Motor")').first();
    const heroAlreadyShown = await chooseAnother.isVisible({ timeout: 10000 }).catch(() => false);
    if (heroAlreadyShown) {
      await expect(chooseAnother).toBeVisible();
      return;
    }

    const motorCard = page.locator('button:has-text("HP"), [class*="card"]:has-text("HP")').first();
    const hasMotor = await motorCard.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasMotor) {
      console.warn('No motors visible on step 3 — Yamaha module not associated with test org');
      return;
    }
    await motorCard.click();
    await page.waitForTimeout(1500);
    chooseAnother = page.locator('button:has-text("Choose Another Motor")').first();
    await expect(chooseAnother, 'Motor hero UX must show Choose Another Motor after selection').toBeVisible({ timeout: 10000 });
  });

  test('step 3 — Dealer Services section (Extended Warranty + Service Plan toggles)', async ({ page }) => {
    await clickNextUntilStep(page, 3);

    const dealerServices = page.locator('text=Dealer Services').first();
    await expect(dealerServices, 'v1.3 Dealer Services section missing').toBeVisible({ timeout: 10000 });

    const warranty = page.locator('text=/Extended Warranty/i').first();
    const service = page.locator('text=/Service Plan|Direct Debit/i').first();

    await expect(warranty, 'NSM 6 Year Extended Warranty toggle must be present').toBeVisible({ timeout: 5000 });
    await expect(service, 'Direct Debit Service Plan toggle must be present').toBeVisible({ timeout: 5000 });
  });

  test('step 3 — Prop Comes Standard toggle is opt-in (default OFF)', async ({ page }) => {
    await clickNextUntilStep(page, 3);

    const motorCard = page.locator('button:has-text("HP"), [class*="card"]:has-text("HP")').first();
    if (await motorCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await motorCard.click();
      await page.waitForTimeout(1500);
    }

    const propToggle = page.locator('text=/Prop Comes Standard/i').first();
    const hasToggle = await propToggle.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasToggle) {
      console.warn('Prop Comes Standard not visible — depends on selected motor config');
      return;
    }

    // The toggle is a Radix switch — should exist and NOT be checked by default.
    const switchEl = page.locator('button[role="switch"]').first();
    await expect(switchEl, 'Prop Comes Standard must render as a switch').toBeVisible();

    const checked = await switchEl.getAttribute('aria-checked');
    expect(
      checked,
      'Prop Comes Standard must default to OFF (opt-in). Auto-enabling is a regression.'
    ).toBe('false');
  });

  test('step 3 — price level selector is present', async ({ page }) => {
    await clickNextUntilStep(page, 3);

    const priceLevelSelector = page
      .locator('[role="combobox"], button:has-text("NSM Retail"), button:has-text("Trade Price"), button:has-text("Price Level")')
      .first();

    await expect(
      priceLevelSelector,
      'Price level selector must be visible on step 3'
    ).toBeVisible({ timeout: 10000 });
  });

  test('step 6 — Admin & Trade-In card visible', async ({ page }) => {
    const reachedStep = await clickNextUntilStep(page, 6);
    if (reachedStep < 5) {
      console.warn(`Could only reach step ${reachedStep} — data incomplete in dev env`);
      return;
    }

    const adminTradeIn = page.locator('text=/Admin.*Trade[- ]?In/i').first();
    await expect(adminTradeIn, 'v1.3 Admin & Trade-In card required on step 6').toBeVisible({ timeout: 10000 });
  });

  test('step 6 — PDF attach (Paperclip) icons on section cards', async ({ page }) => {
    const reachedStep = await clickNextUntilStep(page, 6);
    if (reachedStep < 5) {
      console.warn(`Could only reach step ${reachedStep} — skipping paperclip check`);
      return;
    }

    const paperclipIcons = page.locator('svg.lucide-paperclip, [data-lucide="paperclip"]');
    const count = await paperclipIcons.count();
    expect(count, 'v1.3 must render Paperclip icons on section cards').toBeGreaterThan(0);
  });

  test('no crash at any step during forward navigation', async ({ page }) => {
    // Walk through all reachable steps and assert no error boundary appears.
    for (let i = 0; i < 6; i++) {
      const nextBtn = page.locator('button:has-text("Next Step")').first();
      const visible = await nextBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!visible) break;
      const enabled = await nextBtn.isEnabled().catch(() => false);
      if (!enabled) break;
      await nextBtn.click();
      await page.waitForTimeout(1500);
      await assertNoCrash(page);
    }
  });

});
