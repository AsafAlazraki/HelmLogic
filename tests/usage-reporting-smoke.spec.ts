import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.33 (Epic 14) — Usage Reporting smoke. The test IS the telemetry
 * subject: it logs in (session starts), browses a few pages (nav + click
 * events flush every 15s), then opens Reporting → Usage & Activity with
 * test accounts INCLUDED (the harness signs in as billh, the tagged test
 * login) and asserts its own freshly-captured activity renders.
 */
const SHOTS = 'tasks/test-evidence/usage-reporting';

test('telemetry captures a session and the reports render it', async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);

    // Generate activity: browse three pages, click around.
    for (const path of ['/dashboard', '/customers', '/pipeline']) {
        await page.goto(`${BASE_URL}${path}`);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2500);
    }
    // Let the 15s flush + first heartbeat land.
    await page.waitForTimeout(20000);

    // Open the reports.
    await page.goto(`${BASE_URL}/reporting`);
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('tab', { name: /Usage & Activity/i }).click();
    await page.waitForTimeout(4000);

    // Include test accounts (the harness user IS the test account).
    const toggle = page.locator('button[role="switch"]').first();
    await toggle.click({ force: true });
    await page.waitForTimeout(3000);

    const body = await page.evaluate(() => document.body.innerText);
    const hasSessions = /Sessions/i.test(body);
    const hasLeaderboard = /Who actually uses it/i.test(body);
    const hasExplorer = /Event explorer/i.test(body);
    const hasBill = /Bill/i.test(body);
    console.log(`sections: sessions=${hasSessions} leaderboard=${hasLeaderboard} explorer=${hasExplorer} billVisible=${hasBill}`);
    await page.screenshot({ path: `${SHOTS}/usage-tab.png`, fullPage: true });

    expect(hasLeaderboard && hasExplorer, 'report sections render').toBe(true);
    expect(hasBill, 'the freshly-captured test session appears').toBe(true);

    // PDF export of the current view.
    const dlPromise = page.waitForEvent('download', { timeout: 120000 });
    await page.getByRole('button', { name: /Export PDF/i }).click({ force: true });
    const dl = await dlPromise;
    await dl.saveAs(`${SHOTS}/usage-report.pdf`);
    console.log('usage PDF exported');
});
