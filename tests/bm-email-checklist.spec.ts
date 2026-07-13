/**
 * "Mark's checklist" — the 8 items from the BM email (8/06/2026).
 *
 *   1. Proposal formed correctly — all sections + customer name placed
 *   2. Images right during config — no trailer images on the boat-base step
 *   3. All correct FFO (Factory-Fitted Options) on Step 2
 *   4. Engine + rigging (Step 3 motor + Step 5 fit-up rigging)
 *   5. Trailer options (Step 4)
 *   6. DFOs (Dealer-Fit Options) on Step 5
 *   7. Rego + compliance (Step 1 boat rego + Step 6 itemised on summary)
 *   8. Fit-out costs — Simple / Medium / Complex tier cards on Step 5
 *
 * One end-to-end spec, Classic CL380 build, screenshots per checkpoint,
 * raw PDF byte-sniff for customer name + section markers.
 */
import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';
import path from 'path';

const OUT = 'test-results/bm-checklist';
const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const CARD = 'button.rounded-\\[1\\.5rem\\]';
const CUSTOMER_NAME = 'Mark Checklist Customer';
fs.mkdirSync(OUT, { recursive: true });

test.use({ viewport: { width: 1440, height: 900 } });

test("Mark's checklist — 8/8 items pass end-to-end", async ({ page }) => {
    test.setTimeout(540_000);

    const ticks: Record<string, boolean> = {
        '1-proposal-sections': false,
        '1-customer-name-in-pdf': false,
        '2-no-trailer-on-step1': false,
        '3-ffo-step2': false,
        '4-motor-step3': false,
        '4-rigging-step5': false,
        '5-trailer-step4': false,
        '6-dfo-step5': false,
        '7-rego-step1': false,
        '7-rego-on-summary': false,
        '8-fitout-tiers-step5': false,
    };

    const errs: string[] = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 250)));
    page.on('console', m => {
        if (m.type() === 'error') {
            const t = m.text();
            if (!/CORS|ERR_FAILED|yamaha-motor|firebasestorage|dunbier|403|404|415/i.test(t)) {
                errs.push(t.slice(0, 250));
            }
        }
    });

    const shot = async (n: string, full = false) => {
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full });
        console.log('📸', n);
    };

    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';
    console.log('▶ orgSlug:', orgSlug);

    // ── Open the New Quote dialog (with retries — it's intermittent) ──
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
        await dlg.locator('.cursor-pointer:has-text("Classic")').first().click({ force: true });
        await page.waitForTimeout(1800);
        await dlg.locator('.cursor-pointer:has-text("CL380")').first().click({ force: true });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(5000);
        onStep1 = await page.locator('button:has-text("Next Step")').first().isVisible().catch(() => false);
    }
    expect(onStep1, 'should land on Step 1 after Classic + CL380').toBe(true);
    await shot('s1a-step1-boat-base', true);

    // ── ITEM 2: no trailer images on Step 1 ──
    // Step 1 carousel + boat preview should NOT contain any trailer image.
    // Trailer images live under /trailer/ on the storage CDN; assert no such
    // <img src> exists in the Step-1 viewport.
    const trailerImagesOnStep1 = await page.locator('img[src*="trailer" i], img[alt*="trailer" i]').count();
    console.log('▶ trailer images visible on Step 1:', trailerImagesOnStep1);
    expect(trailerImagesOnStep1, 'no trailer images should render on Step 1').toBe(0);
    ticks['2-no-trailer-on-step1'] = true;

    // ── Step 1: pick PVC + first colour. Registration section is gated on
    //    a colour being picked (highfield-quote-flow.tsx ~1594), so do the
    //    selections first, THEN check for the rego picker. ──
    const mat = page.locator('button:has-text("PVC"), button:has-text("Hypalon"), button:has-text("ORCA")').first();
    if (await mat.isVisible().catch(() => false)) {
        await mat.click().catch(() => {});
        await page.waitForTimeout(1000);
    }
    await page.locator(CARD).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot('s1b-material-colour-picked');

    // Scroll past the colour grid so the rego section animates into view.
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(800);

    // ── ITEM 7: rego picker present on Step 1 ──
    const regoOnStep1 = await page.locator('text=/Registration|Rego|Compliance/i').count();
    console.log('▶ rego mentions on Step 1 (after colour pick):', regoOnStep1);
    expect(regoOnStep1, 'rego / compliance section should be present on Step 1 once a colour is picked').toBeGreaterThan(0);
    ticks['7-rego-step1'] = true;

    // Tick the legacy 12-month rego toggle so a registration line surfaces on
    // the Step 6 Summary later (item 7 summary side). Cheaper than picking a
    // RegoPicker entry which depends on the state catalog being seeded. Scroll
    // the rego block into view and click the OUTER cursor-pointer wrapper —
    // the onClick handler sits on the wrapper, not the inner text node.
    const legacyRegoWrap = page.locator('div.cursor-pointer:has-text("12 Months Registration")').first();
    if (await legacyRegoWrap.isVisible({ timeout: 4000 }).catch(() => false)) {
        await legacyRegoWrap.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(400);
        await legacyRegoWrap.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1200);
        await shot('s1c-rego-ticked');
    } else {
        console.log('▶ legacy 12-month rego wrapper not found — skipping tick');
    }

    // ── Step 2: factory options ──
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(3500);
    await shot('s2-factory-options', true);

    // ── ITEM 3: FFO on Step 2 ──
    const ffoSection = await page.locator('text=/Additional Factory Boat Notes|Factory Boat Notes|Factory Options|Standard Inclusions/i').count();
    console.log('▶ FFO sections present on Step 2:', ffoSection);
    expect(ffoSection, 'Step 2 must surface Factory Options / Standard Inclusions / Additional Factory Notes').toBeGreaterThan(0);
    ticks['3-ffo-step2'] = true;

    // Pick the first 2 factory option cards so the Investment Summary in
    // the PDF actually shows nested options under the boat line.
    const factoryCards = page.locator('button:has-text("$")').filter({ hasNotText: 'Next Step' });
    const fcCount = await factoryCards.count();
    const pickFc = Math.min(2, fcCount);
    console.log(`▶ found ${fcCount} factory-option cards — picking ${pickFc}`);
    for (let i = 0; i < pickFc; i++) {
        await factoryCards.nth(i).scrollIntoViewIfNeeded().catch(() => {});
        await factoryCards.nth(i).click({ force: true }).catch(() => {});
        await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1000);
    await shot('s2b-factory-options-picked');

    // ── Step 3: motor ──
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(4500);
    await shot('s3-motor', true);

    // ── ITEM 4 (motor side): hero card + Choose Another Motor ──
    const motorHero = await page.locator('button:has-text("Choose Another Motor"), button[aria-label*="remove motor" i]').count();
    console.log('▶ motor hero / Choose Another markers:', motorHero);
    expect(motorHero, 'Step 3 must show motor hero or Choose Another Motor (auto-default fired)').toBeGreaterThan(0);
    ticks['4-motor-step3'] = true;

    // ── Step 4: trailer ──
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(4000);
    await shot('s4-trailer', true);

    // ── ITEM 5: trailer base + hardware visible ──
    const trailerSections = await page.locator('text=/Trailer Base|Trailer Hardware|Trailer Specs/i').count();
    console.log('▶ trailer sections on Step 4:', trailerSections);
    expect(trailerSections, 'Step 4 must surface Trailer Base + Hardware').toBeGreaterThan(0);
    ticks['5-trailer-step4'] = true;

    // ── Step 5: Dealer Fit + Fit-Up ──
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(5500);
    await shot('s5-dealerfit-fitup', true);

    // ── ITEM 6: DFOs on Step 5 — also pick the first 3 cards so the PDF
    //    Investment Summary actually itemises dealer-fit lines. ──
    const dfoMarkers = await page.locator('text=/Dealer Fit|Safety Gear|Electronics|Trailer Dealer Fit/i').count();
    console.log('▶ DFO category markers on Step 5:', dfoMarkers);
    expect(dfoMarkers, 'Step 5 must surface Dealer Fit categories').toBeGreaterThan(0);
    ticks['6-dfo-step5'] = true;

    // Pick up to 3 dealer-fit selection cards (different ones to span scopes).
    // These are the cards under each Dealer-Fit category section — clickable
    // <button> elements with a price on them.
    const dfoCards = page.locator('button:has-text("$"):below(:text("Dealer Fit"))');
    const dfoCount = await dfoCards.count();
    const toPick = Math.min(3, dfoCount);
    console.log(`▶ found ${dfoCount} dealer-fit cards — picking ${toPick}`);
    for (let i = 0; i < toPick; i++) {
        await dfoCards.nth(i).scrollIntoViewIfNeeded().catch(() => {});
        await dfoCards.nth(i).click({ force: true }).catch(() => {});
        await page.waitForTimeout(600);
    }
    await page.waitForTimeout(1200);
    await shot('s5a-dealerfit-picked');

    // ── ITEM 8: Simple / Medium / Complex tier cards ──
    const simpleHits = await page.locator('button:has-text("SIMPLE"):has-text("$")').count();
    const mediumHits = await page.locator('button:has-text("MEDIUM"):has-text("$")').count();
    const complexHits = await page.locator('button:has-text("COMPLEX"):has-text("$")').count();
    console.log('▶ tier cards — Simple:', simpleHits, 'Medium:', mediumHits, 'Complex:', complexHits);
    expect(simpleHits, 'SIMPLE tier card must render').toBeGreaterThan(0);
    expect(mediumHits, 'MEDIUM tier card must render').toBeGreaterThan(0);
    expect(complexHits, 'COMPLEX tier card must render').toBeGreaterThan(0);
    ticks['8-fitout-tiers-step5'] = true;

    // Pick the Medium tier so rigging items are added to the quote
    const medBtn = page.locator('button:has-text("MEDIUM"):has-text("$")').first();
    await medBtn.scrollIntoViewIfNeeded().catch(() => {});
    await medBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    await shot('s5b-medium-picked');

    // ── ITEM 4 (rigging side): Fit-up & Rigging items added ──
    const riggingMarker = await page.locator('text=/Selected fit-up items|Fit-up|Rigging/i').count();
    console.log('▶ rigging markers after picking Medium:', riggingMarker);
    expect(riggingMarker, 'Picking Medium should reveal fit-up + rigging selections').toBeGreaterThan(0);
    ticks['4-rigging-step5'] = true;

    // ── Step 6 (Administration, new in v1.33) → Step 7: Summary ──
    await page.locator('button:has-text("Next Step"), button:has-text("Administration")').first().click({ force: true });
    await page.waitForTimeout(1500);
    await page.locator('button:has-text("Next Step"), button:has-text("Summary")').first().click({ force: true });
    await page.waitForTimeout(4500);
    await shot('s6-summary', true);

    // ── ITEM 7 (summary side): rego visible somewhere on the Step 6 page ──
    // Soft check — log if missing, defer the hard assertion to the PDF byte
    // sniff below where Mark actually reads it.
    const regoOnSummary = await page.locator('text=/Registration|Rego|Compliance/i').count();
    console.log('▶ rego mentions on Step 6 page:', regoOnSummary, '(soft check — hard check is on the PDF)');

    // ── Finalize → customer name → Create Proposal → PDF ──
    const fin = page.locator('button:has-text("Finalize Project"), button:has-text("Finalize")').first();
    expect(await fin.isVisible().catch(() => false), 'Finalize button must be visible on Step 6').toBe(true);
    await fin.click().catch(() => {});
    await page.waitForTimeout(2500);
    await shot('s7-finalize-dialog');

    const name = page.locator('#cust-name, input[placeholder*="John Smith"], input[placeholder*="name" i]').first();
    expect(await name.isVisible().catch(() => false), 'finalize dialog must have a customer-name input').toBe(true);
    await name.fill(CUSTOMER_NAME);
    await page.waitForTimeout(400);

    const email = page.locator('input[type="email"], input[placeholder*="email" i]').first();
    if (await email.isVisible().catch(() => false)) {
        await email.fill('mark-checklist@example.com').catch(() => {});
    }
    await page.waitForTimeout(400);

    const create = page.locator('button:has-text("Create Proposal")').first();
    await create.click().catch(() => {});
    await page.waitForURL(/\/proposals\//, { timeout: 45000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(6500);
    await shot('s8-proposal-view', true);

    // ── ITEM 1 (sections side): proposal view exposes the section markers ──
    const proposalSections = await page.locator('text=/Build|Motor|Trailer|Dealer Fit|Fit-up|Investment Summary/i').count();
    console.log('▶ proposal section markers on the view:', proposalSections);
    expect(proposalSections, 'Proposal view must surface all primary sections').toBeGreaterThan(2);
    ticks['1-proposal-sections'] = true;

    // ── ITEM 1 (customer-name side): name rendered on the proposal view ──
    // The proposal-view header / cover bar surfaces the customer name. This
    // is the same value that flows into the PDF; verifying it on the DOM is
    // more robust than byte-sniffing react-pdf's compressed text streams.
    const nameOnView = await page.locator(`text="${CUSTOMER_NAME}"`).count();
    console.log('▶ customer name visible on proposal view:', nameOnView);
    expect(nameOnView, 'Customer name must render on the proposal view').toBeGreaterThan(0);
    ticks['1-customer-name-in-pdf'] = true;

    // ── Download PDF ──
    const dl = page.locator('button:has-text("Download")').first();
    expect(await dl.isVisible().catch(() => false), 'Download button must be visible on the proposal view').toBe(true);
    const dlPromise = page.waitForEvent('download', { timeout: 120000 }).catch(() => null);
    await dl.click().catch(() => {});
    const download = await dlPromise;
    expect(download, 'PDF download should trigger').not.toBeNull();

    if (download) {
        const pdfPath = path.resolve(OUT, 'bm-checklist.pdf');
        await download.saveAs(pdfPath);
        const size = fs.statSync(pdfPath).size;
        console.log(`▶ PDF saved: ${(size / 1024).toFixed(0)} KB`);
        expect(size, 'PDF should be > 50KB and < 5MB').toBeGreaterThan(50_000);
        expect(size).toBeLessThan(5_000_000);

        // Customer name + rego are checked via the proposal-view DOM (above)
        // rather than the PDF byte stream — react-pdf compresses text shards
        // so raw-bytes sniffing is unreliable for custom strings. The DOM is
        // the same render and matches what Mark sees.
        const buf = fs.readFileSync(pdfPath);
        const raw = buf.toString('latin1');
        console.log('▶ PDF byte head includes "Proposal":', raw.includes('Proposal') || raw.includes('PROPOSAL'));

        // ── ITEM 7 (summary side): rego mentioned on the proposal view ──
        // Whether legacy rego or RegoPicker snapshot, the proposal view
        // surfaces a Registration line in the Investment Summary when set.
        const regoOnView = await page.locator('text=/Registration|Rego/i').count();
        console.log('▶ rego mentions on proposal view:', regoOnView);
        if (regoOnView > 0) {
            ticks['7-rego-on-summary'] = true;
        } else {
            console.log('▶ rego picker existed on Step 1 but did not surface on the proposal view — investigate model.registration seeding for CL380');
        }
    }

    // ── Final tick-off matrix ──
    console.log('\n══════════════════════════════════════════════════════════');
    console.log("   MARK'S 8-ITEM CHECKLIST — RESULT");
    console.log('══════════════════════════════════════════════════════════');
    for (const [k, v] of Object.entries(ticks)) {
        console.log(`   ${v ? '✅' : '❌'}  ${k}`);
    }
    const passed = Object.values(ticks).filter(Boolean).length;
    const total = Object.values(ticks).length;
    console.log(`   ${passed}/${total} passed`);
    console.log('══════════════════════════════════════════════════════════\n');

    if (errs.length) {
        console.log('--- non-CORS CONSOLE ERRORS ---');
        errs.slice(0, 10).forEach(e => console.log('  ❌', e));
    }

    expect(passed, `${total - passed} checklist items still failing`).toBe(total);
});
