import { test } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.34 UX/pixel audit (Asaf: "ease of use for the UX & UI and that
 * everything is pixel perfect") — captures every new motor surface at
 * full size for visual review:
 *   1. Motor module hero + New Motor Quote affordance
 *   2. Wizard step 1 with the sale-type toggle + trade-in fields
 *   3. Motors catalog tab with package preview rows
 *   4. Document Templates → Motor Quote admin tab
 *   5. Catalog Manager Motors table
 */
const SHOTS = 'tasks/test-evidence/v1.34/ux-audit';

test('capture every motor surface', async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);

    // 1. Motor module hero
    await page.goto(`${BASE_URL}/modules/KddayQaREA5tdZzzXjDW`);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${SHOTS}/1-motor-module.png`, fullPage: false });

    // 2+3. Wizard via New Motor Quote
    const btn = page.getByRole('button', { name: /New Motor Quote/i }).first();
    // service-module lookup is a one-shot getDocs — give it time to mount
    await btn.waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
    if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(4000);
        await page.locator('input').first().fill('UX Audit');
        const repower = page.getByRole('button', { name: /Repower/i }).first();
        if (await repower.isVisible().catch(() => false)) await repower.click({ force: true });
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${SHOTS}/2-wizard-step1-repower.png`, fullPage: false });
        await page.getByRole('button', { name: /^Next/i }).click({ force: true });
        await page.waitForTimeout(600);
        await page.getByRole('button', { name: /^Next/i }).click({ force: true });
        await page.waitForTimeout(3500);
        const search = page.locator('input[placeholder*="Search motors"]').first();
        if (await search.isVisible().catch(() => false)) {
            await search.fill('F90');
            await page.waitForTimeout(1200);
        }
        await page.screenshot({ path: `${SHOTS}/3-motor-picker.png`, fullPage: false });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
    }

    // 4. Document Templates → Motor Quote tab
    await page.goto(`${BASE_URL}/manage`);
    await page.waitForTimeout(4000);
    await page.getByRole('tab', { name: /Document Templates/i }).click({ force: true });
    await page.waitForTimeout(2500);
    const mq = page.getByRole('tab', { name: /Motor Quote/i }).first();
    if (await mq.isVisible().catch(() => false)) {
        await mq.click({ force: true });
        await page.waitForTimeout(3000);
    }
    await page.screenshot({ path: `${SHOTS}/4-admin-motor-quote-tab.png`, fullPage: false });

    // 5. Catalog Manager Motors table
    await page.goto(`${BASE_URL}/northside-marine/pricing-manager`);
    await page.waitForTimeout(4000);
    await page.locator('text=/^YAMAHA$/i').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${SHOTS}/5-motors-table.png`, fullPage: false });
    console.log('UX AUDIT CAPTURED');
});
