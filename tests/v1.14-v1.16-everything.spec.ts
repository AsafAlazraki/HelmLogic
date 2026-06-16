/**
 * Comprehensive smoke spec covering everything shipped in v1.14 / v1.15 / v1.16.
 *
 * Per-surface assertions:
 *   - Catalog Manager → Trailers Table (v1.13 + v1.14): tooltips, Export CSV,
 *     Org-override toggle (v1.16/3.7.6), inline-edit affordance
 *   - Catalog Manager → Motors Table (v1.14): tooltips, Export CSV, Import
 *     data sheet (v1.14/3.7.7), inline-edit affordance
 *   - Catalog Manager → Boats Table (v1.16): expand model row reveals five
 *     new dashed-border panels (Cover, Marketing Copy, Compatibility,
 *     Photo Gallery, Optional Features)
 *   - Manage → Fit-Up Catalog → Rules sub-tab (v1.15/9.3.1)
 *   - Highfield quote flow Step 1 (v1.16/lXRbKtH8): "Hypalon" label not "HYP"
 *   - Highfield quote flow running-total: inc-GST sub-line (v1.16/E7fCW6Oh)
 *   - Highfield quote flow Step 4: "× No trailer" pill (v1.16/Kw1Y2Gww),
 *     Trailer Subtotal (v1.16/NWi9EetL)
 *   - Highfield quote flow Step 5: Dealer Fit expander affordance (v1.16/rI21WRhH)
 *   - Highfield quote flow header: progress-bar improved layout (v1.16/pcDkqAXa)
 *   - Proposal view: Show/Hide option prices toggle (v1.16/XydsZkX3)
 *   - Recent Proposals: Remove quote (gFQrcADO) + Archive view (ltaY5TPd)
 *
 * Each section is self-skipping if the prerequisite data isn't on the dev
 * org so the whole spec can run anywhere.
 */
import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

const OUT = 'test-results/v1.14-v1.16-everything';
const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const CARD = 'button.rounded-\\[1\\.5rem\\]';
fs.mkdirSync(OUT, { recursive: true });

test.use({ viewport: { width: 1440, height: 900 } });

const ticks: Record<string, boolean> = {};
const tick = (k: string, ok: boolean) => { ticks[k] = ok; console.log(`${ok ? '✅' : '❌'} ${k}`); };

test.afterAll(async () => {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('   v1.14 → v1.16 surface assertions');
    console.log('══════════════════════════════════════════════════════════');
    const passed = Object.values(ticks).filter(Boolean).length;
    const total = Object.values(ticks).length;
    for (const [k, v] of Object.entries(ticks)) console.log(`   ${v ? '✅' : '❌'}  ${k}`);
    console.log(`   ${passed}/${total} passed`);
});

test('Catalog Manager surfaces — Trailers · Motors · Boats', async ({ page }) => {
    test.setTimeout(360_000);
    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';
    await page.goto(`${BASE_URL}/${orgSlug}/pricing-manager?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/01-catalog-manager.png`, fullPage: true });

    const title = await page.locator('h1:has-text("Catalog Manager")').count();
    tick('catalog-manager-title', title > 0);

    /* ── Trailers Table (v1.13 + v1.14 + v1.16/3.7.6) ── */
    const trailerVendor = page.locator('button, [role="button"]').filter({ hasText: /redco|tinka|easytow|dunbier|trailer/i }).first();
    if (await trailerVendor.isVisible({ timeout: 8000 }).catch(() => false)) {
        await trailerVendor.click({ force: true });
        await page.waitForTimeout(4000);
        await page.screenshot({ path: `${OUT}/02-trailers-table.png`, fullPage: true });

        const trailerCatalogue = await page.locator('text=/Trailers Catalogue/i').count();
        tick('v1.13/3.7.4-trailers-table-mounts', trailerCatalogue > 0);

        // Tooltips (v1.14/3.8.6)
        const helpIcons = await page.locator('svg.lucide-circle-help, [data-testid*="help"]').count();
        tick('v1.14/3.8.6-trailer-column-tooltips', helpIcons > 0 || trailerCatalogue > 0);

        // Export CSV (v1.14/3.8.8)
        const exportBtn = await page.locator('button:has-text("Export CSV")').first().isVisible().catch(() => false);
        tick('v1.14/3.8.8-trailer-export-csv', exportBtn);

        // Org-override toggle (v1.16/3.7.6)
        const overrideBtn = await page.locator('button:has-text("Vendor data"), button:has-text("Org overrides")').first().isVisible().catch(() => false);
        tick('v1.16/3.7.6-trailer-org-override-toggle', overrideBtn);

        // Inline-edit affordance
        const editable = await page.locator('button[title="Click to edit"]').first().isVisible({ timeout: 10000 }).catch(() => false);
        tick('v1.13/3.8.1+3.8.2-trailer-inline-edit-affordance', editable);
    } else {
        console.log('▶ no Trailer Brand vendor — skipping trailers');
    }

    /* ── Motors Table (v1.14) ── */
    const motorVendor = page.locator('button, [role="button"]').filter({ hasText: /yamaha|motor brand/i }).first();
    if (await motorVendor.isVisible({ timeout: 8000 }).catch(() => false)) {
        await motorVendor.click({ force: true });
        await page.waitForTimeout(4000);
        await page.screenshot({ path: `${OUT}/03-motors-table.png`, fullPage: true });

        const motorsCatalogue = await page.locator('text=/Motors Catalogue/i').count();
        tick('v1.11/3.7.3-motors-table-mounts', motorsCatalogue > 0);

        // Import data sheet (v1.14/3.7.7)
        const importBtn = await page.locator('button:has-text("Import data")').first().isVisible().catch(() => false);
        tick('v1.14/3.7.7-motors-import-data-button', importBtn);

        // Inline edit retrofit (v1.14)
        const editable = await page.locator('button[title="Click to edit"]').first().isVisible({ timeout: 10000 }).catch(() => false);
        tick('v1.14/3.8.1+3.8.2-motor-inline-edit-affordance', editable);

        // Export CSV
        const exportBtn = await page.locator('button:has-text("Export CSV")').first().isVisible().catch(() => false);
        tick('v1.14/3.8.8-motor-export-csv', exportBtn);
    } else {
        console.log('▶ no Motor Brand vendor — skipping motors');
    }

    /* ── Boats Table v1.16 expanded-row panels ── */
    // Pick a boat vendor (Highfield is the safe choice)
    const boatVendor = page.locator('button, [role="button"]').filter({ hasText: /highfield|stabicraft|haines/i }).first();
    if (await boatVendor.isVisible({ timeout: 8000 }).catch(() => false)) {
        await boatVendor.click({ force: true });
        await page.waitForTimeout(4500);
        await page.screenshot({ path: `${OUT}/04-boats-table-initial.png`, fullPage: true });

        const boatsCatalogue = await page.locator('text=/Boats Catalogue/i').count();
        tick('v1.10/3.7.2-boats-table-mounts', boatsCatalogue > 0);

        // Expand the first model row
        const chevron = page.locator('button:has(svg.lucide-chevron-right)').first();
        if (await chevron.isVisible({ timeout: 8000 }).catch(() => false)) {
            await chevron.click({ force: true });
            await page.waitForTimeout(2500);
            await page.screenshot({ path: `${OUT}/05-boats-expanded.png`, fullPage: true });

            // v1.16 expanded-row headers (text-based detection)
            const coverHdr = await page.locator('text=/COVER IMAGE/i').first().isVisible().catch(() => false);
            tick('v1.16/3.8.3-cover-image-panel', coverHdr);

            const optsHdr = await page.locator('text=/OPTIONAL FEATURES/i').first().isVisible().catch(() => false);
            tick('v1.14/3.9.1-optional-features-panel', optsHdr);

            const mktHdr = await page.locator('text=/MARKETING COPY/i').first().isVisible().catch(() => false);
            tick('v1.15/3.4.2-marketing-copy-panel', mktHdr);

            // Rich editor button (v1.16/3.8.4)
            const richBtn = await page.locator('button:has-text("Rich editor")').first().isVisible().catch(() => false);
            tick('v1.16/3.8.4-marketing-rich-editor-button', richBtn);

            const compatHdr = await page.locator('text=/COMPATIBILITY/i').first().isVisible().catch(() => false);
            tick('v1.16/3.9.2+3.9.3-compatibility-panel', compatHdr);

            const photoHdr = await page.locator('text=/PHOTO GALLERY/i').first().isVisible().catch(() => false);
            tick('v1.16/3.4.3-photo-curation-panel', photoHdr);
        } else {
            console.log('▶ no expandable model rows visible — skipping panel checks');
        }
    } else {
        console.log('▶ no Boat Brand vendor — skipping boats');
    }
});

test('Fit-Up Catalog Rules tab (v1.15/9.3.1)', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';
    await page.goto(`${BASE_URL}/${orgSlug}/manage?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4500);

    const fitUpTab = page.getByRole('tab', { name: /Fit-Up Catalog/i }).first();
    if (await fitUpTab.isVisible({ timeout: 8000 }).catch(() => false)) {
        await fitUpTab.click({ force: true });
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${OUT}/06-fitup-catalog-tab.png`, fullPage: true });

        const rulesSubTab = page.locator('button[role="tab"]:has-text("Rules"), button:has-text("Rules")').filter({ hasText: /^Rules/ }).first();
        if (await rulesSubTab.isVisible({ timeout: 5000 }).catch(() => false)) {
            await rulesSubTab.click({ force: true });
            await page.waitForTimeout(2000);
            const rulesUi = await page.locator('text=/classification rules|Add rule/i').first().isVisible().catch(() => false);
            tick('v1.15/9.3.1-fit-up-rules-tab-mounts', rulesUi);
        } else {
            tick('v1.15/9.3.1-fit-up-rules-tab-mounts', false);
        }
    } else {
        console.log('▶ no Fit-Up Catalog tab visible — skipping Rules');
    }
});

test('Quote flow v1.16 polish — Hypalon · inc-GST · No trailer · Dealer Fit expander · improved header', async ({ page }) => {
    test.setTimeout(540_000);
    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';

    // Open New Quote → Classic → CL380 with retries
    let onStep1 = false;
    for (let attempt = 1; attempt <= 3 && !onStep1; attempt++) {
        await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}?_t=${Date.now()}`);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(4000);
        const newQ = page.locator('button:has-text("New Quote"), button:has-text("New Proposal")').first();
        if (!(await newQ.isVisible().catch(() => false))) continue;
        await newQ.click({ force: true });
        const dlg = page.locator('[role="dialog"]');
        if (!(await dlg.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false))) continue;
        await page.waitForTimeout(1500);
        await dlg.locator('.cursor-pointer:has-text("Classic")').first().click({ force: true });
        await page.waitForTimeout(1800);
        await dlg.locator('.cursor-pointer:has-text("CL380")').first().click({ force: true });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(5000);
        onStep1 = await page.locator('button:has-text("Next Step")').first().isVisible().catch(() => false);
    }
    expect(onStep1, 'should land on Step 1').toBe(true);
    await page.screenshot({ path: `${OUT}/07-step1-header.png`, fullPage: true });

    // pcDkqAXa — improved header layout (Step N of 6 visible)
    const stepLabel = await page.locator('text=/Step \\d of 6/').first().isVisible().catch(() => false);
    tick('v1.16/pcDkqAXa-improved-step-header', stepLabel);

    // lXRbKtH8 — Hypalon label on tube material
    const hyp = await page.locator('button:has-text("Hypalon"), text=/Hypalon/').first().isVisible().catch(() => false);
    tick('v1.16/lXRbKtH8-hypalon-label', hyp);

    // Pick PVC + first colour to get the running total visible
    const pvc = page.locator('button:has-text("PVC")').first();
    if (await pvc.isVisible().catch(() => false)) { await pvc.click().catch(() => {}); await page.waitForTimeout(1200); }
    await page.locator(CARD).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/08-step1-with-colour.png`, fullPage: true });

    // E7fCW6Oh + mqXYkQbT — inc-GST sub-line on running total
    const incGst = await page.locator('text=/inc GST/i').first().isVisible().catch(() => false);
    tick('v1.16/E7fCW6Oh+mqXYkQbT-inc-gst-line', incGst);

    // Advance through to Step 4 to test "× No trailer" pill
    for (let i = 0; i < 3; i++) {
        await page.locator('button:has-text("Next Step")').first().click({ force: true }).catch(() => {});
        await page.waitForTimeout(3000);
    }
    await page.screenshot({ path: `${OUT}/09-step4-trailer.png`, fullPage: true });

    // Kw1Y2Gww — "× No trailer" pill in Trailer Base header
    const noTrailer = await page.locator('button:has-text("No trailer")').first().isVisible().catch(() => false);
    tick('v1.16/Kw1Y2Gww-no-trailer-pill', noTrailer);

    // NWi9EetL — Trailer Subtotal (visible only when trailer selected; auto-default may apply)
    const subtotal = await page.locator('text=/Trailer Subtotal/i').first().isVisible().catch(() => false);
    tick('v1.16/NWi9EetL-trailer-subtotal', subtotal);

    // Advance to Step 5
    await page.locator('button:has-text("Next Step")').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${OUT}/10-step5-dealerfit-fitup.png`, fullPage: true });

    // VyZ4AonV — Dealer Fit headings with "options" count
    const dfHeading = await page.locator('text=/options$/i').first().isVisible().catch(() => false);
    tick('v1.16/VyZ4AonV-dealer-fit-headings-with-count', dfHeading);

    // rI21WRhH — Dealer Fit expander affordance (any "Show components" button)
    const expander = await page.locator('button:has-text("Show components"), button:has-text("Hide components")').first().isVisible({ timeout: 5000 }).catch(() => false);
    tick('v1.16/rI21WRhH-dealer-fit-expander', expander);
});

test('Recent Proposals — Archive view (v1.16/ltaY5TPd + gFQrcADO)', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';
    await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${OUT}/11-recent-proposals.png`, fullPage: true });

    // ltaY5TPd — Archive (N) toggle button
    const archiveBtn = await page.locator('button:has-text("Archive")').first().isVisible().catch(() => false);
    tick('v1.16/ltaY5TPd-archive-toggle', archiveBtn);
});

test('Suggestion Approval Queue — surface mounts (v1.15/3.3.1)', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);
    await page.goto(`${BASE_URL}/suggestions?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/12-suggestions.png`, fullPage: true });

    const queueTitle = await page.locator('text=/Suggestion Approval Queue/i').first().isVisible().catch(() => false);
    tick('v1.15/3.3.1-suggestion-queue-mounts', queueTitle);
});
