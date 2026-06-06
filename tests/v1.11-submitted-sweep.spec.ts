/**
 * Sweep verification for two pre-existing surfaces from the Submitted
 * column that turned out to already be built:
 *   - 1.8.11 PDF section drag-and-drop (PdfSectionList in
 *     ContentBlockManager) — confirm draggable rows render
 *   - Crowdsourcing approval queue at /suggestions — confirm it loads
 */
import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

const OUT = 'test-results/v1.11-submitted-sweep';
fs.mkdirSync(OUT, { recursive: true });

test.use({ viewport: { width: 1440, height: 900 } });

test('Submitted sweep — PDF reorder list + Suggestion queue mount', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';

    // 1. PDF section list inside Document Templates
    await page.goto(`${BASE_URL}/${orgSlug}/manage?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
    const docTab = page.locator('button:has-text("Document Templates"), [role="tab"]:has-text("Document Templates")').first();
    await docTab.click({ force: true });
    await page.waitForTimeout(2500);
    const quoteSub = page.locator('button:has-text("Quote"), [role="tab"]:has-text("Quote")').first();
    if (await quoteSub.isVisible().catch(() => false)) {
        await quoteSub.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1200);
    }
    await page.screenshot({ path: `${OUT}/00-pdf-sections.png`, fullPage: true });

    // Sections list rendered — look for known section labels
    const sectionsVisible = await page.locator(':text("Cover Page"), :text("Salesperson Message"), :text("Why Choose Us"), :text("Vessel Configuration"), :text("Brand & Model Story")').count();
    console.log('▶ PDF section labels visible:', sectionsVisible);
    expect(sectionsVisible, 'PDF section list should render multiple sections').toBeGreaterThan(3);

    // 2. Suggestion queue at /suggestions
    await page.goto(`${BASE_URL}/suggestions?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/01-suggestion-queue.png`, fullPage: true });
    // Either the queue or "Inbox zero" is acceptable
    const queueOk = await page.locator(':text("Suggestion"), :text("Inbox zero"), :text("No suggestions")').count();
    expect(queueOk, 'Suggestion queue page should mount').toBeGreaterThan(0);

    console.log('▶ submitted-sweep verified live');
});
