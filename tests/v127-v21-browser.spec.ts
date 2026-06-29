/** Audit log viewer page mounts on dev (v2.1/5.5.5). */
import { test } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => { console.log(`\n  ${Object.values(ticks).filter(Boolean).length}/${Object.keys(ticks).length} passed\n`); });
test('Audit log viewer + global search', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    await page.goto(`${BASE_URL}/audit-log?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded'); await page.waitForTimeout(8000);
    await page.screenshot({ path: 'test-results/v127-v21-browser/01-audit.png', fullPage: true });
    tick('v2.1/5.5.5-audit-log-mounts', await page.locator('[data-testid="audit-log-page"]').first().isVisible({ timeout: 8000 }).catch(() => false));
    await page.goto(`${BASE_URL}/search?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded'); await page.waitForTimeout(8000);
    tick('v1.26/1.7.4-search-mounts', await page.locator('[data-testid="global-search"]').first().isVisible({ timeout: 8000 }).catch(() => false));
});
