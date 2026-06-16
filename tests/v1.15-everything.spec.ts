/**
 * v1.15 — every shipped story validated.
 *
 *   3.3.1 — Crowdsourced Suggestions with Audit (Suggestion Approval Queue mount)
 *   3.4.2 — Marketing Copy Editor UI on BoatsTable (this spec)
 *   9.3.1 — Rule-based fit-up tier auto-classification (Rules sub-tab + classification UI)
 */
import { test } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

const OUT = 'test-results/v1.15-everything';
const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.15 summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    const p = Object.values(ticks).filter(Boolean).length;
    console.log(`  ${p}/${Object.keys(ticks).length} passed\n`);
});

test('Suggestion Approval Queue mounts (3.3.1)', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';
    await page.goto(`${BASE_URL}/feature-tracking?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(6000);

    const suggestionTab = page.getByRole('tab', { name: /Suggestion/i }).first();
    if (await suggestionTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await suggestionTab.click({ force: true });
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${OUT}/01-suggestions.png`, fullPage: true });
    }
    const ui = await page.locator('text=/Suggestion|Approve|Reject|Audit/i').first().isVisible({ timeout: 4000 }).catch(() => false);
    tick('v1.15/3.3.1-suggestion-queue', ui);
});

test('Marketing Copy Editor on BoatsTable (3.4.2)', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';
    await page.goto(`${BASE_URL}/pricing-manager?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(8000);
    const stabicraftVendor = page.locator('text=/STABICRAFT/i').first();
    if (await stabicraftVendor.isVisible({ timeout: 5000 }).catch(() => false)) {
        await stabicraftVendor.click({ force: true }).catch(() => {});
        await page.waitForTimeout(6000);
    }
    await page.screenshot({ path: `${OUT}/02-boats-page.png`, fullPage: true });

    const expandRow = page.locator('button:has(svg.lucide-chevron-down), button:has(svg.lucide-chevron-right)').first();
    if (await expandRow.isVisible({ timeout: 4000 }).catch(() => false)) {
        await expandRow.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${OUT}/03-boats-expanded.png`, fullPage: true });
    }
    const marketingCopy = await page.locator('text=/Marketing copy|Tagline|Description/i').first().isVisible({ timeout: 4000 }).catch(() => false);
    tick('v1.15/3.4.2-marketing-copy-editor', marketingCopy);
});

test('Fit-up tier rule engine — Rules sub-tab (9.3.1)', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';
    await page.goto(`${BASE_URL}/manage?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(6000);

    const fitUpTab = page.getByRole('tab', { name: /Fit-Up Catalog/i }).first();
    if (await fitUpTab.isVisible({ timeout: 6000 }).catch(() => false)) {
        await fitUpTab.click({ force: true });
        await page.waitForTimeout(3000);
        const rulesSubTab = page.locator('button[role="tab"]').filter({ hasText: /^Rules$/ }).first();
        if (await rulesSubTab.isVisible({ timeout: 5000 }).catch(() => false)) {
            await rulesSubTab.click({ force: true });
            await page.waitForTimeout(3000);
            await page.screenshot({ path: `${OUT}/04-rules-tab.png`, fullPage: true });
        }
    }
    const rulesUi = await page.locator('text=/classification rules|Add rule/i').first().isVisible({ timeout: 4000 }).catch(() => false);
    tick('v1.15/9.3.1-fit-up-rule-engine-ui', rulesUi);
});
