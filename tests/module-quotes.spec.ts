/**
 * Module-quotability verification (phase5b.module-quotes).
 *
 * Asaf: "on every module, the functionality should work — trailers, dealer
 * fits, motors, everything should be quotable. Even a dealer-fit or parts
 * quote with labor and service, or a service quote."
 *
 * Walks every module surface in the REAL browser (production build on
 * localhost:9002, live Firestore) and records per-module quotability:
 *
 *   1. SERVICE QUOTE end-to-end with MPF data — create wizard, real
 *      serviceOperations op (9HI-CON-GT), real serviceParts part
 *      (90790-BZ404 ×2), engine-service-schedule interval (F150LC 100h),
 *      totals, draft lifecycle, PDF download.
 *   2. PARTS + LABOR inside a boat quote — CL380 Step 5 Fit-Up custom
 *      picker, imported fitUpItem with installHours ("4-Pin Power Cable",
 *      0.5h, operationCode LOW-000-00128-001), qty, total contribution.
 *   3. TRAILER / MOTOR / FIT-UP module landing pages — quotable-standalone
 *      or catalog-only reality check.
 *   4. Per-brand boat quote spot checks — Stabicraft + Haines Signature
 *      (MPF-imported brands) Step 1 variant+price, Step 2 factory options.
 *
 * Evidence: screenshots → tasks/test-evidence/module-quotes/
 *           raw results  → tasks/test-evidence/module-quotes-raw.json
 *
 * READ-ONLY posture: the only Firestore writes are the service quote this
 * spec creates through the app UI (clearly named, deleted at the end).
 * Boat-quote steps 1–5 never persist anything (no Finalize).
 */
import { test, expect, type Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';
import path from 'path';

const OUT = 'tasks/test-evidence/module-quotes';
const RAW = 'tasks/test-evidence/module-quotes-raw.json';
fs.mkdirSync(OUT, { recursive: true });

// ── Fixtures (harvested read-only from live Firestore, 2026-07-03) ──
const SERVICE_MODULE_ID = 'service-module';
const HIGHFIELD_MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const TRAILERS_MODULE_ID = 'trailers-module';          // "Trailers" (moduleType: trailers)
const TRAILERS_MODULE_ID_2 = 'TNxHmr6BmjEBeTZcrl6p';   // "Trailers Module" (moduleType: trailers)
const YAMAHA_MODULE_ID = 'KddayQaREA5tdZzzXjDW';       // vendorType Motor Brand → YamahaMotorWorkspace
const FITUP_MODULE_ID = 'fit-up-module';               // moduleType fit-up → FitUpCatalogManager
const STABICRAFT_MODULE_ID = 'xt4zMPPE97QfT28owE1O';   // catalog, vendor 0cUm736tE9ON2WFLRHD0
const HAINES_MODULE_ID = 'eKfpwpuYl0EAlAxIMPtG';       // catalog, vendor DJ5GVMzLaNWNcOlRqzJV

const OP_CODE = '9HI-CON-GT';            // Install - Highfield GT Console — 2.5h × $144.55 = $381.36
const OP_SELL = 381.36;
const PART_NUMBER = '90790-BZ404';       // Engine Oil - 4 Stroke — sell $15
const PART_SELL = 15;
const PART_QTY = 2;
const SCHEDULE_ENGINE = 'F150LC';        // engineServiceSchedules/f150lc
const SCHEDULE_INTERVAL = '100h';        // flatHrs 5.0, sell $1,047, ctd 687.91
const SCHEDULE_SELL = 1047;
const FITUP_ITEM_NAME = '4-Pin Power Cable'; // LOWRANCE, installHours 0.5, opCode LOW-000-00128-001, sell $79
const FITUP_ITEM_SELL = 79;

const QUOTE_CUSTOMER = 'HL TEST Module Quotes Verification (safe to delete)';

// ── Result accumulator persisted to disk after every record ──
type Rec = { area: string; check: string; ok: boolean; detail?: string };
function record(area: string, check: string, ok: boolean, detail?: string) {
    let all: Rec[] = [];
    try { all = JSON.parse(fs.readFileSync(RAW, 'utf8')); } catch { /* first write */ }
    all.push({ area, check, ok, detail });
    fs.writeFileSync(RAW, JSON.stringify(all, null, 1));
    console.log(`${ok ? 'PASS' : 'GAP/FAIL'}  [${area}] ${check}${detail ? ' — ' + detail : ''}`);
}

async function shot(page: Page, name: string, full = true) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }).catch(() => {});
    console.log('shot:', name);
}

/** Parse "$1,458" / "1,458.36" style text to a number. */
function money(text: string): number {
    const m = text.replace(/[^0-9.]/g, '');
    return m ? parseFloat(m) : NaN;
}

async function gotoModule(page: Page, moduleId: string) {
    // Non-org route — the /{orgSlug}/modules/... variant strips search params
    // on internal redirects (known ultimate-test finding); module mount is
    // identical on /modules/{id}.
    await page.goto(`${BASE_URL}/modules/${moduleId}?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(6000);
}

test.use({ viewport: { width: 1440, height: 900 } });

// ═══════════════════════════════════════════════════════════════════
// 1. SERVICE QUOTE end-to-end with MPF data
// ═══════════════════════════════════════════════════════════════════
test('service module — quote end-to-end (ops + parts + engine schedule + lifecycle + PDF)', async ({ page }) => {
    test.setTimeout(480_000);
    await login(page);
    page.setDefaultTimeout(25000);
    await gotoModule(page, SERVICE_MODULE_ID);
    await page.waitForTimeout(4000);

    const dashboardUp = await page.locator('text=/Service Quotes/i').first().isVisible({ timeout: 15000 }).catch(() => false);
    record('service', 'quote-start: dashboard mounts at /modules/service-module', dashboardUp);
    await shot(page, 'service-module-landing');
    expect(dashboardUp).toBe(true);

    // ── Create wizard (idempotent: skip if the test quote already exists
    //    from a prior partial run — pick up at the detail sheet instead) ──
    const preExisting = await page.locator('div.cursor-pointer').filter({ hasText: QUOTE_CUSTOMER }).first()
        .isVisible({ timeout: 3000 }).catch(() => false);
    if (!preExisting) {
    await page.locator('button:has-text("New service quote")').first().click();
    const dlg = page.locator('[role="dialog"]');
    await dlg.waitFor({ state: 'visible', timeout: 10000 });

    // Step 1 — customer
    await dlg.locator('input[placeholder="John Smith"]').fill(QUOTE_CUSTOMER);
    await dlg.locator('input[placeholder*="Yamaha F150"]').fill('Highfield CL380 — module-quotes verification');
    await dlg.locator('button:has-text("Next")').click();
    await page.waitForTimeout(2500);

    // Step 2 — operation from the 364 imported serviceOperations
    await dlg.locator('input[placeholder*="Search operations"]').fill(OP_CODE);
    await page.waitForTimeout(2500);
    const opRow = dlg.locator(`button:has-text("${OP_CODE}")`).first();
    const opRowVisible = await opRow.isVisible({ timeout: 15000 }).catch(() => false);
    record('service', `lines-add: op ${OP_CODE} found in catalog search`, opRowVisible);
    expect(opRowVisible).toBe(true);
    const opRowText = await opRow.innerText();
    const opPriceOk = opRowText.includes('381.36') && /2\.50h\s*×\s*\$144\.55\/h/.test(opRowText.replace(/\s+/g, ' '));
    record('service', 'lines-add: op sell $381.36 + 2.50h × $144.55/h shown', opPriceOk, opRowText.replace(/\s+/g, ' ').slice(0, 120));
    await opRow.click();
    await page.waitForTimeout(600);
    await dlg.locator('button:has-text("Next")').click();
    await page.waitForTimeout(1500);

    // Step 3 — part from the 26k imported serviceParts.
    // Type the search IMMEDIATELY: with an empty search the picker renders the
    // whole 26,345-doc catalog into the DOM (no virtualization) — see report.
    await dlg.locator('input[placeholder*="Search parts"]').fill(PART_NUMBER);
    await page.waitForTimeout(4000); // 26k-doc subscription needs a beat
    const partRow = dlg.locator(`div:has(> button:has-text("${PART_NUMBER}"))`).first();
    const partToggle = dlg.locator(`button:has-text("${PART_NUMBER}")`).first();
    const partVisible = await partToggle.isVisible({ timeout: 30000 }).catch(() => false);
    record('service', `lines-add: part ${PART_NUMBER} found in catalog search`, partVisible);
    expect(partVisible).toBe(true);
    await partToggle.click();
    await page.waitForTimeout(600);
    const qtyInput = partRow.locator('input[type="number"]').first();
    if (await qtyInput.isVisible().catch(() => false)) {
        await qtyInput.fill(String(PART_QTY));
    } else {
        await dlg.locator('input[type="number"]').first().fill(String(PART_QTY));
    }
    await page.waitForTimeout(400);
    const partRowText = await partRow.innerText().catch(() => '');
    record('service', 'lines-add: part sell $15 shown', partRowText.includes('$15'), partRowText.replace(/\s+/g, ' ').slice(0, 120));
    await dlg.locator('button:has-text("Next")').click();
    await page.waitForTimeout(1200);

    // Step 4 — review: totals ex GST = 381.36 + 2×15 = 411.36
    const reviewText = (await dlg.innerText()).replace(/\s+/g, ' ');
    const reviewTotalOk = reviewText.includes('411.36');
    record('service', 'totals: create-wizard review total $411.36 ex GST', reviewTotalOk, reviewText.match(/Total[^$]*\$[\d,.]+/)?.[0]);
    await shot(page, 'service-quote-wizard-review');
    expect(reviewTotalOk).toBe(true);
    await dlg.locator('button:has-text("Create quote")').click();
    await page.waitForTimeout(4000);
    } // end !preExisting

    // ── Detail sheet ──
    const card = page.locator('div.cursor-pointer').filter({ hasText: QUOTE_CUSTOMER }).first();
    const cardVisible = await card.isVisible({ timeout: 15000 }).catch(() => false);
    record('service', 'quote-start: created quote card appears on dashboard (status draft)', cardVisible);
    expect(cardVisible).toBe(true);
    await card.click();
    const sheet = page.locator('[role="dialog"]').last();
    await sheet.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(2000);

    // ── Engine service schedule interval via the new picker ──
    const schedSearch = sheet.locator('input[placeholder*="Search by engine model"]');
    const schedAvailable = await schedSearch.isVisible({ timeout: 10000 }).catch(() => false);
    record('service', 'lines-add: engine-schedule picker mounted (189 schedules imported)', schedAvailable);
    expect(schedAvailable).toBe(true);
    await schedSearch.fill(SCHEDULE_ENGINE);
    await page.waitForTimeout(1500);
    const chip = sheet.locator('button').filter({ hasText: new RegExp(`^${SCHEDULE_ENGINE}$`) }).first();
    if (!(await chip.isVisible({ timeout: 8000 }).catch(() => false))) {
        // Debug aid: dump the schedule section so a selector mismatch is visible in the log
        const sectionHtml = await sheet.locator('section').filter({ hasText: /Engine service schedule/i }).innerHTML().catch(() => 'section not found');
        console.log('DEBUG schedule section:', sectionHtml.slice(0, 1500));
        await shot(page, 'debug-schedule-picker');
    }
    await chip.scrollIntoViewIfNeeded().catch(() => {});
    await chip.click({ timeout: 15000 }).catch(async () => {
        // Fallback: role-based exact-name lookup
        await page.getByRole('button', { name: SCHEDULE_ENGINE, exact: true }).first().click({ timeout: 15000 });
    });
    await page.waitForTimeout(1200);
    const intervalRow = sheet.locator('div.flex.items-center.justify-between').filter({ hasText: SCHEDULE_INTERVAL }).filter({ hasText: 'Add' }).first();
    const rowText = (await intervalRow.innerText().catch(() => '')).replace(/\s+/g, ' ');
    const intervalOk = rowText.includes('5.0 hrs') && rowText.includes('$1,047');
    record('service', 'lines-add: F150LC 100h interval shows 5.0 hrs + $1,047', intervalOk, rowText.slice(0, 100));
    await intervalRow.locator('button:has-text("Add")').click();
    await page.waitForTimeout(3000);

    // Line landed as an operation with right hours + sell
    const sheetText = (await sheet.innerText()).replace(/\s+/g, ' ');
    const schedLineOk = sheetText.includes('F150LC — 100h service') && sheetText.includes('5.00 hrs') && sheetText.includes('$1,047');
    record('service', 'lines-add: schedule line landed (F150LC — 100h service · 5.00 hrs · $1,047)', schedLineOk);
    // Totals: 411.36 + 1047 = 1458.36 → sheet renders currency(…) = $1,458
    const totalOk = sheetText.includes('$1,458');
    record('service', 'totals: sheet total $1,458 ex GST (411.36 + 1,047 = 1,458.36)', totalOk,
        sheetText.match(/Total \(excl\. GST\)[^$]*\$[\d,]+/)?.[0]);
    await shot(page, 'service-quote-lines');
    expect(schedLineOk && totalOk).toBe(true);

    // ── Status lifecycle: draft → sent → draft (state machine) ──
    const draftBadge = /draft/i.test(sheetText); // innerText reflects CSS uppercase
    const sentBtn = sheet.locator('button:has-text("→ sent")');
    const cancelledBtn = sheet.locator('button:has-text("→ cancelled")');
    const transitionsOk = draftBadge && await sentBtn.isVisible().catch(() => false) && await cancelledBtn.isVisible().catch(() => false);
    record('service', 'lifecycle: draft offers exactly sent/cancelled transitions', transitionsOk);
    await sentBtn.click();
    await page.waitForTimeout(2500);
    let t = (await sheet.innerText()).replace(/\s+/g, ' ');
    const wentSent = /SENT/i.test(t) && (await sheet.locator('button:has-text("→ draft")').isVisible().catch(() => false));
    record('service', 'lifecycle: draft → sent transition applied (audit-logged), back-transition offered', wentSent);
    await sheet.locator('button:has-text("→ draft")').click();
    await page.waitForTimeout(2500);
    t = (await sheet.innerText()).replace(/\s+/g, ' ');
    record('service', 'lifecycle: sent → draft restores draft', /draft/i.test(t));

    // ── Download PDF ──
    const dlPromise = page.waitForEvent('download', { timeout: 90000 }).catch(() => null);
    await sheet.locator('button:has-text("Download PDF")').click();
    const download = await dlPromise;
    record('service', 'PDF: download event fired', !!download);
    expect(download).not.toBeNull();
    if (download) {
        const pdfPath = path.resolve(OUT, 'service-quote.pdf');
        await download.saveAs(pdfPath);
        const size = fs.statSync(pdfPath).size;
        record('service', 'PDF: file saved', size > 5000, `${(size / 1024).toFixed(0)} KB`);
    }

    // ── Cleanup: delete ALL test quotes with our marker name through the app
    //    (a killed earlier run left a duplicate) ──
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    let deleted = 0;
    for (let i = 0; i < 5; i++) {
        const cardAgain = page.locator('div.cursor-pointer').filter({ hasText: QUOTE_CUSTOMER }).first();
        if (!(await cardAgain.isVisible({ timeout: 4000 }).catch(() => false))) break;
        const trash = cardAgain.locator('button.text-destructive, button:has(svg.lucide-trash-2)').first();
        if (!(await trash.isVisible({ timeout: 4000 }).catch(() => false))) break;
        await trash.click();
        deleted++;
        await page.waitForTimeout(2500);
    }
    const gone = !(await page.locator(`text=${QUOTE_CUSTOMER}`).first().isVisible({ timeout: 3000 }).catch(() => false));
    record('service', 'cleanup: test quote(s) deleted via app UI', gone, `${deleted} deleted`);
});

// ═══════════════════════════════════════════════════════════════════
// 2. PARTS + LABOR inside a boat quote — CL380 Step 5 Fit-Up
// ═══════════════════════════════════════════════════════════════════
test('boat quote — imported fit-up item (parts + install hours) contributes to total', async ({ page }) => {
    test.setTimeout(480_000);
    await login(page);
    page.setDefaultTimeout(25000);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';

    // Open CL380 (bm-email-checklist pattern, with retries)
    let onStep1 = false;
    for (let attempt = 1; attempt <= 4 && !onStep1; attempt++) {
        // NON-org route: the /{orgSlug}/... variant intermittently strips the
        // ?range=&vendor= search params on the quote route (OrgSlugLayout
        // router.replace without search) → "Context Error". Known v1.31
        // ultimate-test finding; still reproduces here.
        await page.goto(`${BASE_URL}/modules/${HIGHFIELD_MODULE_ID}?_t=${Date.now()}`);
        await page.waitForLoadState('domcontentloaded');
        const newQ = page.locator('button:has-text("New Quote"), button:has-text("New Proposal")').first();
        // The module page can sit on its "Synchronizing module" splash for a
        // while — wait for the button properly instead of a fixed 4s.
        if (!(await newQ.waitFor({ state: 'visible', timeout: 45000 }).then(() => true).catch(() => false))) continue;
        await page.waitForTimeout(1500);
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
    record('boat-fitup', 'quote-start: CL380 Step 1 loads', onStep1);
    expect(onStep1).toBe(true);

    // Step 1 minimal picks, then walk to Step 5
    const mat = page.locator('button:has-text("PVC"), button:has-text("Hypalon"), button:has-text("ORCA")').first();
    if (await mat.isVisible().catch(() => false)) { await mat.click().catch(() => {}); await page.waitForTimeout(800); }
    await page.locator('button.rounded-\\[1\\.5rem\\]').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1200);
    for (const wait of [3500, 4500, 4000, 5500]) { // → steps 2, 3, 4, 5
        await page.locator('button:has-text("Next Step")').first().click({ force: true });
        await page.waitForTimeout(wait);
    }
    const onStep5 = await page.locator('text=/Custom Fit-Up/i').first().isVisible({ timeout: 15000 }).catch(() => false);
    record('boat-fitup', 'lines-add: Step 5 Fit-Up section present', onStep5);
    expect(onStep5).toBe(true);

    // Running total before (header package price, ex GST)
    const totalEl = page.locator('div.text-4xl').first();
    const before = money(await totalEl.innerText());
    console.log('total before fit-up:', before);

    // Open custom picker, search the imported item
    const customToggle = page.locator('button:has-text("Custom Fit-Up")').first();
    await customToggle.scrollIntoViewIfNeeded().catch(() => {});
    await customToggle.click();
    await page.waitForTimeout(1500);
    const searchBox = page.locator('input[placeholder*="Search fit-up items"]');
    await searchBox.fill(FITUP_ITEM_NAME);
    await page.waitForTimeout(2500);
    const itemCard = page.locator('button').filter({ hasText: FITUP_ITEM_NAME }).filter({ hasText: '$' }).first();
    const itemFound = await itemCard.isVisible({ timeout: 20000 }).catch(() => false);
    record('boat-fitup', `lines-add: imported fitUpItem "${FITUP_ITEM_NAME}" (0.5 installHours, op LOW-000-00128-001) searchable`, itemFound);
    expect(itemFound).toBe(true);
    const cardText = (await itemCard.innerText()).replace(/\s+/g, ' ');
    record('boat-fitup', 'lines-add: item card shows catalog sell $79', cardText.includes('$79'), cardText.slice(0, 120));
    await itemCard.click();
    await page.waitForTimeout(1500);

    // Selected panel + qty 2
    const selVisible = await page.locator('h4:has-text("Selected fit-up items")').isVisible({ timeout: 8000 }).catch(() => false);
    record('boat-fitup', 'lines-add: Selected fit-up items panel shows the line', selVisible);
    const plusBtn = page.locator('button[aria-label="Increase quantity"]').first();
    await plusBtn.scrollIntoViewIfNeeded().catch(() => {});
    await plusBtn.click();
    await page.waitForTimeout(1500);
    // SelectionRow renders "$158" (line) and "2 × $79" (qty × unit)
    const lineTotalOk = await page.getByText('$158', { exact: true }).first().isVisible({ timeout: 8000 }).catch(() => false);
    const qtyUnitOk = await page.getByText('2 × $79').first().isVisible({ timeout: 5000 }).catch(() => false);
    const lineOk = lineTotalOk && qtyUnitOk;
    record('boat-fitup', 'lines-add: qty 2 line prices 2 × $79 = $158', lineOk, `lineTotal ${lineTotalOk} qtyUnit ${qtyUnitOk}`);

    // Total contribution
    const after = money(await totalEl.innerText());
    const delta = Math.round((after - before) * 100) / 100;
    const deltaOk = Math.abs(delta - FITUP_ITEM_SELL * 2) < 1; // header rounds to whole dollars
    record('boat-fitup', `totals: running package total up by $${FITUP_ITEM_SELL * 2} (before ${before} → after ${after})`, deltaOk, `delta ${delta}`);
    await page.locator('h4:has-text("Selected fit-up items")').scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, 'fitup-parts-line', false);
    await shot(page, 'fitup-step5-full');
    expect(lineOk && deltaOk).toBe(true);
    // No finalize — nothing persisted.
});

// ═══════════════════════════════════════════════════════════════════
// 3. TRAILER / MOTOR / FIT-UP modules — standalone quotability reality
// ═══════════════════════════════════════════════════════════════════
test('trailers + yamaha + fit-up modules — catalog-only vs standalone-quote check', async ({ page }) => {
    test.setTimeout(360_000);
    await login(page);
    page.setDefaultTimeout(25000);

    const surfaces: Array<{ id: string; name: string; shotName: string; expectText: RegExp }> = [
        { id: TRAILERS_MODULE_ID, name: 'Trailers', shotName: 'trailers-module-landing', expectText: /TRAILERS/i },
        { id: TRAILERS_MODULE_ID_2, name: 'Trailers Module', shotName: 'trailers-module-2-landing', expectText: /TRAILERS/i },
        { id: YAMAHA_MODULE_ID, name: 'Yamaha Outboards', shotName: 'yamaha-module-landing', expectText: /MOTOR BRAND|YAMAHA/i },
        { id: FITUP_MODULE_ID, name: 'Fit-Up & Rigging', shotName: 'fitup-module-landing', expectText: /FIT-UP/i },
    ];

    for (const s of surfaces) {
        await gotoModule(page, s.id);
        await page.waitForTimeout(3000);
        const mounted = await page.locator(`text=${s.expectText}`).first().isVisible({ timeout: 15000 }).catch(() => false);
        record('standalone', `${s.name}: module workspace mounts`, mounted);
        // Any quote-start affordance anywhere on the surface?
        const quoteBtns = await page.locator('button:has-text("New Quote"), button:has-text("New Proposal"), a:has-text("New Quote"), button:has-text("Start Quote"), button:has-text("Create Quote")').count();
        record('standalone', `${s.name}: standalone quote-start affordance`, quoteBtns > 0,
            quoteBtns > 0 ? `${quoteBtns} button(s)` : 'none — catalog/admin surface only (GAP: not standalone-quotable)');
        await shot(page, s.shotName);
    }
});

// ═══════════════════════════════════════════════════════════════════
// 4. Per-brand boat quote spot checks — Stabicraft + Haines (MPF brands)
// ═══════════════════════════════════════════════════════════════════
async function brandQuoteSpot(page: Page, opts: {
    area: string; moduleId: string; rangeText: string; modelText: string;
    expectPrice: RegExp | null; priceNote: string; shotPrefix: string;
}) {
    let onStep1 = false;
    for (let attempt = 1; attempt <= 3 && !onStep1; attempt++) {
        await gotoModule(page, opts.moduleId);
        const newQ = page.locator('button:has-text("New Quote"), button:has-text("New Proposal")').first();
        if (!(await newQ.isVisible({ timeout: 10000 }).catch(() => false))) continue;
        await newQ.click({ force: true });
        const dlg = page.locator('[role="dialog"]');
        if (!(await dlg.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false))) continue;
        await page.waitForTimeout(1500);
        await dlg.locator(`.cursor-pointer:has-text("${opts.rangeText}")`).first().click({ force: true });
        await page.waitForTimeout(2000);
        await dlg.locator(`.cursor-pointer:has-text("${opts.modelText}")`).first().click({ force: true });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(6000);
        onStep1 = await page.locator('button:has-text("Next Step")').first().isVisible().catch(() => false);
        if (!onStep1) break; // don't retry into the placeholder repeatedly
    }
    record(opts.area, `quote-start: ${opts.modelText} Step 1 loads with variant`, onStep1);
    await shot(page, `${opts.shotPrefix}-step1`);

    if (!onStep1) {
        // Honest current reality: the quote route is gated to
        // vendor.slug === 'highfield' (src/app/(app)/modules/[id]/quote/
        // [modelId]/page.tsx) — every other brand gets the "Quotation
        // Engine … being developed" placeholder. Assert THAT is what we
        // hit (so this spec stays green while recording the gap), and
        // stop — Steps 1/2 are unreachable.
        const placeholder = await page.locator('text=/Quotation Engine|being developed/i').first().isVisible({ timeout: 10000 }).catch(() => false);
        record(opts.area, 'quote-start GAP root cause: Quotation Engine placeholder (flow gated to Highfield)', placeholder,
            "vendor.slug !== 'highfield' → generic fallback; MPF catalog/pricing imported but no flow consumes it");
        record(opts.area, 'lines-add / totals / PDF', false, 'unreachable behind the placeholder gate');
        expect(placeholder, 'non-Highfield brands must at least reach the documented placeholder').toBe(true);
        return;
    }

    const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    if (opts.expectPrice) {
        const priceOk = opts.expectPrice.test(bodyText);
        record(opts.area, `totals: Step 1 price renders (${opts.priceNote})`, priceOk);
    } else {
        const headerTotal = money(await page.locator('div.text-4xl').first().innerText().catch(() => ''));
        record(opts.area, `totals: Step 1 price (${opts.priceNote})`, headerTotal > 0,
            `header total $${headerTotal} — $0 = MPF source has no Haines pricing (data gap, not app bug)`);
    }

    // Step 2 — factory options
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(4500);
    const step2Text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const inclusionsOk = /Standard Inclusions/i.test(step2Text);
    record(opts.area, 'lines-add: Step 2 renders Standard Inclusions (MPF import)', inclusionsOk);
    // Selectable factory-option cards (priced buttons that aren't nav)
    const foCards = await page.locator('button:has-text("$")').filter({ hasNotText: /Next Step|Back/ }).count();
    record(opts.area, 'lines-add: Step 2 selectable factory-option cards', foCards > 0,
        foCards > 0 ? `${foCards} cards` : 'none — model.factoryOptionCodes imported by MPF wave but has NO consumer in src (optionalFeatures empty) — GAP');
    await shot(page, `${opts.shotPrefix}-step2`);
}

test('stabicraft — quote spot check (Step 1 variant+price, Step 2 FO)', async ({ page }) => {
    test.setTimeout(360_000);
    await login(page);
    page.setDefaultTimeout(25000);
    await brandQuoteSpot(page, {
        area: 'stabicraft',
        moduleId: STABICRAFT_MODULE_ID,
        rangeText: 'MPF Catalog',
        modelText: '1450 Explorer',
        expectPrice: /19,000|20,900/,
        priceNote: '1450 Explorer $19,000 ex GST / $20,900 inc',
        shotPrefix: 'stabicraft',
    });
});

test('haines signature — quote spot check (Step 1 variant+price, Step 2 FO)', async ({ page }) => {
    test.setTimeout(360_000);
    await login(page);
    page.setDefaultTimeout(25000);
    await brandQuoteSpot(page, {
        area: 'haines',
        moduleId: HAINES_MODULE_ID,
        rangeText: 'MPF Catalog',
        modelText: '545F',
        expectPrice: null, // all 9 Haines models carry $0 in the MPF source (verified read-only)
        priceNote: 'Haines MPF pricing is $0 across all models/variants',
        shotPrefix: 'haines',
    });
});
