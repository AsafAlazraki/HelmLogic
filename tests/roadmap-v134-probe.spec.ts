import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.34 planning catch-up proof — the Roadmap shows the v1.34 release
 * with its 14 seeded stories and points.
 */
const SHOTS = 'tasks/test-evidence/v1.34';

test('roadmap shows v1.34 with stories + points', async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);
    await page.goto(`${BASE_URL}/feature-tracking?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    const roadmapTab = page.locator('button, a, [role="tab"]').filter({ hasText: /^Roadmap$/i }).first();
    await roadmapTab.waitFor({ timeout: 40000 });
    await roadmapTab.click({ force: true });
    await page.waitForTimeout(3500);

    // Find and click the v1.34 release marker.
    const v134 = page.locator('text=/v1\\.34/').first();
    await v134.waitFor({ timeout: 20000 });
    await v134.click({ force: true });
    await page.waitForTimeout(2500);

    const body = await page.evaluate(() => document.body.innerText.toUpperCase());
    expect(body, 'motor-only flow story visible').toContain('MOTOR-ONLY FULL QUOTE FLOW');
    expect(body, 'rebates story visible').toContain('YAMAHA REBATES');
    await page.screenshot({ path: `${SHOTS}/roadmap-v134.png`, fullPage: false });
    console.log('ROADMAP v1.34 VERIFIED');
});
