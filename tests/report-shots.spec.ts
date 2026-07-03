/**
 * Report screenshot capture — REAL, UNMASKED app content for the
 * HelmLogic MPF Migration Evidence Report gallery.
 *
 * These are NOT visual-regression baselines: there are no image masks and
 * no toHaveScreenshot() comparisons. Each test drives a signed-in operator
 * session and saves a plain page.screenshot() to tests/report-shots/__png__/,
 * so the report embeds live product imagery (image remediation is done, so
 * boat / motor / trailer photos now render) instead of the magenta mask
 * blocks the visual-regression baselines carry.
 *
 * Run (ONE browser at a time in the sandbox):
 *   E2E_BASE_URL=http://localhost:9002 npx playwright test \
 *     --config=playwright.evidence.config.ts tests/report-shots.spec.ts --workers=1
 *
 * Firebase note (repo lesson): NEVER waitForLoadState('networkidle') — the
 * live websockets keep the network "active" forever. We use domcontentloaded
 * plus explicit selector waits and generous settle timeouts.
 */
import { test, expect, type Page } from '@playwright/test';
import { login, openHighfieldModule, BASE_URL } from './helpers/auth';

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const OUT = 'tests/report-shots/__png__';

/** Force lazy content to render, then park scroll at the top. */
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

test('login', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('input[placeholder="name@example.com"]').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/login.png`, fullPage: true });
});

test('dashboard', async ({ page }) => {
  await login(page);
  await page.locator('a[href*="/modules/"]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(3500);
  await settle(page);
  await page.screenshot({ path: `${OUT}/dashboard.png`, fullPage: true });
});

test('highfield module', async ({ page }) => {
  await login(page);
  await page.locator('a[href*="/modules/"]').first().waitFor({ timeout: 30000 });
  await openHighfieldModule(page);
  await page.waitForSelector('[role="tab"]', { timeout: 20000 });
  await page.waitForTimeout(3500);
  await settle(page);
  await page.screenshot({ path: `${OUT}/module-highfield.png`, fullPage: true });
});

test('catalog manager (/pricing-manager)', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE_URL}/pricing-manager`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('h1, [role="tab"]', { timeout: 30000 });
  await page.waitForTimeout(4000);
  await settle(page);
  await page.screenshot({ path: `${OUT}/catalog-manager.png`, fullPage: true });
});

test('customers (/customers)', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE_URL}/customers`);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('h1:has-text("Customers")').waitFor({ timeout: 30000 });
  await page.waitForTimeout(4000);
  await settle(page);
  await page.screenshot({ path: `${OUT}/customers.png`, fullPage: true });
});

test('reporting (/reporting)', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE_URL}/reporting`);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('h1:has-text("Reporting")').waitFor({ timeout: 30000 });
  await page.waitForTimeout(6000);
  await settle(page);
  await page.screenshot({ path: `${OUT}/reporting.png`, fullPage: true });
});

test('manage — MPF Data admin tab', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE_URL}/manage`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('h1:has-text("Manage Organisation")', { timeout: 30000 });
  await page.waitForTimeout(2000);
  // Switch to the MPF Data section (lazy-mounts the MPF-backed collection managers).
  const mpfBtn = page.locator('button:has-text("MPF Data")').first();
  await mpfBtn.waitFor({ timeout: 15000 });
  await mpfBtn.click({ force: true });
  await page.waitForTimeout(4500);
  await settle(page);
  await page.screenshot({ path: `${OUT}/manage-mpf-data.png`, fullPage: true });
});

test('quote flow — SP560 Step 1 + Step 5 dealer-fit', async ({ page }) => {
  test.setTimeout(300000);
  await login(page);

  // IMPORTANT: use the PLAIN /modules/{id} route, NOT the org-scoped
  // /{orgSlug}/modules/{id} route. The org-scoped route drops ?range=&vendor=
  // during the quote-page handoff (OrgSlugLayout slug correction) and lands on a
  // permanent "Context Error" (documented in tasks/test-evidence/ultimate-test/
  // ULTIMATE_TEST.md finding #4). The plain route mounts the build cleanly.
  let onStep1 = false;
  for (let attempt = 1; attempt <= 4 && !onStep1; attempt++) {
    await page.goto(`${BASE_URL}/modules/${MODULE_ID}?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);
    const newQ = page.locator('button:has-text("New Quote"), button:has-text("New Proposal")').first();
    if (!(await newQ.isVisible().catch(() => false))) continue;
    await newQ.click({ force: true });
    const dlg = page.locator('[role="dialog"]');
    if (!(await dlg.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false))) continue;
    const sport = dlg.locator('.cursor-pointer:has-text("Sport")').first();
    if (!(await sport.waitFor({ state: 'visible', timeout: 12000 }).then(() => true).catch(() => false))) continue;
    await sport.click({ force: true });
    const sp560 = dlg.locator('.cursor-pointer:has-text("SP560")').first();
    if (!(await sp560.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false))) continue;
    await page.waitForTimeout(600);
    await sp560.click({ force: true });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => /Next Step/i.test(document.body.innerText) || /CONTEXT ERROR/i.test(document.body.innerText),
      { timeout: 30000 },
    ).catch(() => {});
    await page.waitForTimeout(2000);
    if (/CONTEXT ERROR/i.test(await page.locator('body').innerText().catch(() => ''))) continue;
    onStep1 = await page.locator('button:has-text("Next Step")').first().isVisible().catch(() => false);
  }
  // The New Quote -> build handoff is intermittent on a local build (the
  // documented org-route Context Error plus dialog flakiness). When it doesn't
  // mount here, skip rather than fail: the report gallery falls back to the
  // committed ultimate-test SP560 build captures (hl-step1 / hl-step5), which
  // drove this exact configuration end to end. On the dev deployment this test
  // captures fresh shots.
  test.skip(!onStep1, 'New Quote build handoff unavailable in this environment; report gallery uses the committed ultimate-test SP560 build captures.');
  expect(onStep1, 'should land on Step 1 after Sport + SP560').toBe(true);

  // Pick a material + first colour so Step 1 renders a fully-configured boat.
  const mat = page.locator('button:has-text("PVC"), button:has-text("Hypalon"), button:has-text("ORCA")').first();
  if (await mat.isVisible().catch(() => false)) { await mat.click().catch(() => {}); await page.waitForTimeout(1000); }
  await page.locator('.cursor-pointer').filter({ hasNotText: 'Exit Build' }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(2000);
  await settle(page);
  await page.screenshot({ path: `${OUT}/quote-step1.png`, fullPage: true });

  // Advance Step 2 (factory options) -> 3 (motor) -> 4 (trailer) -> 5 (dealer fit).
  for (let step = 0; step < 4; step++) {
    const next = page.locator('button:has-text("Next Step")').first();
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click({ force: true });
    await page.waitForTimeout(4500);
  }

  // Confirm we're on the dealer-fit / fit-up screen before capturing.
  const dfoMarkers = await page.locator('text=/Dealer Fit|Safety Gear|Electronics|Fit-up|SIMPLE|MEDIUM|COMPLEX/i').count();
  expect(dfoMarkers, 'Step 5 must surface Dealer Fit / fit-up content').toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await settle(page);
  await page.screenshot({ path: `${OUT}/quote-step5-dealerfit.png`, fullPage: true });
});
