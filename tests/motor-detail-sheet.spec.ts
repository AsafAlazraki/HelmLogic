import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.34 — Catalog Manager "define everything" motor sheet. Clicking a
 * Part # in the Motors Catalogue opens a sheet with every editable MPF
 * field grouped (identity / specs / pricing / install) + the accessory
 * package. Proves open + field presence + a live save round-trip.
 */
const SHOTS = 'tasks/test-evidence/v1.34';

test('Part # click opens the define-everything sheet', async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);

    // Catalog Manager keeps its historical /pricing-manager URL; the
    // Motors table mounts after picking YAMAHA in the left brand list.
    await page.goto(`${BASE_URL}/pricing-manager?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    const yamaha = page.locator('text=/^YAMAHA$/i').first();
    await yamaha.waitFor({ timeout: 60000 });
    await yamaha.click({ force: true });
    await page.waitForTimeout(4000);
    // Vendor combobox fallback (motors-table-probe pattern).
    const trigger = page.locator('button[role="combobox"]').filter({ hasText: /brand|Select/i }).first();
    if (await trigger.isVisible().catch(() => false)) {
        await trigger.click({ force: true });
        const opt = page.getByRole('option', { name: /Yamaha/i }).first();
        if (await opt.isVisible().catch(() => false)) await opt.click({ force: true });
    }
    const search = page.locator('input[placeholder*="Search model / part number"]').first();
    await search.waitFor({ timeout: 60000 });
    await search.fill('F90XB');
    await page.waitForTimeout(1200);

    await page.locator('button', { hasText: 'F90XB' }).first().click();
    await page.waitForTimeout(1500);

    // CSS-uppercased headings come back transformed from innerText —
    // compare case-insensitively (motors-table-probe lesson).
    const sheet = (await page.evaluate(() => document.body.innerText)).toUpperCase();
    for (const label of ['Identity', 'Specifications', 'Pricing', 'Installation', 'Accessory package', 'Trade price', 'Install sell']) {
        expect(sheet, `sheet shows ${label}`).toContain(label.toUpperCase());
    }
    // Input values never surface in innerText — read the field directly.
    const sellValue = await page.locator('label:has-text("Sell (NSM Retail") input').first().inputValue();
    expect(sellValue, 'NSM retail value present').toBe('17643');
    await page.screenshot({ path: `${SHOTS}/motor-detail-sheet.png`, fullPage: false });
    console.log('SHEET OPEN + COMPLETE');

    // Live save round-trip on a low-stakes field: Engine colour.
    const colourInput = page.locator('label:has-text("Engine colour") input').first();
    const before = await colourInput.inputValue();
    await colourInput.fill('Grey (verified)');
    await colourInput.blur();
    await page.waitForTimeout(2000);
    const toast = await page.evaluate(() => document.body.innerText);
    expect(toast, 'save toast').toMatch(/Saved/i);
    // restore
    await colourInput.fill(before || 'Grey');
    await colourInput.blur();
    await page.waitForTimeout(2000);
    console.log(`ROUND-TRIP OK (was '${before}')`);
});
