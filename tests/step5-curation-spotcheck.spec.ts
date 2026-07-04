import { test, expect, type Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.31 addendum (Story 12.4.2) — Step-5 curation engine browser spot-check.
 *
 * Verifies on a live CL380 (3.8m tender, 15-30hp envelope, PVC variant):
 *  - toolbar: search box + category chips + "Show all items" escape hatch
 *  - model-pack dedupe: ONE "Boat Pack — Classic 380" card, not eight
 *  - prettified headings (raw MPF heading kept in title attr)
 *  - context-inappropriate items hidden (Supply & Install, Engine Removal,
 *    radomes on a 3.8m hull) and revealed by Show all
 *  - responsive grid at 1366x768 and 1920x1080 (no horizontal overflow)
 */

const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const VENDOR_ID = 'LafOLpLb6QIFE856TiD4';
const RANGE_ID = 'qo7IePnRzJxjrYyLWhTn'; // Classic
const MODEL_ID = 'cl380';
const SHOTS = 'tasks/test-evidence/step5-curation';

async function openCl380Step5(page: Page) {
    await login(page);
    let mounted = false;
    for (let attempt = 1; attempt <= 3 && !mounted; attempt++) {
        await page.goto(`${BASE_URL}/modules/${MODULE_ID}/quote/${MODEL_ID}?range=${RANGE_ID}&vendor=${VENDOR_ID}&_t=${Date.now()}_${attempt}`);
        await page.waitForLoadState('domcontentloaded');
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
            if (await page.locator('button:has-text("Next Step")').first().isVisible().catch(() => false)) { mounted = true; break; }
            if (await page.locator('text=/Context Error/i').first().isVisible().catch(() => false)) break;
            await page.waitForTimeout(500);
        }
    }
    expect(mounted, 'quote flow mounted').toBe(true);

    // Step 1 — pick PVC + first colour.
    const matBtn = page.locator('button.h-32').filter({ hasText: /^\s*PVC\s*$/i }).first();
    await matBtn.waitFor({ timeout: 20000 });
    await matBtn.click({ force: true });
    await page.waitForTimeout(800);
    const colourCard = page.locator('button.rounded-\\[1\\.5rem\\]').first();
    await colourCard.waitFor({ timeout: 15000 });
    await colourCard.click({ force: true });
    await page.waitForTimeout(1200);

    // Advance to Step 5 (Dealer Fit). Some steps may auto-skip; loop until
    // the curation toolbar appears or we run out of clicks.
    for (let i = 0; i < 6; i++) {
        if (await page.locator('input[placeholder="Search dealer fit options..."]').first().isVisible().catch(() => false)) break;
        const next = page.locator('button:has-text("Next Step")').first();
        if (!(await next.isVisible().catch(() => false))) break;
        await next.click({ force: true });
        await page.waitForTimeout(1500);
    }
    await page.locator('input[placeholder="Search dealer fit options..."]').first().waitFor({ timeout: 20000 });
}

test.describe('Step-5 curation spot-check (CL380)', () => {
    test('curated Step 5 — dedupe, toolbar, prettified headings, escape hatch', async ({ page }) => {
        test.setTimeout(240000);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await openCl380Step5(page);
        await page.waitForTimeout(1500);

        // Toolbar present.
        await expect(page.locator('input[placeholder="Search dealer fit options..."]').first()).toBeVisible();
        await expect(page.locator('button:has-text("Show all items")').first()).toBeVisible();

        // Prettified headings; raw MPF heading kept in the title attribute.
        await expect(page.locator('h3[title="MAJESTIC TV OPTIONS"]').first()).toHaveText(/TV & Entertainment/i);
        expect(await page.locator('h3:has-text("MAJESTIC TV OPTIONS")').count()).toBe(0);

        // Model-pack dedupe: exactly ONE card under Boat Pack — Classic 380.
        const packHeading = page.locator('h3[title="Highfield - Classic 380"]').first();
        await expect(packHeading).toHaveText(/Boat Pack — Classic 380/i);
        const packSection = packHeading.locator('xpath=ancestor::div[contains(@class,"scroll-mt-10")][1]');
        const packCards = packSection.locator('p[title*="CL380"]');
        expect(await packCards.count(), 'one pack card, not eight').toBe(1);
        await expect(packCards.first()).toHaveText(/PVC/i); // matches the active PVC variant

        // Context-inappropriate items hidden.
        expect(await page.locator('text=/SUPPLY & INSTALL -/i').count()).toBe(0);
        expect(await page.locator('text=/Engine Removal/i').count()).toBe(0);
        expect(await page.locator('text=/GMR18 Radome/i').count()).toBe(0); // R-SIZE-RADAR on a 3.8m hull
        // Hidden-count line present.
        await expect(page.locator('text=/hidden as not relevant to this build/i').first()).toBeVisible();

        await page.screenshot({ path: `${SHOTS}/cl380-step5-curated-1920.png`, fullPage: false });

        // Search narrows.
        await page.fill('input[placeholder="Search dealer fit options..."]', 'garmin');
        await page.waitForTimeout(600);
        await expect(page.locator('h3[title="GARMIN ELECTRONIC OPTIONS"]').first()).toBeVisible();
        expect(await page.locator('h3[title="BATTERY INSTALLATIONS"]').count()).toBe(0);
        await page.screenshot({ path: `${SHOTS}/cl380-step5-search-garmin.png`, fullPage: false });
        await page.fill('input[placeholder="Search dealer fit options..."]', '');
        await page.waitForTimeout(600);

        // Escape hatch reveals the narrowed items (radomes, workshop ops).
        await page.click('button:has-text("Show all items")');
        await page.waitForTimeout(1200);
        expect(await page.locator('text=/GMR18 Radome/i').count()).toBeGreaterThan(0);
        expect(await page.locator('h3[title="ENGINE REMOVALS"]').count()).toBeGreaterThan(0);
        await page.screenshot({ path: `${SHOTS}/cl380-step5-show-all.png`, fullPage: false });
        await page.click('button:has-text("Showing all items")');
        await page.waitForTimeout(800);

        // Responsive: no horizontal page overflow at 1920 or 1366.
        for (const [w, h] of [[1920, 1080], [1366, 768]] as const) {
            await page.setViewportSize({ width: w, height: h });
            await page.waitForTimeout(800);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow, `h-overflow at ${w}`).toBeLessThanOrEqual(0);
            await page.screenshot({ path: `${SHOTS}/cl380-step5-${w}.png`, fullPage: false });
        }
    });
});
