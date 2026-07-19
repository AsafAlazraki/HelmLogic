import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.34 (Asaf: "fix the catalog manager") — the Catalog Manager Motors
 * tab must show the SAME MPF dataset rows the quote flow prices from.
 * It previously read data-warehouse/{vendor}/parts, which is empty for
 * Yamaha, so the tab rendered "No motors found" while quotes priced 228
 * motors. This probe opens the tab, selects Yamaha, and asserts real
 * MPF rows with real prices render.
 */
const SHOTS = 'tasks/test-evidence/v1.34';

test('Catalog Manager motors tab shows the MPF rows quotes use', async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);

    await page.goto(`${BASE_URL}/northside-marine/pricing-manager?catalogTab=motors`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);

    // Find and click the Motors tab if the URL param didn't land it.
    const motorsTab = page.getByRole('tab', { name: /^Motors$/i }).first();
    if (await motorsTab.isVisible().catch(() => false)) {
        await motorsTab.click({ force: true });
        await page.waitForTimeout(2000);
    }

    // Pick the Yamaha brand in the vendor select.
    const trigger = page.locator('button[role="combobox"]').filter({ hasText: /brand|Yamaha|Select/i }).first();
    await trigger.click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
    const yamahaOption = page.getByRole('option', { name: /Yamaha/i }).first();
    if (await yamahaOption.isVisible().catch(() => false)) {
        await yamahaOption.click({ force: true });
    }
    await page.waitForTimeout(5000);

    const body = await page.evaluate(() => document.body.innerText);
    const counted = body.match(/(\d+) of (\d+)/);
    const priceTokens = (body.match(/\$[\d,]{3,}/g) || []).length;
    const hasEmpty = /No motors found/i.test(body);
    const pseudoNote = /MPF section rows hidden/i.test(body);
    const hasF90 = /F90|F115|F150|F250/i.test(body);
    console.log(`rows counter: ${counted ? counted[0] : 'NOT FOUND'} | priceTokens=${priceTokens} | empty=${hasEmpty} | pseudoNote=${pseudoNote} | knownModels=${hasF90}`);
    await page.screenshot({ path: `${SHOTS}/motors-table.png`, fullPage: false });

    expect(hasEmpty, 'must not show the empty state').toBe(false);
    expect(counted && parseInt(counted[2], 10) >= 200, 'row count >= 200 MPF motors').toBeTruthy();
    expect(priceTokens, 'real prices render').toBeGreaterThan(50);
    expect(hasF90, 'known Yamaha models visible').toBe(true);
});
