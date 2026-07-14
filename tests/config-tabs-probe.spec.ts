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

    // Deep-link into the Catalog Explorer exactly the way Asaf's browser
    // was (org-slug route + URL-persisted view state, SP560 loaded).
    await page.goto(`${BASE_URL}/northside-marine/modules/highfield?tab=bmt&view=bmt&range=nQ2LE50z9Tbf2uss0Ote&model=sp560`);
    await page.waitForLoadState('domcontentloaded');
    // Cold-start can sit on the "Loading Precision Build" splash for a
    // while — wait for the config tabs themselves, not a fixed delay.
    await page.getByRole('tab', { name: /Dealer Fit Options/i }).waitFor({ timeout: 90000 });
    await page.waitForTimeout(2000);
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
