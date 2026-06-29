/**
 * v1.23 — browser walkthrough against dev URL.
 *   1.7.1 Pipeline board mounts
 *   8.1.6 My Work page mounts with 3 tabs
 */
import { test } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
const OUT = 'test-results/v1.23-browser';
const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.23 browser ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    console.log(`  ${Object.values(ticks).filter(Boolean).length}/${Object.keys(ticks).length} passed\n`);
});

test('Pipeline board mounts (1.7.1)', async ({ page }) => {
    test.setTimeout(150_000);
    await login(page);
    await page.goto(`${BASE_URL}/pipeline?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${OUT}/01-pipeline.png`, fullPage: true });
    const board = await page.locator('[data-testid="sales-pipeline-board"]').first().isVisible({ timeout: 8000 }).catch(() => false);
    tick('v1.23/1.7.1-pipeline-board-mounts', board);
});

test('My Work page mounts with tabs (8.1.6)', async ({ page }) => {
    test.setTimeout(150_000);
    await login(page);
    await page.goto(`${BASE_URL}/my-work?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${OUT}/02-my-work.png`, fullPage: true });
    const pageMounts = await page.locator('[data-testid="my-work-page"]').first().isVisible({ timeout: 8000 }).catch(() => false);
    tick('v1.23/8.1.6-my-work-mounts', pageMounts);
    const quotesTab = await page.locator('[data-testid="my-quotes-tab"]').first().isVisible({ timeout: 4000 }).catch(() => false);
    const customersTab = await page.locator('[data-testid="my-customers-tab"]').first().isVisible({ timeout: 4000 }).catch(() => false);
    const contractsTab = await page.locator('[data-testid="my-contracts-tab"]').first().isVisible({ timeout: 4000 }).catch(() => false);
    tick('v1.23/8.1.6-three-tabs-render', quotesTab && customersTab && contractsTab);
});
