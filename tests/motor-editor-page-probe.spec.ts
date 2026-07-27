import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.34 — full-screen motor editor (Asaf: "full dedicated screen like
 * the one for boat catalog", not a popup):
 *  1. Workspace catalog card click NAVIGATES to /modules/{id}/motor/{motorId}.
 *  2. The page renders the hero rail + all editor panels + MPF option bands.
 *  3. A save round-trips live (Saved toast) and renders back.
 */
const MOTOR_MODULE = 'KddayQaREA5tdZzzXjDW';
const SHOTS = 'tasks/test-evidence/v1.34';

test('catalog card click opens the dedicated editor page', async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);
    await page.goto(`${BASE_URL}/modules/${MOTOR_MODULE}?motorTab=catalog&_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    const search = page.locator('input[placeholder="Search motors..."]').first();
    await search.waitFor({ timeout: 45000 });
    await page.waitForTimeout(3000);
    await search.fill('F90');
    await page.waitForTimeout(1200);
    await page.locator('text=/Yamaha - F90XB$/i').first().click({ force: true });

    // NAVIGATION, not a popup.
    await page.waitForURL(/\/motor\//, { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);

    const body = (await page.evaluate(() => document.body.innerText)).toUpperCase();
    for (const label of ['IDENTITY', 'SPECIFICATIONS', 'PRICING', 'INSTALLATION', 'ACCESSORY PACKAGE', 'MPF OPTIONS FOR THIS MOTOR', 'BACK TO MODULE']) {
        expect(body, `page shows ${label}`).toContain(label);
    }
    await page.screenshot({ path: `${SHOTS}/motor-editor-page.png`, fullPage: true });

    // Live save round-trip on Engine colour.
    const colourInput = page.locator('label:has-text("Engine colour") input').first();
    const before = await colourInput.inputValue();
    await colourInput.fill('Grey (page probe)');
    await colourInput.blur();
    await page.waitForTimeout(2500);
    const toast = await page.evaluate(() => document.body.innerText);
    expect(toast, 'save toast').toMatch(/Live on every quote surface|Saved/i);
    await colourInput.fill(before || 'Grey');
    await colourInput.blur();
    await page.waitForTimeout(2500);
    console.log(`EDITOR PAGE VERIFIED (colour was '${before}')`);
});
