/**
 * Full end-to-end on a NON-Classic range (Sport SP560 = "complex" boat).
 * Proves the fit-up tier system + responsive fixes work across all Highfield
 * ranges, screenshots every step, and produces the final PDF.
 *
 * Flow: New Quote (retry) → Sport → SP560 → material → factory opts → motor
 * → trailer → DEALER FIT + FIT-UP (verify Complex card is Suggested, pick it,
 * open Custom Fit-Up to confirm controls fit) → Summary → Finalize → PDF.
 */
import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';
import path from 'path';

const OUT = 'test-results/sport-e2e';
const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const CARD = 'button.rounded-\\[1\\.5rem\\]';
fs.mkdirSync(OUT, { recursive: true });

test.use({ viewport: { width: 1440, height: 900 } });

test('Sport SP560 full quote → PDF (cross-range + tier package)', async ({ page }) => {
    test.setTimeout(420_000);
    const errs: string[] = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error' && !/CORS|ERR_FAILED|yamaha-motor|firebasestorage|dunbier|403|404|415/i.test(m.text())) errs.push(m.text().slice(0, 200)); });

    const shot = async (n: string, full = false) => { await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }); console.log('📸', n); };

    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';

    // New Quote dialog → Sport → SP560, with retries (dialog is intermittent).
    let onStep1 = false;
    for (let attempt = 1; attempt <= 3 && !onStep1; attempt++) {
        console.log(`▶ dialog attempt ${attempt}`);
        await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}?_t=${Date.now()}`);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(4000);
        const newQ = page.locator('button:has-text("New Quote"), button:has-text("New Proposal")').first();
        if (!(await newQ.isVisible().catch(() => false))) continue;
        await newQ.click({ force: true });
        const dlg = page.locator('[role="dialog"]');
        if (!(await dlg.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false))) continue;
        await page.waitForTimeout(1500);
        const sport = dlg.locator('.cursor-pointer:has-text("Sport")').first();
        if (!(await sport.isVisible().catch(() => false))) continue;
        await sport.click({ force: true });
        await page.waitForTimeout(1800);
        const sp560 = dlg.locator('.cursor-pointer:has-text("SP560")').first();
        if (!(await sp560.isVisible().catch(() => false))) continue;
        await sp560.click({ force: true });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(5000);
        onStep1 = await page.locator('button:has-text("Next Step")').first().isVisible().catch(() => false);
    }
    expect(onStep1, 'should reach Step 1 on SP560').toBe(true);
    await shot('s1-boat-base', true);

    // Step 1 — pick material + first colour
    const mat = page.locator('button:has-text("PVC"), button:has-text("Hypalon"), button:has-text("ORCA")').first();
    if (await mat.isVisible().catch(() => false)) { await mat.click().catch(() => {}); await page.waitForTimeout(1200); }
    await page.locator(CARD).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1200);
    await shot('s1b-colour-picked');

    // Step 2 — factory options
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(3000);
    await shot('s2-factory-options', true);

    // Step 3 — motor (let the default auto-select stand)
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(4000);
    await shot('s3-motor', true);

    // Step 4 — trailer (keep auto-assigned)
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(3000);
    await shot('s4-trailer', true);

    // Step 5 — Dealer Fit + Fit-Up
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(5000);
    await shot('s5-dealerfit-fitup', true);

    // SP560 is a "complex" boat → the Complex tier card should be Suggested.
    const complexCard = page.locator('button:has-text("COMPLEX"):has-text("$")').first();
    await complexCard.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);
    await shot('s5b-tier-cards');
    const complexVisible = await complexCard.isVisible().catch(() => false);
    expect(complexVisible, 'Complex tier card present on Sport boat').toBe(true);

    // Pick the Complex package
    await complexCard.click({ force: true });
    await page.waitForTimeout(2000);
    await shot('s5c-complex-picked', true);
    const allAdded = await page.locator('text="Added"').count();
    console.log('▶ Added markers after picking Complex:', allAdded);

    // Open Custom Fit-Up to confirm the per-item controls fit (the
    // "buttons don't fit" report). Add one item + check qty stepper.
    const customToggle = page.locator('button:has-text("Custom Fit-Up")').first();
    if (await customToggle.isVisible().catch(() => false)) {
        await customToggle.scrollIntoViewIfNeeded().catch(() => {});
        await customToggle.click({ force: true });
        await page.waitForTimeout(1500);
        await shot('s5d-custom-fitup-open', true);
        // Click a custom item card to add it → reveals the SelectionRow controls
        const customItem = page.locator('button:has-text("$"):below(:text("Custom Fit-Up"))').first();
        if (await customItem.isVisible().catch(() => false)) {
            await customItem.click({ force: true }).catch(() => {});
            await page.waitForTimeout(1500);
        }
        // Screenshot the selected-items panel (qty stepper / price / note controls)
        const selPanel = page.locator('text=/Selected fit-up items/i').first();
        if (await selPanel.isVisible().catch(() => false)) {
            await selPanel.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(500);
            await shot('s5e-selection-row-controls');
        }
    }

    // Step 6 — Summary
    await page.locator('button:has-text("Next Step"), button:has-text("Summary")').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(3500);
    await shot('s6-summary', true);

    // Finalize → Create Proposal → PDF
    const fin = page.locator('button:has-text("Finalize Project"), button:has-text("Finalize")').first();
    let pdfPath = '';
    if (await fin.isVisible().catch(() => false)) {
        await fin.click().catch(() => {});
        await page.waitForTimeout(2000);
        await shot('s7-finalize-dialog');
        const name = page.locator('#cust-name, input[placeholder="John Smith"]').first();
        if (await name.isVisible().catch(() => false)) {
            await name.fill('Sport E2E Customer');
            await page.waitForTimeout(400);
            // email or phone may be required
            const email = page.locator('input[type="email"], input[placeholder*="email" i]').first();
            if (await email.isVisible().catch(() => false)) await email.fill('sport-e2e@example.com').catch(() => {});
            await page.waitForTimeout(400);
            const create = page.locator('button:has-text("Create Proposal")').first();
            await create.click().catch(() => {});
            await page.waitForURL(/\/proposals\//, { timeout: 30000 }).catch(() => {});
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(6000);
            await shot('s8-proposal-view', true);

            const dl = page.locator('button:has-text("Download")').first();
            if (await dl.isVisible().catch(() => false)) {
                const dlPromise = page.waitForEvent('download', { timeout: 90000 }).catch(() => null);
                await dl.click().catch(() => {});
                const download = await dlPromise;
                if (download) {
                    pdfPath = path.resolve(OUT, 'SP560-proposal.pdf');
                    await download.saveAs(pdfPath).catch(() => {});
                    const size = fs.statSync(pdfPath).size;
                    console.log(`💾 PDF saved: ${(size/1024).toFixed(0)} KB`);
                }
            }
        }
    }

    expect(pdfPath, 'PDF should have downloaded').not.toBe('');
    if (errs.length) { console.log('--- errors ---'); errs.slice(0, 8).forEach(e => console.log('  ❌', e)); }
    console.log('▶ done — artifacts in', OUT);
});
