import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.34 evidence — the COMPLETE motor quote process, one clean screenshot
 * per stage (Asaf: "show me the motor quote process in screenshots").
 * Walks the richest path (repower + trade-in) since it exercises every
 * surface: entry button → 3-step wizard → created quote → detail sheet →
 * branded PDF.
 *
 * Output: tasks/test-evidence/v1.34/motor-quote-steps/
 */

const MOTOR_MODULE = 'KddayQaREA5tdZzzXjDW';
const SHOTS = 'tasks/test-evidence/v1.34/motor-quote-steps';
const CUSTOMER = 'Motor Quote Walkthrough';

test('walk the whole motor quote process', async ({ page }) => {
    test.setTimeout(420000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);

    // ── 0. Entry point: the motor module header button ──
    await page.goto(`${BASE_URL}/modules/${MOTOR_MODULE}?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    const entry = page.getByRole('button', { name: /New Motor Quote/i }).first();
    await entry.waitFor({ timeout: 40000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOTS}/00-entry-motor-module.png` });
    await entry.click();
    await page.waitForTimeout(4000);

    // ── 1. Step 1: Customer + quote type ──
    const body1 = await page.evaluate(() => document.body.innerText);
    expect(body1, '3-step wizard').toMatch(/Step 1 of 3/i);
    await page.locator('input[placeholder="John Smith"]').fill(CUSTOMER);
    await page.locator('input[placeholder*="04xx"]').fill('0400 123 456').catch(() => {});
    await page.locator('input[placeholder*="F150"]').first().fill('2016 Stacer 509 Sea Runner').catch(() => {});
    await page.getByRole('button', { name: /Repower/i }).first().click({ force: true });
    await page.waitForTimeout(600);
    await page.locator('input[placeholder*="900hrs"]').first().fill('2015 F115 approx 900hrs').catch(() => {});
    await page.locator('input[type="number"]').last().fill('4500').catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/01-step1-customer.png` });
    await page.getByRole('button', { name: /^Next/i }).click({ force: true });
    await page.waitForTimeout(3500);

    // ── 2. Step 2: Motor — search + package preview ──
    const search = page.locator('input[placeholder*="Search motors"]').first();
    await search.waitFor({ timeout: 30000 });
    await search.fill('F90');
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${SHOTS}/02-step2-motor-search.png` });

    // Add the F90XB as a one-click PACKAGE (motor + rigging + prop +
    // install + engine removal).
    const pkgBtn = page.getByRole('button', { name: /Package \$/ }).first();
    if (await pkgBtn.isVisible().catch(() => false)) await pkgBtn.click({ force: true });
    else await page.getByRole('button', { name: /^Add$/i }).first().click({ force: true });
    await page.waitForTimeout(1800);
    const step2 = await page.evaluate(() => document.body.innerText);
    expect(step2, 'package summary visible').toMatch(/On this quote/i);
    await page.screenshot({ path: `${SHOTS}/03-step2-package-added.png` });
    await page.getByRole('button', { name: /^Next/i }).click({ force: true });
    await page.waitForTimeout(1500);

    // ── 3. Step 3: Review ──
    const review = await page.evaluate(() => document.body.innerText);
    expect(review, 'motor review sections').toMatch(/Motor & package/i);
    expect(review, 'balance payable').toMatch(/Balance payable/i);
    await page.screenshot({ path: `${SHOTS}/04-step3-review.png` });
    await page.getByRole('button', { name: /Create quote/i }).click({ force: true });
    await page.waitForTimeout(5000);

    // ── 4. Created quote on the dashboard ──
    const dash = await page.evaluate(() => document.body.innerText);
    expect(dash, 'quote card on dashboard').toContain(CUSTOMER);
    await page.screenshot({ path: `${SHOTS}/05-created-on-dashboard.png` });

    // ── 5. Detail sheet ──
    await page.locator(`text=${CUSTOMER}`).first().click({ force: true });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${SHOTS}/06-detail-sheet.png` });

    // ── 6. The branded customer PDF ──
    const dlPromise = page.waitForEvent('download', { timeout: 120000 });
    await page.getByRole('button', { name: /Download/i }).first().click({ force: true });
    const dl = await dlPromise;
    await dl.saveAs(`${SHOTS}/07-motor-quote.pdf`);
    console.log('WALKTHROUGH COMPLETE');
});
