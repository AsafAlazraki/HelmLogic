/**
 * Visual-regression suite — core HelmLogic screens.
 *
 * Baselines: tests/visual/__screenshots__/ (see tests/visual/README.md).
 * Run:       npm run test:visual
 * Update:    npm run test:visual:update
 *
 * Design notes:
 *  - Each test uses the standard `page` fixture (NOT a shared beforeAll
 *    page) so it inherits the proxy + launch options from the config —
 *    without them Firebase auth can't reach identitytoolkit in the
 *    sandbox. login() per test; workers=1 keeps runs deterministic.
 *  - NEVER waitForLoadState('networkidle') — Firebase websockets keep the
 *    network "active" forever (repo lesson). We use domcontentloaded +
 *    explicit selector waits + fixed settle timeouts instead.
 *  - Dynamic regions (CDN images, timestamps, live counts, charts, data
 *    feeds) are MASKED rather than asserted — the suite is meant to catch
 *    layout/chrome regressions, not data drift. This app renders live
 *    Firestore data, so anything data-shaped gets a mask.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { login, openHighfieldModule, BASE_URL } from '../helpers/auth';

test.use({ viewport: { width: 1440, height: 900 } });

const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';

/**
 * Masks shared by every screen:
 *  - every <img> (external CDN images — Cloudflare/Incapsula-hosted boat,
 *    motor and trailer photography loads non-deterministically through the
 *    sandbox proxy)
 *  - relative timestamps ("3 minutes ago") and clock times
 *  - date strings (activity feeds, quote cards, audit rows)
 */
function baseMasks(p: Page): Locator[] {
  return [
    p.locator('img'),
    p.getByText(/\b\d+\s*(?:second|minute|hour|day|week|month|year)s?\s+ago\b/i),
    p.getByText(/\b(?:[01]?\d|2[0-3]):[0-5]\d\s*(?:am|pm)?\b/i),
    p.getByText(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/),
    p.getByText(/\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i),
  ];
}

/**
 * Force lazy content to render, then park scroll at the top so full-page
 * shots are deterministic.
 */
async function settle(p: Page): Promise<void> {
  await p.evaluate(async () => {
    const el = document.scrollingElement || document.documentElement;
    for (let y = 0; y <= el.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(1200);
}

test('login page', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('domcontentloaded');
  // Explicit wait for the form — never networkidle (Firebase websockets).
  await page.locator('input[placeholder="name@example.com"]').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2000);
  await expect(page).toHaveScreenshot('login.png', {
    fullPage: true,
    mask: baseMasks(page),
  });
});

test('dashboard (post-login)', async ({ page }) => {
  await login(page);
  // Module cards signal the dashboard's Firestore data has arrived.
  await page.locator('a[href*="/modules/"]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(3000);
  await settle(page);
  await expect(page).toHaveScreenshot('dashboard.png', {
    fullPage: true,
    mask: [
      ...baseMasks(page),
      // Live quote/activity numbers on dashboard stat surfaces.
      page.locator('[class*="recharts"]'),
    ],
  });
});

test('highfield module page', async ({ page }) => {
  await login(page);
  await page.locator('a[href*="/modules/"]').first().waitFor({ timeout: 30000 });
  await openHighfieldModule(page);
  await page.waitForSelector('[role="tab"]', { timeout: 20000 });
  await page.waitForTimeout(3000);
  await settle(page);
  await expect(page).toHaveScreenshot('module-highfield.png', {
    fullPage: true,
    mask: [
      ...baseMasks(page),
      // Module dashboard lists live quotes — mask the data cards, keep chrome.
      page.locator('[class*="recharts"]'),
    ],
  });
});

test('quote flow — CL380 step 1', async ({ page }) => {
  test.setTimeout(300000);
  await login(page);
  const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
  const orgSlug = m ? m[1] : 'northside-marine';

  // Same New Quote dialog pattern as tests/bm-email-checklist.spec.ts —
  // dialog open is intermittent, so retry up to 3 times.
  let onStep1 = false;
  for (let attempt = 1; attempt <= 3 && !onStep1; attempt++) {
    await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
    const newQ = page.locator('button:has-text("New Quote"), button:has-text("New Proposal")').first();
    if (!(await newQ.isVisible().catch(() => false))) continue;
    await newQ.click({ force: true });
    const dlg = page.locator('[role="dialog"]');
    if (!(await dlg.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false))) continue;
    await page.waitForTimeout(1500);
    await dlg.locator('.cursor-pointer:has-text("Classic")').first().click({ force: true });
    await page.waitForTimeout(1800);
    await dlg.locator('.cursor-pointer:has-text("CL380")').first().click({ force: true });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);
    onStep1 = await page.locator('button:has-text("Next Step")').first().isVisible().catch(() => false);
  }
  expect(onStep1, 'should land on Step 1 after Classic + CL380').toBe(true);
  await page.waitForTimeout(3000);

  // The build view is a fixed inset-0 overlay — viewport shot, not fullPage.
  await expect(page).toHaveScreenshot('quote-step1.png', {
    mask: [
      ...baseMasks(page),
      // Carousel render area — CDN photography + rotating slides.
      page.locator('.group:has(img)').first(),
    ],
  });

  // Element shot of the stable build-header chrome (model + stepper + Exit).
  const header = page.locator('div.sticky.top-0').filter({ hasText: 'Exit Build' }).first();
  await expect(header).toBeVisible();
  await expect(header).toHaveScreenshot('quote-header.png');
});

test('catalog manager (/pricing-manager)', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE_URL}/pricing-manager`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('h1, [role="tab"]', { timeout: 30000 });
  await page.waitForTimeout(4000);
  await settle(page);
  await expect(page).toHaveScreenshot('catalog-manager.png', {
    fullPage: true,
    mask: baseMasks(page),
  });
});

test('customers (/customers)', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE_URL}/customers`);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('h1:has-text("Customers")').waitFor({ timeout: 30000 });
  await page.waitForTimeout(4000);
  await settle(page);
  await expect(page).toHaveScreenshot('customers.png', {
    fullPage: true,
    mask: [
      ...baseMasks(page),
      // Customer rows are live Firestore data — mask the table body, keep
      // page chrome (heading, filters, column headers) asserted.
      page.locator('tbody'),
    ],
  });
});

test('reporting (/reporting)', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE_URL}/reporting`);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('h1:has-text("Reporting")').waitFor({ timeout: 30000 });
  await page.waitForTimeout(6000);
  await settle(page);
  await expect(page).toHaveScreenshot('reporting.png', {
    fullPage: true,
    mask: [
      ...baseMasks(page),
      // Charts + KPI tiles + activity feed all render live quote data.
      page.locator('[class*="recharts"]'),
      page.locator('svg.recharts-surface'),
      page.getByText(/\$[\d,]+/),
    ],
  });
});
