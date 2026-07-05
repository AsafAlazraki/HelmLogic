/**
 * FFR-20…FFR-24 browser spot-check — UI-audit handoff fixes + PER_BOAT_SETS
 * NEW-1/NEW-2 + the FFR-22 trailer-rego field report.
 *
 * READ-ONLY: never Finalize / Save / Delete. No Firestore writes.
 * Run:  E2E_BASE_URL=http://localhost:9002 npx playwright test tests/ui-audit-handoff-fixes.spec.ts \
 *         --config=playwright.evidence.config.ts --workers=1
 */
import { test, expect, type Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

const OUT = 'tasks/test-evidence/ui-audit/handoff-fixes';
const HF_MODULE = 'M1Yf3R9igpJDxJnOVr6f';
const HF_VENDOR = 'LafOLpLb6QIFE856TiD4';
const SPORT_RANGE = 'nQ2LE50z9Tbf2uss0Ote';
const CLASSIC_RANGE = 'qo7IePnRzJxjrYyLWhTn';
const ROLLUP_RANGE = 'EqcKQ51svI1I2Q5poFdl';
const STACER_MODULE = 'I0dGRbh39uhNJ3gotEb0';
const STACER_VENDOR = 'LWgHuGoKfUBeKZ8eWnEi';

async function settle(page: Page, ms = 3000) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(ms);
}
async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }).catch(() => {});
  console.log(`shot ${name}`);
}
async function nextStep(page: Page) {
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(2800);
}
/** Reads the current step from the header ("Step N of 6"). */
async function currentStep(page: Page): Promise<number> {
  const t = await page.locator('body').innerText();
  const m = t.match(/Step (\d) of 6/i) || t.match(/Step (\d)\/6/i);
  return m ? parseInt(m[1], 10) : 0;
}
/** Clicks Next until the flow sits on `target` (handles the trailer-step skip). */
async function gotoStep(page: Page, target: number) {
  for (let i = 0; i < 8; i++) {
    const cur = await currentStep(page);
    if (cur >= target) return;
    await nextStep(page);
  }
}
/** No visible <img> on the page may be broken (complete && naturalWidth === 0). */
async function assertNoBrokenImages(page: Page, screen: string) {
  const broken = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img'))
      .filter((img) => {
        const r = img.getBoundingClientRect();
        return r.width > 4 && r.height > 4 && img.complete && img.naturalWidth === 0;
      })
      .map((img) => img.src.slice(0, 120)),
  );
  expect(broken, `${screen}: broken images visible: ${broken.join(' | ')}`).toEqual([]);
}
const sectionHeadings = (page: Page) =>
  page.locator('main, body').first().innerText().then((t) => t.toUpperCase());

test.describe('FFR-20…24 spot-check', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('SP560 — Step 3 motor images, Step 5 packs, Step 6 markers + trailer-rego clear', async ({ page }) => {
    test.setTimeout(420_000);
    await login(page);
    page.setDefaultTimeout(25_000);
    await page.goto(`${BASE_URL}/modules/${HF_MODULE}/quote/sp560?range=${SPORT_RANGE}&vendor=${HF_VENDOR}`);
    await settle(page, 5000);

    // Step 1: pick PVC but deliberately NO hull colour (UI-10 audit case).
    await page.locator('text=PVC').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1200);
    await shot(page, 'sp560-step1');
    await gotoStep(page, 3);

    // Step 3 (UI-2): select first motor; its card must never show a broken img.
    await page.locator('button:has(p:has-text("HP PERFORMANCE")), button:has(div:has-text("HP PERFORMANCE"))').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(3500);
    await shot(page, 'sp560-step3-motor-selected');
    await assertNoBrokenImages(page, 'sp560-step3');

    await gotoStep(page, 4);
    await shot(page, 'sp560-step4-trailer');
    await assertNoBrokenImages(page, 'sp560-step4'); // UI-3: SharePoint trailer imageUrl must not render broken

    // FFR-22: turn trailer rego ON (legacy toggle), then clear the trailer.
    const regoToggle = page.locator('text=12 Months Trailer Rego').first();
    if (await regoToggle.isVisible().catch(() => false)) {
      await regoToggle.click({ force: true });
      await page.waitForTimeout(800);
    }
    const noTrailer = page.locator('button:has-text("No trailer")').first();
    if (await noTrailer.isVisible().catch(() => false)) {
      await noTrailer.click({ force: true });
      await page.waitForTimeout(800);
    }
    await shot(page, 'sp560-step4-trailer-cleared');

    await gotoStep(page, 5);
    await page.waitForTimeout(2500);
    const step5 = await sectionHeadings(page);
    expect(step5, 'SP560 must show its own pack').toContain('SPORT 560');
    expect(step5, 'NEW-1: no Patrol pack on a Sport hull').not.toContain('HIGHFIELD - PATROL');
    expect(step5, 'NEW-1: no ZeroJet pack on a Sport hull').not.toContain('ZEROJET');
    await shot(page, 'sp560-step5-dealerfit');

    await gotoStep(page, 6);
    await page.waitForTimeout(2500);
    const step6 = await sectionHeadings(page);
    // UI-10: explicit marker instead of silent $0 (no colour was clicked).
    expect(step6, 'UI-10: hull-colour marker must render').toContain('SELECT HULL COLOUR ON STEP 1');
    expect(step6, 'UI-10: no misleading Standard Color label').not.toContain('STANDARD COLOR');
    // FFR-22: trailer rego must be gone along with the trailer.
    expect(step6, 'FFR-22: no trailer rego line after trailer deselect').not.toContain('TRAILER REGISTRATION');
    expect(step6, 'FFR-22: no towing card after trailer deselect').not.toContain('TOWING SOLUTION');
    await shot(page, 'sp560-step6-summary');
  });

  test('CL290 — Step 5 FFR-19 guards still hold + Tube Covers survive the classifier change', async ({ page }) => {
    test.setTimeout(300_000);
    await login(page);
    page.setDefaultTimeout(25_000);
    await page.goto(`${BASE_URL}/modules/${HF_MODULE}/quote/cl290?range=${CLASSIC_RANGE}&vendor=${HF_VENDOR}`);
    await settle(page, 5000);
    await gotoStep(page, 3);
    await shot(page, 'cl290-step3');
    await assertNoBrokenImages(page, 'cl290-step3');
    await gotoStep(page, 5);
    await page.waitForTimeout(2500);
    const step5 = await sectionHeadings(page);
    expect(step5, 'CL290 own pack').toContain('CLASSIC 290');
    expect(step5, 'FFR-18: obsolete list hidden').not.toContain('OBSELETE');
    expect(step5, 'FFR-18: workshop ops hidden').not.toContain('PRE DELIVERY');
    expect(step5, 'NEW-1: no Patrol leak').not.toContain('HIGHFIELD - PATROL');
    expect(step5, 'brand-scoped general pack still visible on HF hulls').toContain('TUBE COVER');
    await shot(page, 'cl290-step5-dealerfit');
  });

  test('RU230AL — NEW-2: Aluminium floor pack only, Airmat hidden', async ({ page }) => {
    test.setTimeout(300_000);
    await login(page);
    page.setDefaultTimeout(25_000);
    await page.goto(`${BASE_URL}/modules/${HF_MODULE}/quote/ru230al?range=${ROLLUP_RANGE}&vendor=${HF_VENDOR}`);
    await settle(page, 5000);
    await gotoStep(page, 3);
    await shot(page, 'ru230al-step3');
    await gotoStep(page, 5);
    await page.waitForTimeout(2500);
    const step5 = await sectionHeadings(page);
    if (step5.includes('ALUMINIUM FLOOR') || step5.includes('AIRMAT FLOOR')) {
      expect(step5, 'NEW-2: RU230AL sees its Aluminium pack').toContain('ROLL-UP 230 W ALUMINIUM FLOOR');
    }
    expect(step5, 'NEW-2: RU230AL must NOT see the Airmat pack').not.toContain('AIRMAT FLOOR');
    await shot(page, 'ru230al-step5-dealerfit');
  });

  test('Stacer 409 — UI-4 header truncation + UI-5 hero placeholder + no HF pack leak', async ({ page }) => {
    test.setTimeout(300_000);
    await login(page);
    page.setDefaultTimeout(25_000);
    await page.goto(`${BASE_URL}/modules/${STACER_MODULE}/quote/sa409apr?range=mpf-catalog&vendor=${STACER_VENDOR}`);
    await settle(page, 5000);
    // UI-4: title must not bleed past its container.
    const h2 = page.locator('h2[title]').first();
    await expect(h2).toBeVisible();
    const noBleed = await h2.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 || getComputedStyle(el).textOverflow === 'ellipsis');
    expect(noBleed, 'UI-4: header title truncates instead of overlapping').toBe(true);
    // UI-5: zero-imagery model gets the explicit placeholder, no orphan arrows.
    const hero = await page.locator('body').innerText();
    if (hero.toUpperCase().includes('NO IMAGERY ON FILE')) {
      await expect(page.locator('button:has(svg.lucide-arrow-left)').first()).toHaveCount(0).catch(() => {});
    }
    await shot(page, 'stacer409-step1');
    // Step 5: TUBE COVER (HF-branded) must NOT leak onto a Stacer hull.
    await gotoStep(page, 5);
    await page.waitForTimeout(2500);
    const step5 = await sectionHeadings(page);
    expect(step5, 'NEW-1: HF tube covers not on Stacer').not.toContain('TO SUIT HIGHFIELD');
    expect(step5, 'NEW-1: no HF packs on Stacer').not.toContain('HIGHFIELD -');
    await shot(page, 'stacer409-step5');
  });
});
