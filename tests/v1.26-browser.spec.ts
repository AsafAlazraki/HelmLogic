/** v1.26 browser — global search page mounts. */
import { test } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
const OUT = 'test-results/v1.26-browser';
const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.26 browser ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    console.log(`  ${Object.values(ticks).filter(Boolean).length}/${Object.keys(ticks).length} passed\n`);
});

test('Global search page (1.7.4)', async ({ page }) => {
    test.setTimeout(150_000);
    await login(page);
    await page.goto(`${BASE_URL}/search?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${OUT}/01-search.png`, fullPage: true });
    const mounts = await page.locator('[data-testid="global-search"]').first().isVisible({ timeout: 8000 }).catch(() => false);
    tick('v1.26/1.7.4-search-mounts', mounts);
    const input = page.locator('[data-testid="global-search-input"]').first();
    const inputVisible = await input.isVisible({ timeout: 5000 }).catch(() => false);
    tick('v1.26/1.7.4-input-renders', inputVisible);
    if (inputVisible) {
        await input.fill('a');
        await page.waitForTimeout(2000);
        const results = await page.locator('[data-testid="global-search-results"]').first().isVisible({ timeout: 4000 }).catch(() => false);
        tick('v1.26/1.7.4-results-render-on-type', results);
    } else {
        tick('v1.26/1.7.4-results-render-on-type', false);
    }
});
