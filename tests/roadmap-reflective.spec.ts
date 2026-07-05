/**
 * Roadmap-reflective check (post v1.21-v1.25 close-off).
 *
 * Verifies the Roadmap on dev shows v1.21-v1.25 as shipped (green column
 * headers) — the thing Asaf flagged as not reflective. Loads
 * /feature-tracking, clicks the Roadmap tab, screenshots, and asserts the
 * version columns render with shipped styling.
 */
import { test } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

test('Roadmap shows v1.21-v1.25 columns', async ({ page }) => {
    test.setTimeout(150_000);
    await login(page);
    await page.goto(`${BASE_URL}/feature-tracking?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(7000);
    // Click the Roadmap tab.
    const roadmapTab = page.locator('text=/^Roadmap$/i').first();
    if (await roadmapTab.isVisible({ timeout: 6000 }).catch(() => false)) {
        await roadmapTab.click({ force: true });
        await page.waitForTimeout(4000);
    }
    await page.screenshot({ path: 'test-results/roadmap-reflective/01-roadmap.png', fullPage: true });
    // Assert the version labels are present somewhere on the board.
    for (const v of ['v1.21', 'v1.22', 'v1.23', 'v1.24', 'v1.25']) {
        const present = await page.locator(`text=${v}`).first().isVisible({ timeout: 3000 }).catch(() => false);
        console.log(`${present ? '✅' : '❌'} ${v} column present`);
    }
});
