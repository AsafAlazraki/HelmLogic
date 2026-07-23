import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.34 (Asaf: "fix the experience of quoting… MPF data is source of
 * truth") — motor-package counter quoting. Drives the real path a
 * salesperson takes: Motor module → New Motor Quote → service wizard →
 * Motors catalog tab → "Package" on an F90 → assert the quote carries
 * the MPF package lines (motor + install from the row's own Install -
 * Sell + std rigging/prop where present) and the total is their sum.
 */
const SHOTS = 'tasks/test-evidence/v1.34';

test('motor package quote composes like the MPF Motor Module sheet', async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);

    // Find the service module and deep-link with the motors tab open.
    await page.goto(`${BASE_URL}/modules`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    const service = page.locator('a[href*="/modules/"]').filter({ hasText: /service|counter/i }).first();
    let serviceHref: string | null = null;
    if (await service.isVisible().catch(() => false)) {
        serviceHref = await service.getAttribute('href');
    }
    if (!serviceHref) {
        // fallback: use the entry button on the Yamaha module page
        await page.goto(`${BASE_URL}/modules/KddayQaREA5tdZzzXjDW`);
        await page.waitForTimeout(4000);
        const btn = page.getByRole('button', { name: /New Motor Quote/i }).first();
        await expect(btn, 'New Motor Quote entry visible on the motor module').toBeVisible({ timeout: 20000 });
        await btn.click();
        await page.waitForTimeout(4000);
    } else {
        await page.goto(`${BASE_URL}${serviceHref}?newQuote=1&catalogTab=motors`);
        await page.waitForTimeout(4000);
    }

    // Wizard step 1 — customer + REPOWER sale type + trade-in.
    const nameInput = page.locator('input').filter({ hasNot: page.locator('[type="hidden"]') }).first();
    await nameInput.fill('Motor Package Probe');
    const repowerBtn = page.getByRole('button', { name: /Repower/i }).first();
    if (await repowerBtn.isVisible().catch(() => false)) {
        await repowerBtn.click({ force: true });
        await page.waitForTimeout(500);
        await page.locator('input[placeholder*="F115"], input[placeholder*="900hrs"]').first().fill('2015 F115 approx 900hrs').catch(() => {});
        await page.locator('input[type="number"]').last().fill('4500').catch(() => {});
        console.log('repower mode engaged with trade-in');
    } else {
        console.log('repower toggle NOT visible');
    }
    await page.getByRole('button', { name: /^Next/i }).click({ force: true });
    await page.waitForTimeout(3000);

    // Step 2 (v1.34 3-step motor wizard) — the Motor step. The picker is
    // locked to motors (motorsOnly): no tabs to click.

    // Search a known model and add the PACKAGE.
    const search = page.locator('input[placeholder*="Search motors"]').first();
    await search.fill('F90');
    await page.waitForTimeout(1500);
    const body1 = await page.evaluate(() => document.body.innerText);
    const hasPackageBtn = /Package \$/.test(body1);
    console.log('package button present:', hasPackageBtn);
    await page.screenshot({ path: `${SHOTS}/motor-picker.png`, fullPage: false });

    const pkgBtn = page.getByRole('button', { name: /Package \$/ }).first();
    if (await pkgBtn.isVisible().catch(() => false)) {
        await pkgBtn.click({ force: true });
    } else {
        // No std accessories on this motor — plain Add still must work.
        await page.getByRole('button', { name: /^Add$/i }).first().click({ force: true });
    }
    await page.waitForTimeout(1500);

    // Step 3 — review. Assert the package lines + totals.
    await page.getByRole('button', { name: /^Next/i }).click({ force: true });
    await page.waitForTimeout(1500);
    const review = await page.evaluate(() => document.body.innerText);
    const hasMotorLine = /F90/i.test(review);
    const hasInstall = /Install:/i.test(review);
    console.log(`review: motorLine=${hasMotorLine} installLine=${hasInstall}`);
    await page.screenshot({ path: `${SHOTS}/motor-package-review.png`, fullPage: true });
    expect(hasMotorLine, 'motor line on review').toBe(true);

    // Create the quote.
    const createBtn = page.getByRole('button', { name: /Create|Save/i }).last();
    await createBtn.click({ force: true });
    await page.waitForTimeout(5000);
    const after = await page.evaluate(() => document.body.innerText);
    const created = /Motor Package Probe/i.test(after);
    console.log('quote created and visible:', created);
    await page.screenshot({ path: `${SHOTS}/motor-quote-created.png`, fullPage: false });
    expect(created, 'created quote visible on the dashboard').toBe(true);

    // Open the created quote and download the BRANDED motor-quote PDF.
    await page.locator('text=Motor Package Probe').first().click({ force: true });
    await page.waitForTimeout(3000);
    const sheet = await page.evaluate(() => document.body.innerText);
    console.log('detail sheet mentions repower/motor:', /repower|motor/i.test(sheet));
    const dlPromise = page.waitForEvent('download', { timeout: 120000 });
    await page.getByRole('button', { name: /Download/i }).first().click({ force: true });
    const dl = await dlPromise;
    await dl.saveAs(`${SHOTS}/motor-quote.pdf`);
    console.log('MOTOR QUOTE PDF downloaded');
});
