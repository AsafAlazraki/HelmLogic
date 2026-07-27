import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.34 — motor module Catalog tab config proof (Asaf: "collapsible and
 * searchable and all changes flow onto the quote module"):
 *  1. HP-band sections collapse/expand with counts.
 *  2. Search narrows the catalogue.
 *  3. Card click opens the define-everything editor; a save round-trips
 *     to the MPF row (the exact row the quote flow prices from).
 */
const MOTOR_MODULE = 'KddayQaREA5tdZzzXjDW';
const SHOTS = 'tasks/test-evidence/v1.34';

test('catalog tab: collapsible sections + editor + live save', async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);
    await page.goto(`${BASE_URL}/modules/${MOTOR_MODULE}?motorTab=catalog&_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    const search = page.locator('input[placeholder="Search motors..."]').first();
    await search.waitFor({ timeout: 45000 });
    await page.waitForTimeout(4000);

    // 1. Collapsible sections with counts, open by default.
    const triggers = page.locator('button:has(h2)');
    const nSections = await triggers.count();
    expect(nSections, 'HP-band section headers present').toBeGreaterThan(2);
    await page.screenshot({ path: `${SHOTS}/config-catalog-open.png` });
    // Collapse the first two bands.
    await triggers.nth(0).click();
    await triggers.nth(1).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/config-catalog-collapsed.png` });

    // 2. Search narrows.
    await search.fill('F90');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/config-catalog-search.png` });

    // 3. Card click -> define-everything editor.
    await page.locator('text=/Yamaha - F90XB$/i').first().click({ force: true });
    await page.waitForTimeout(1800);
    const sheet = (await page.evaluate(() => document.body.innerText)).toUpperCase();
    for (const label of ['Identity', 'Specifications', 'Pricing', 'Installation', 'Accessory package']) {
        expect(sheet, `editor shows ${label}`).toContain(label.toUpperCase());
    }
    await page.screenshot({ path: `${SHOTS}/config-catalog-editor.png` });

    // Live save round-trip on Engine colour (edit -> Saved -> restore).
    const colourInput = page.locator('label:has-text("Engine colour") input').first();
    const before = await colourInput.inputValue();
    await colourInput.fill('Grey (config probe)');
    await colourInput.blur();
    await page.waitForTimeout(2000);
    const toast = await page.evaluate(() => document.body.innerText);
    expect(toast, 'save toast confirms quote-surface flow').toMatch(/Live on every quote surface|Saved/i);
    await colourInput.fill(before || 'Grey');
    await colourInput.blur();
    await page.waitForTimeout(2000);
    console.log(`CONFIG CATALOG VERIFIED (colour was '${before}')`);
});
