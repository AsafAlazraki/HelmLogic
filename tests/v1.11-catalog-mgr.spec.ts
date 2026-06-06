/**
 * Catalog Manager — verification spec for v1.11 follow-up surface:
 *   - Page renamed Pricing Manager → Catalog Manager
 *   - Two new strategy cards (Catalog xlsx · Catalog Audit) render
 *   - Catalog I/O sheet opens with the Export + Import buttons
 *   - Catalog Audit sheet opens (empty-state OK before first commit)
 *   - Export click triggers a .xlsx download
 *
 * No mutating actions — the import diff dialog requires a real xlsx with
 * deliberate changes which we'd need to round-trip. That's covered in
 * the next spec.
 */
import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';
import path from 'path';

const OUT = 'test-results/v1.11-catalog-mgr';
fs.mkdirSync(OUT, { recursive: true });

test.use({ viewport: { width: 1440, height: 900 } });

test('Catalog Manager — rename + I/O panel + audit history mount', async ({ page }) => {
    test.setTimeout(360_000);

    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';

    await page.goto(`${BASE_URL}/${orgSlug}/pricing-manager?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/00-page.png`, fullPage: true });

    // 1. Title renamed
    const title = page.locator('h1:has-text("Catalog Manager")').first();
    await expect(title).toBeVisible({ timeout: 20000 });
    const pricingMgrText = await page.locator('h1:has-text("Pricing Manager")').count();
    expect(pricingMgrText, 'old title "Pricing Manager" should be gone').toBe(0);

    // 2. Strategy cards render
    const catalogXlsxCard = page.locator(':text("Catalog xlsx")').first();
    const auditCard = page.locator(':text("Catalog Audit")').first();
    await expect(catalogXlsxCard).toBeVisible();
    await expect(auditCard).toBeVisible();

    // 3. Open Catalog I/O sheet
    await catalogXlsxCard.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/01-io-sheet.png`, fullPage: true });

    const exportBtn = page.locator('button:has-text("Export audit workbook"), button:has-text("Export")').first();
    const importBtn = page.locator('button:has-text("Import from xlsx"), button:has-text("Import")').first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    await expect(importBtn).toBeVisible({ timeout: 10000 });

    // 4. Click Export — produces a download. Allow up to 3 minutes because
    //    the export dumps the entire data-warehouse hierarchy + several
    //    org-level collections on a real prod-shape catalog.
    const dlPromise = page.waitForEvent('download', { timeout: 180_000 }).catch(() => null);
    await exportBtn.click();
    const download = await dlPromise;
    expect(download, 'Export should trigger a download').not.toBeNull();
    if (download) {
        const dest = path.resolve(OUT, 'catalog-export.xlsx');
        await download.saveAs(dest);
        const stats = fs.statSync(dest);
        console.log(`💾 export saved: ${Math.round(stats.size / 1024)} KB at ${dest}`);
        expect(stats.size, 'export should be a non-empty file').toBeGreaterThan(100);
    }

    // 5. Close + open audit
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(800);
    await auditCard.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/02-audit-sheet.png`, fullPage: true });

    // Should render either past entries OR the empty state.
    const hasContent = await page.locator(':text("Catalog Audit History"), :text("No catalog audits yet"), :text("Catalog Import")').count();
    expect(hasContent, 'audit sheet should mount with content or empty state').toBeGreaterThan(0);

    console.log('▶ catalog manager verification complete');
});
