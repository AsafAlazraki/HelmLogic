import { test } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.33 hotfix probe — Asaf: "TRAILER AND MOTOR AND DEALER FIT OPTIONS
 * pages of the config section showing everything as empty". Opens the
 * Highfield module → Catalog Explorer → CL380 → every config tab,
 * screenshots each and logs body text so we can see EXACTLY what each
 * tab renders (and any console errors).
 */
const SHOTS = 'tasks/test-evidence/v1.33/config-tabs';
const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';

test('CL380 config tabs render their MPF-driven content', async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    await login(page);

    // Deep-link into the Catalog Explorer with CL380 loaded (URL params
    // restore view state per the v1.3.1 refresh-persistence work).
    await page.goto(`${BASE_URL}/modules/${MODULE_ID}?tab=pricing`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(6000);

    // Find CL380 in the explorer (search box or card click).
    const searchBox = page.locator('input[placeholder*="earch"]').first();
    if (await searchBox.isVisible().catch(() => false)) {
        await searchBox.fill('CL380');
        await page.waitForTimeout(1500);
    }
    const cl380 = page.locator('text=/CL380/').first();
    await cl380.click({ force: true }).catch(() => {});
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${SHOTS}/00-explorer.png`, fullPage: false });

    for (const tab of ['Series Details', 'Motor Options', 'Fit Up', 'Trailer Options', 'Dealer Fit Options']) {
        const trigger = page.getByRole('tab', { name: new RegExp(tab, 'i') }).first();
        if (!(await trigger.isVisible().catch(() => false))) {
            console.log(`TAB NOT FOUND: ${tab}`);
            continue;
        }
        await trigger.click({ force: true });
        await page.waitForTimeout(5000);
        const body = await page.evaluate(() => document.body.innerText);
        const slug = tab.toLowerCase().replace(/\s+/g, '-');
        await page.screenshot({ path: `${SHOTS}/${slug}.png`, fullPage: true });
        // Emptiness signals per tab
        const emptyMarkers = (body.match(/matrix empty|no .* configured|nothing here|0 active proposals/gi) || []).length;
        const dollarCount = (body.match(/\$[\d,]+/g) || []).length;
        console.log(`TAB ${tab}: emptyMarkers=${emptyMarkers} priceTokens=${dollarCount} bodyChars=${body.length}`);
    }
    console.log('console errors:', JSON.stringify(errors.slice(0, 10)));
});
