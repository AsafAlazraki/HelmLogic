/**
 * Counter-quote verification (build.counter-quotes, decision.standalone-quotes).
 *
 * Asaf's decision: extend Service Quoting into "Service & Counter Quotes" so
 * a standalone quote (NO boat) can carry CATALOG items — motors, trailers,
 * dealer-fit options, rigging kits — alongside operations + parts.
 *
 * This spec drives the REAL browser (production build on localhost:9002,
 * live Firestore) end-to-end:
 *
 *   1. Create a standalone quote via the wizard adding ONE of each through
 *      the new CatalogItemPicker:
 *        - motor F90XB           @ NSM Retail  $17,643
 *        - dealer-fit option     @ Act Sell    $1,909
 *        - rigging kit           @ sellExGst   $1,019 + install labour
 *          (4h × $130.09 = $520.36 — MPF installLabour, op-shaped line)
 *   2. Assert the ex-GST total EXACTLY (21,091.36) in the review step.
 *   3. Open the detail sheet, assert lines + total, download the PDF.
 *   4. Assert the PDF grand total EXACTLY = ceil(sum × 1.1) = $23,201 via
 *      pdftotext; render the page via pdftoppm.
 *   5. Delete the test quote through the app UI (cleanup).
 *
 * Fixtures harvested read-only from live Firestore 2026-07-03 (scripts/mpf/_fs.py):
 *   motor  data-warehouse/mRAzkE8PUX8GMHELCvJo/dataSets/FQ5uTMyUorrJPlpbWIY8/rows/08cFLckF5D9wPR66Djf2
 *          MODEL CODE F90XB · NSM Retail 17643
 *   dfo    organisations/AcFZVEFA5UDJG2hyetWT/dealerFitSelections/6x3-0000l-15-05
 *          "Mech Rigging Kit - 6X3 Concealed Mount (No Gauges), 5m Harness, 15' Cables & Filter" · Act Sell 1909
 *   kit    organisations/AcFZVEFA5UDJG2hyetWT/riggingKits/6x0-6y52r-se-50
 *          "Rigging Set - Std Gauges (Concealed) - 6X0-6Y52R-SE-50" · sell 1019 · installHours 4 · installLabour 520.36
 *
 * Evidence: tasks/test-evidence/module-quotes/counter-*.png (+ counter-quote.pdf)
 * Firestore write footprint: ONE test quote created + deleted through the app UI.
 */
import { test, expect, type Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUT = 'tasks/test-evidence/module-quotes';
fs.mkdirSync(OUT, { recursive: true });

const SERVICE_MODULE_ID = 'service-module';
const QUOTE_CUSTOMER = 'HL TEST Counter Quote (safe to delete)';

// ── Fixtures (read-only harvest, live Firestore, 2026-07-03) ──
const MOTOR_CODE = 'F90XB';
const MOTOR_SELL = 17643;                 // 'NSM Retail' (hull_cash)
const DFO_SEARCH = 'Mount (No Gauges), 5m Harness';
const DFO_NAME_FRAG = '6X3 Concealed Mount';
const DFO_SELL = 1909;                    // items[0].data['Act Sell']
const KIT_SEARCH = '6Y52R-SE-50';
const KIT_NAME_FRAG = 'Rigging Set - Std Gauges (Concealed)';
const KIT_SELL = 1019;                    // sellPriceExclGst
const KIT_INSTALL_HOURS = 4;
const KIT_INSTALL_LABOUR = 520.36;        // installLabour (4h × $130.09)

const TOTAL_EX = MOTOR_SELL + DFO_SELL + KIT_SELL + KIT_INSTALL_LABOUR; // 21091.36
const TOTAL_INC = Math.ceil(TOTAL_EX * 1.1);                            // 23201

async function shot(page: Page, name: string, full = true) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }).catch(() => {});
    console.log('shot:', name);
}

test.use({ viewport: { width: 1440, height: 900 } });

test('counter quote — standalone motor + dealer-fit + rigging kit, exact totals, PDF, cleanup', async ({ page }) => {
    test.setTimeout(600_000);
    expect(TOTAL_EX).toBeCloseTo(21091.36, 2);
    expect(TOTAL_INC).toBe(23201);

    await login(page);
    page.setDefaultTimeout(30000);
    await page.goto(`${BASE_URL}/modules/${SERVICE_MODULE_ID}?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(6000);

    // Dashboard mounts with the new title
    await expect(page.locator('text=/Service & Counter Quotes/i').first()).toBeVisible({ timeout: 20000 });
    await shot(page, 'counter-dashboard-title');

    // Leftover from a prior partial run? Delete before starting fresh.
    await page.waitForTimeout(3000); // let the quotes subscription land
    for (let i = 0; i < 4; i++) {
        const stale = page.locator('div.cursor-pointer').filter({ hasText: QUOTE_CUSTOMER }).first();
        if (!(await stale.isVisible({ timeout: 5000 }).catch(() => false))) break;
        await stale.locator('button.text-destructive, button:has(svg.lucide-trash-2)').first().click();
        await page.waitForTimeout(2500);
    }

    // ── Wizard ──
    await page.locator('button:has-text("New service quote")').first().click();
    const dlg = page.locator('[role="dialog"]');
    await dlg.waitFor({ state: 'visible', timeout: 10000 });

    // Step 1 — customer only. NO vehicle/boat: this is the standalone case.
    await dlg.locator('input[placeholder="John Smith"]').fill(QUOTE_CUSTOMER);
    await dlg.locator('button:has-text("Next")').click();
    await page.waitForTimeout(1500);

    // Step 2 — Operations: none (catalog-only quote). Straight through.
    await dlg.locator('button:has-text("Next")').click();
    await page.waitForTimeout(1500);

    // Step 3 — Parts: skip serviceParts, use the new Catalog items picker.
    await expect(dlg.locator('text=/Catalog items/i').first()).toBeVisible({ timeout: 15000 });

    // — Motor (Motors tab is the default; lazy-load fires on mount) —
    const motorSearch = dlg.locator('input[placeholder*="Search motors"]');
    await motorSearch.waitFor({ state: 'visible', timeout: 60000 }); // waits out the loading state
    await motorSearch.fill(MOTOR_CODE);
    await page.waitForTimeout(1200);
    const motorRow = dlg.locator('div.flex.items-center.justify-between').filter({ hasText: MOTOR_CODE }).filter({ hasText: 'Add' }).first();
    await expect(motorRow).toBeVisible({ timeout: 15000 });
    const motorRowText = (await motorRow.innerText()).replace(/\s+/g, ' ');
    expect(motorRowText, `motor row must price at NSM Retail $${MOTOR_SELL.toLocaleString()}`).toContain('$17,643');
    await shot(page, 'counter-picker-motor', false);
    await motorRow.locator('button:has-text("Add")').click();
    await page.waitForTimeout(800);

    // — Dealer Fit —
    await dlg.locator('button:has-text("Dealer Fit")').first().click();
    const dfoSearch = dlg.locator('input[placeholder*="Search dealer fit"]');
    await dfoSearch.waitFor({ state: 'visible', timeout: 90000 }); // 1,791-doc getDocs
    await dfoSearch.fill(DFO_SEARCH);
    await page.waitForTimeout(1200);
    const dfoRow = dlg.locator('div.flex.items-center.justify-between').filter({ hasText: DFO_NAME_FRAG }).filter({ hasText: 'Add' }).first();
    await expect(dfoRow).toBeVisible({ timeout: 15000 });
    const dfoRowText = (await dfoRow.innerText()).replace(/\s+/g, ' ');
    expect(dfoRowText, `dealer-fit row must price at Act Sell $${DFO_SELL.toLocaleString()}`).toContain('$1,909');
    await shot(page, 'counter-picker-dfo', false);
    await dfoRow.locator('button:has-text("Add")').click();
    await page.waitForTimeout(800);

    // — Rigging kit (price + install labour) —
    await dlg.locator('button:has-text("Rigging Kits")').first().click();
    const kitSearch = dlg.locator('input[placeholder*="Search rigging kits"]');
    await kitSearch.waitFor({ state: 'visible', timeout: 90000 });
    await kitSearch.fill(KIT_SEARCH);
    await page.waitForTimeout(1200);
    const kitRow = dlg.locator('div.flex.items-center.justify-between').filter({ hasText: KIT_NAME_FRAG }).filter({ hasText: 'Add' }).first();
    await expect(kitRow).toBeVisible({ timeout: 15000 });
    const kitRowText = (await kitRow.innerText()).replace(/\s+/g, ' ');
    expect(kitRowText, `kit row must price at $${KIT_SELL.toLocaleString()}`).toContain('$1,019');
    expect(kitRowText, 'kit row must surface install hours + labour').toMatch(/install 4h.*\$520/);
    await shot(page, 'counter-picker-rigging', false);
    await kitRow.locator('button:has-text("Add")').click();
    await page.waitForTimeout(1200);
    await dlg.locator('button:has-text("Next")').click();
    await page.waitForTimeout(1500);

    // Step 4 — Review: exact ex-GST total + all four lines.
    const reviewText = (await dlg.innerText()).replace(/\s+/g, ' ');
    expect(reviewText, 'install labour op line (hours + shop rate) must be on the quote').toContain('Install: Rigging Set');
    expect(reviewText).toContain('F90XB');
    expect(reviewText).toContain(DFO_NAME_FRAG);
    expect(reviewText, `review total must be EXACTLY $21,091.36 (${MOTOR_SELL} + ${DFO_SELL} + ${KIT_SELL} + ${KIT_INSTALL_LABOUR})`).toContain('21,091.36');
    await shot(page, 'counter-review');
    await dlg.locator('button:has-text("Create quote")').click();
    await page.waitForTimeout(4000);

    // ── Detail sheet ──
    const card = page.locator('div.cursor-pointer').filter({ hasText: QUOTE_CUSTOMER }).first();
    await expect(card).toBeVisible({ timeout: 15000 });
    const cardText = (await card.innerText()).replace(/\s+/g, ' ');
    expect(cardText, 'card: 1 op (install labour) · 3 parts (motor + dfo + kit)').toContain('1 ops · 3 parts');
    expect(cardText).toContain('21,091.36');
    // Click the card's NAME area — the footer row (status select + trash)
    // stopPropagations, and a default center-click can land inside it.
    await card.click({ position: { x: 40, y: 15 } });
    const sheet = page.locator('[role="dialog"]').last();
    await sheet.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(2500);

    const sheetText = (await sheet.innerText()).replace(/\s+/g, ' ');
    // innerText reflects CSS-uppercased section headers (MODULE_QUOTES ² lesson)
    expect(sheetText).toMatch(/Parts & Catalog Items · 3/i);
    expect(sheetText).toContain('Install: Rigging Set');
    expect(sheetText).toMatch(/4\.00 hrs @ \$130(\.09)?\/hr/);
    expect(sheetText, 'sheet total (currency, 0dp) must be $21,091').toContain('$21,091');
    // Type tags on catalog lines
    expect(sheetText).toContain('MOTOR');
    expect(sheetText).toContain('DEALER FIT');
    expect(sheetText).toContain('RIGGING KIT');
    // Catalog picker also mounts in the sheet (next to the engine-schedule picker)
    await expect(sheet.locator('text=/Catalog items/i').first()).toBeVisible();
    await shot(page, 'counter-detail-sheet');

    // ── PDF: download, extract text, assert GST-ceil grand total EXACTLY ──
    const dlPromise = page.waitForEvent('download', { timeout: 90000 });
    await sheet.locator('button:has-text("Download PDF")').click();
    const download = await dlPromise;
    const pdfPath = path.resolve(OUT, 'counter-quote.pdf');
    await download.saveAs(pdfPath);
    expect(fs.statSync(pdfPath).size).toBeGreaterThan(2000);

    const pdfText = execSync(`pdftotext "${pdfPath}" -`).toString().replace(/\s+/g, ' ');
    console.log('PDF text:', pdfText.slice(0, 1200));
    // Letter-spaced headings extract as "S E RV I C E Q U OT E" — strip ALL
    // whitespace before matching so assertions are layout-independent.
    const pdfFlat = pdfText.replace(/\s+/g, '');
    expect(pdfFlat).toContain('SERVICEQUOTE');
    expect(pdfFlat.toUpperCase()).toContain('PARTS&CATALOGITEMS'); // itemType-aware section title
    expect(pdfFlat).toContain('MOTOR');       // type tag on the motor line
    expect(pdfFlat).toContain('DEALERFIT');   // type tag on the dealer-fit line
    expect(pdfFlat).toContain('F90XB');
    expect(pdfFlat).toContain('Install:RiggingSet');
    expect(pdfFlat, 'subtotal ex GST $21,091').toContain('$21,091');
    expect(pdfFlat, `grand total incl GST must be EXACTLY $${TOTAL_INC.toLocaleString()} = ceil(21,091.36 × 1.1)`).toContain('$23,201');

    execSync(`pdftoppm -png -r 80 -f 1 -l 1 "${pdfPath}" "${path.resolve(OUT, 'counter-quote-pdf-page')}"`);
    const rendered = fs.readdirSync(OUT).find(f => f.startsWith('counter-quote-pdf-page'));
    expect(rendered, 'pdftoppm must render page 1').toBeTruthy();

    // ── Cleanup: delete the test quote through the app UI ──
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    for (let i = 0; i < 4; i++) {
        const again = page.locator('div.cursor-pointer').filter({ hasText: QUOTE_CUSTOMER }).first();
        if (!(await again.isVisible({ timeout: 3000 }).catch(() => false))) break;
        await again.locator('button.text-destructive, button:has(svg.lucide-trash-2)').first().click();
        await page.waitForTimeout(2500);
    }
    const gone = !(await page.locator(`text=${QUOTE_CUSTOMER}`).first().isVisible({ timeout: 3000 }).catch(() => false));
    expect(gone, 'test quote must be deleted (Firestore verified post-run via REST)').toBe(true);
    await shot(page, 'counter-cleanup-dashboard');
});
