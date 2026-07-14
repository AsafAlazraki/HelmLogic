/**
 * All-brands quotability verification (phase5b.allbrands).
 *
 * After the gate lift (quote route now mounts the flow for any 'Boat Brand'
 * vendor whose model has >=1 priced variant) + the non-HF factory-options
 * materialization (scripts/mpf/import-fo-nonhf.py), drive one Stacer and
 * one Stabicraft quote through Steps 1 -> 6 and assert:
 *
 *   - Step 1: single MPF variant auto-selects, price renders
 *   - Step 2: materialized factory options render as selectable cards;
 *             selecting one moves the running total by exactly its price
 *   - Step 3: motor step behaves (NSM Recommended menu data-gates on the
 *             variant's motorMenu)
 *   - Step 4/5: trailer + dealer-fit steps mount without error
 *   - Step 6: summary totals compute (base + selected FO)
 *
 * Fixtures (read-only, harvested 2026-07-03 post-FO-apply):
 *   Stacer 409 Assault Pro  (sa409apr)  — $9,736.36 ex GST, 38 FOs,
 *       motorMenu 3 / trailerMenu 3 / dealerFitLines 0
 *   Stabicraft 1450 Explorer (7001401000) — $19,000 ex GST, 15 FOs,
 *       motorMenu 1 / trailerMenu 6 / dealerFitLines 1
 *
 * READ-ONLY: never clicks Finalize — nothing persists.
 * Evidence: tasks/test-evidence/module-quotes/allbrands-*.png
 */
import { test, expect, type Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

const OUT = 'tasks/test-evidence/module-quotes';
fs.mkdirSync(OUT, { recursive: true });

const STACER_MODULE_ID = 'I0dGRbh39uhNJ3gotEb0';
const STACER_VENDOR_ID = 'LWgHuGoKfUBeKZ8eWnEi';
const STABICRAFT_MODULE_ID = 'xt4zMPPE97QfT28owE1O';
const STABICRAFT_VENDOR_ID = '0cUm736tE9ON2WFLRHD0';

function money(text: string): number {
    const m = text.replace(/[^0-9.]/g, '');
    return m ? parseFloat(m) : NaN;
}

async function shot(page: Page, name: string) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }).catch(() => {});
    console.log('shot:', name);
}

async function headerTotal(page: Page): Promise<number> {
    // The running total is the most prominent $ figure in the header band.
    const el = page.locator('div.text-4xl, p.text-4xl, span.text-4xl').first();
    const t = await el.innerText().catch(() => '');
    return money(t);
}

async function nextStep(page: Page) {
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(3500);
}

async function driveBrandQuote(page: Page, opts: {
    brand: string; moduleId: string; vendorId: string; rangeId: string;
    modelId: string; modelText: string; expectExGst: number;
    expectFoMin: number; foPickPriceMax: number;
    motorMenuCount: number; trailerMenuCount: number; dealerFitLines: number;
    shotPrefix: string;
}) {
    // Direct quote-route navigation (same URL shape the module page pushes;
    // avoids the known org-route param-strip flake).
    await page.goto(`${BASE_URL}/modules/${opts.moduleId}/quote/${opts.modelId}?range=${opts.rangeId}&vendor=${opts.vendorId}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(9000);

    // ── Gate lift: flow mounts (no placeholder, no context error) ──
    const placeholder = await page.locator('text=/being developed/i').first().isVisible({ timeout: 2000 }).catch(() => false);
    expect(placeholder, `${opts.brand}: Quotation Engine placeholder must be gone`).toBe(false);
    const onFlow = await page.locator('button:has-text("Next Step")').first().isVisible({ timeout: 20000 }).catch(() => false);
    expect(onFlow, `${opts.brand}: quote flow Step 1 must mount`).toBe(true);

    // ── Step 1: single variant auto-selected + price renders ──
    // The RegoPicker auto-matches a rego band from the boat length (e.g.
    // Stabicraft 1450 → QLD "Recreational Vessel 4.5m-8m" $163 ex GST) —
    // intended behaviour, but it fires asynchronously when the rego catalog
    // loads, so poll for it and clear it so the hull price asserts exactly.
    // Clearing is sticky (RegoPicker autoApplied guard — no re-apply).
    const clearRego = page.locator('button:has-text("Clear")').first();
    for (let waited = 0; waited < 12000; waited += 1500) {
        if (await clearRego.isVisible().catch(() => false)) {
            await clearRego.click({ force: true });
            await page.waitForTimeout(2000);
            console.log(`${opts.brand}: cleared auto-matched rego band (after ${waited}ms)`);
            break;
        }
        await page.waitForTimeout(1500);
    }
    const base = await headerTotal(page);
    console.log(`${opts.brand} Step 1 header total: $${base}`);
    expect(base, `${opts.brand}: Step 1 base price must render`).toBeCloseTo(opts.expectExGst, 0);
    // Registration section only renders once a variant is active — proves auto-select.
    const regoVisible = await page.locator('text=/Registration/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(regoVisible, `${opts.brand}: variant auto-select must expose Registration section`).toBe(true);
    await shot(page, `${opts.shotPrefix}-step1`);

    // ── Step 2: materialized factory options ──
    await nextStep(page);
    const foCards = page.locator('button:has-text("$")').filter({ hasNotText: /Next Step|Back|Add to Build/ });
    const foCount = await foCards.count();
    console.log(`${opts.brand} Step 2 factory-option cards: ${foCount}`);
    expect(foCount, `${opts.brand}: Step 2 must render materialized factory options`).toBeGreaterThanOrEqual(opts.expectFoMin);
    await shot(page, `${opts.shotPrefix}-step2`);

    // Select the first affordable option and assert the total moves by exactly its price.
    let picked = 0;
    for (let i = 0; i < foCount; i++) {
        const card = foCards.nth(i);
        const price = money((await card.innerText()).split('$').pop() || '');
        if (Number.isFinite(price) && price > 0 && price <= opts.foPickPriceMax) {
            await card.click({ force: true });
            await page.waitForTimeout(2500);
            picked = price;
            break;
        }
    }
    const afterPick = await headerTotal(page);
    console.log(`${opts.brand} picked FO $${picked}; total ${base} -> ${afterPick}`);
    if (picked > 0) {
        expect(afterPick, `${opts.brand}: total must move by the FO price`).toBeCloseTo(base + picked, 0);
    }
    await shot(page, `${opts.shotPrefix}-step2-selected`);

    // ── Step 3: motor (NSM Recommended menu data-gates on variant.motorMenu) ──
    await nextStep(page);
    const step3Text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const nsmRecommended = /NSM Recommended/i.test(step3Text);
    console.log(`${opts.brand} Step 3: NSM Recommended visible=${nsmRecommended} (motorMenu ${opts.motorMenuCount})`);
    if (opts.motorMenuCount > 0) {
        expect(nsmRecommended, `${opts.brand}: motorMenu (${opts.motorMenuCount}) must surface NSM Recommended`).toBe(true);
    }
    await shot(page, `${opts.shotPrefix}-step3`);

    // ── Step 4: trailer (may be skipped when the model has no trailer config) ──
    await nextStep(page);
    let bodyNow = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const onTrailer = /Step 4/i.test(bodyNow) && /Trailer/i.test(bodyNow);
    console.log(`${opts.brand} after Step 3 next: onTrailer=${onTrailer} (trailerMenu ${opts.trailerMenuCount})`);
    await shot(page, `${opts.shotPrefix}-step4`);
    if (onTrailer) await nextStep(page);

    // ── Step 5: dealer fit mounts ──
    bodyNow = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const onDealerFit = /Dealer Fit/i.test(bodyNow);
    expect(onDealerFit, `${opts.brand}: Step 5 Dealer Fit must mount`).toBe(true);
    await shot(page, `${opts.shotPrefix}-step5`);

    // ── Step 6 Administration (v1.33) → Step 7: summary totals compute ──
    await nextStep(page);
    await nextStep(page);
    bodyNow = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const onSummary = /Summary|Finalize Project/i.test(bodyNow);
    expect(onSummary, `${opts.brand}: Step 6 summary must mount`).toBe(true);
    const summaryTotal = await headerTotal(page);
    console.log(`${opts.brand} Step 6 summary total: $${summaryTotal} (expected ${base + picked})`);
    expect(summaryTotal, `${opts.brand}: summary total = base + picked FO`).toBeCloseTo(base + picked, 0);
    await shot(page, `${opts.shotPrefix}-step6-summary`);
    // READ-ONLY: never click Finalize.
}

test.use({ viewport: { width: 1440, height: 900 } });

test('stacer — 409 Assault Pro quote Steps 1-6 (gate lift + materialized FO)', async ({ page }) => {
    test.setTimeout(420_000);
    await login(page);
    page.setDefaultTimeout(25000);
    await driveBrandQuote(page, {
        brand: 'Stacer',
        moduleId: STACER_MODULE_ID,
        vendorId: STACER_VENDOR_ID,
        rangeId: 'mpf-catalog',
        modelId: 'sa409apr',
        modelText: '409 Assault Pro',
        expectExGst: 9736.36,
        expectFoMin: 20,           // 38 materialized
        foPickPriceMax: 5000,
        motorMenuCount: 3,
        trailerMenuCount: 3,
        dealerFitLines: 0,
        shotPrefix: 'allbrands-stacer',
    });
});

test('stabicraft — 1450 Explorer quote Steps 1-6 (gate lift + materialized FO)', async ({ page }) => {
    test.setTimeout(420_000);
    await login(page);
    page.setDefaultTimeout(25000);
    await driveBrandQuote(page, {
        brand: 'Stabicraft',
        moduleId: STABICRAFT_MODULE_ID,
        vendorId: STABICRAFT_VENDOR_ID,
        rangeId: 'mpf-catalog',
        modelId: '7001401000',
        modelText: '1450 Explorer',
        expectExGst: 19000,
        expectFoMin: 8,            // 15 materialized
        foPickPriceMax: 5000,
        motorMenuCount: 1,
        trailerMenuCount: 6,
        dealerFitLines: 1,
        shotPrefix: 'allbrands-stabicraft',
    });
});
