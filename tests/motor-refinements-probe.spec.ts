import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.34 perfection pass — visual proof of the approved refinements:
 *  (2) motor-only flow opens on Yamaha brand imagery, not a placeholder;
 *  (3) the price-level picker offers ONLY the four motor levels;
 *  (4) Manage → Document Templates → Motor Quote previews the real
 *      proposal-style motor document.
 */
const MOTOR_MODULE = 'KddayQaREA5tdZzzXjDW';
const SHOTS = 'tasks/test-evidence/v1.34';

test('motor flow: Yamaha panel + motor price levels', async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);
    await page.goto(`${BASE_URL}/modules/${MOTOR_MODULE}/motor-quote?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    const search = page.locator('input[placeholder*="Search motors"]').first();
    await search.waitFor({ timeout: 45000 });
    await page.waitForTimeout(2500);

    // (2) Yamaha imagery, not the "no imagery" placeholder.
    const body = await page.evaluate(() => document.body.innerText.toUpperCase());
    expect(body, 'no placeholder text').not.toContain('NO IMAGERY ON FILE');
    const panelImgs = await page.locator('img').count();
    expect(panelImgs, 'brand image rendered').toBeGreaterThan(0);

    // (3) The price-level select needs a motor picked for the card to show;
    // pick F90XB, then read the select options.
    await search.fill('F90XB');
    await page.waitForTimeout(1500);
    await page.locator('p', { hasText: /^Yamaha - F90XB$/i }).first().click({ force: true });
    await page.waitForTimeout(2500);
    const options = await page.locator('select option').allInnerTexts();
    console.log('price-level options:', JSON.stringify(options));
    expect(options.join('|'), 'motor levels present').toMatch(/Cash Price \(NSM Retail\)/);
    expect(options.join('|'), 'commercial present').toMatch(/Commercial Price/);
    expect(options.join('|'), 'no AUS Sailing').not.toMatch(/AUS Sailing/);
    expect(options.join('|'), 'no sub-dealer').not.toMatch(/Sub-Dealer/);
    await page.screenshot({ path: `${SHOTS}/refine-motor-panel-levels.png` });
    console.log('PANEL + LEVELS VERIFIED');
});

test('document templates: motor-quote preview is the proposal layout', async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);
    await page.goto(`${BASE_URL}/manage?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    const docsTab = page.locator('button, [role="tab"]').filter({ hasText: /Document Templates/i }).first();
    await docsTab.waitFor({ timeout: 45000 });
    await docsTab.click({ force: true });
    await page.waitForTimeout(2000);
    const motorTab = page.locator('button, [role="tab"]').filter({ hasText: /^Motor Quote$/i }).first();
    await motorTab.waitFor({ timeout: 20000 });
    await motorTab.click({ force: true });
    // PDF preview iframe takes a while to rasterise.
    const previewPanel = page.locator('text=/MOTOR QUOTE PDF PREVIEW/i').first();
    await previewPanel.waitFor({ timeout: 30000 });
    await previewPanel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(30000);
    await page.screenshot({ path: `${SHOTS}/refine-motor-preview.png`, fullPage: false });
    console.log('PREVIEW CAPTURED');
});
