/**
 * v1.24 — browser walkthrough against dev URL.
 * Customer detail sheet now carries the journey strip + notes timeline.
 */
import { test } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
const OUT = 'test-results/v1.24-browser';
const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.24 browser ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    console.log(`  ${Object.values(ticks).filter(Boolean).length}/${Object.keys(ticks).length} passed\n`);
});

test('Customer detail sheet: journey + notes (1.5.3 + 8.1.3)', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    await page.goto(`${BASE_URL}/customers?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(8000);
    const nameLink = page.locator('[data-testid="customer-name-link"]').first();
    if (!(await nameLink.isVisible({ timeout: 6000 }).catch(() => false))) {
        console.log('▶ no customers on test org — skipping');
        tick('v1.24/8.1.3-journey-renders', false);
        tick('v1.24/1.5.3-notes-timeline-renders', false);
        return;
    }
    await nameLink.click({ force: true });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/01-detail.png`, fullPage: true });
    const journey = await page.locator('[data-testid="customer-journey"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    tick('v1.24/8.1.3-journey-renders', journey);
    const notes = await page.locator('[data-testid="customer-notes-timeline"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    tick('v1.24/1.5.3-notes-timeline-renders', notes);
    const noteInput = await page.locator('[data-testid="customer-note-input"]').first().isVisible({ timeout: 4000 }).catch(() => false);
    tick('v1.24/1.5.3-note-input-renders', noteInput);
});
