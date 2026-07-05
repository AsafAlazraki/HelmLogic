/**
 * v1.25 — browser walkthrough against dev URL.
 *   1.1.4 Quote comparison page mounts with picker
 */
import { test } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
const OUT = 'test-results/v1.25-browser';
const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.25 browser ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    console.log(`  ${Object.values(ticks).filter(Boolean).length}/${Object.keys(ticks).length} passed\n`);
});

test('Quote comparison page mounts (1.1.4)', async ({ page }) => {
    test.setTimeout(150_000);
    await login(page);
    await page.goto(`${BASE_URL}/quote-comparison?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${OUT}/01-comparison.png`, fullPage: true });
    const mounts = await page.locator('[data-testid="quote-comparison"]').first().isVisible({ timeout: 8000 }).catch(() => false);
    tick('v1.25/1.1.4-comparison-mounts', mounts);
    const heading = await page.locator('text=/Pick up to 3 quotes/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    tick('v1.25/1.1.4-picker-renders', heading);
});
