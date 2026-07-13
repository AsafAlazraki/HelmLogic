import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

/**
 * PHASE 6 — THE ULTIMATE TEST (HelmLogic side).
 *
 * Builds in the real browser the EXACT quote configured on the MPF side
 * (scripts/mpf/ultimate-test/): Highfield SP560 (PVC) W-W-WB — MPF row 829,
 * model code HBS113 — with:
 *   - motor menu slot 1 (NSM Recommended): Yamaha - F90XB
 *   - standard trailer: REDCO Custom / Highfield SP560 Aluminium - TA600-MOB
 *   - dealer fit x2: Tube Covers to suit PVC Boat - 5.6 Mtr
 *                  + VHF Radio - GME GX750B Hideaway with 1.8m Aerial
 *   - rego ON (boat + trailer)
 *   - NO factory options, NO fit-up, price level NSM Retail (default)
 *
 * Screenshots every step, extracts the summary totals from the DOM,
 * finalizes, captures the proposal view + the generated customer PDF.
 */
const OUT = 'test-results/ultimate';
const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const CARD = 'button.rounded-\\[1\\.5rem\\]';

test.use({ viewport: { width: 1920, height: 1080 } });

test('ULTIMATE: SP560 PVC W-W-WB — MPF-identical quote', async ({ page }) => {
  test.setTimeout(420000);
  fs.mkdirSync(OUT, { recursive: true });
  const notes: Record<string, unknown> = {};
  const shot = async (n: string, full = false) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full });
    console.log(`  [shot] ${n}`);
  };

  await login(page);
  // Use the NON-org-scoped module route. The /{orgSlug}/... variant strips
  // ?range=&vendor= during the quote-page handoff (OrgSlugLayout slug
  // correction replaces pathname without search params) -> Context Error.
  // Verified via tests/ultimate-debug2.spec.ts: /modules/... mounts fine.
  await page.goto(`${BASE_URL}/modules/${MODULE_ID}?_t=${Date.now()}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3500);

  // New Quote -> Sport -> SP560. The dialog's model click navigates to
  // /quote/sp560?range=...&vendor=${mainVendor?.id} — if mainVendor hasn't
  // resolved yet the URL carries vendor=undefined and the quote page shows
  // "Context Error". Retry the whole dialog flow (with growing settles)
  // until the quote flow actually mounts.
  let mounted = false;
  for (let attempt = 1; attempt <= 3 && !mounted; attempt++) {
    if (attempt > 1) {
      console.log(`  context error — retry ${attempt}`);
      await page.goto(`${BASE_URL}/modules/${MODULE_ID}?_t=${Date.now()}`);
      await page.waitForLoadState('domcontentloaded');
    }
    await page.waitForTimeout(3000 * attempt);
    const newQ2 = page.locator('button:has-text("New Quote"), button:has-text("New Proposal")').first();
    await newQ2.waitFor({ state: 'visible', timeout: 45000 });
    await newQ2.click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(1500 * attempt);
    const sportCard = dialog.locator('.cursor-pointer:has-text("Sport")').first();
    await sportCard.waitFor({ state: 'visible', timeout: 20000 });
    await sportCard.click({ force: true });
    await page.waitForTimeout(2000 * attempt);
    const sp560 = dialog.locator('.cursor-pointer:has-text("SP560")').first();
    await sp560.waitFor({ timeout: 15000 });
    await sp560.click({ force: true });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(6000);
    const ctxError = await page.locator('text=Context Error').isVisible().catch(() => false);
    const vendorOk = !/vendor=undefined/.test(page.url());
    mounted = !ctxError && vendorOk;
    console.log(`  attempt ${attempt}: url=${page.url()} mounted=${mounted}`);
  }
  await shot('hl-step1-boat', true);

  // ── STEP 1: material PVC + colour W-W-WB ──
  await page.locator('button:has-text("PVC")').first().click();
  await page.waitForTimeout(1800);
  const cardTexts = await page.locator(CARD).allTextContents();
  notes.step1CardTexts = cardTexts;
  console.log('  colour cards:', JSON.stringify(cardTexts));
  // HBS113 = W-W-WB = colour name "White / White / White/Blue" (cards show
  // the colour NAME, not the code — verified in run 1 notes).
  let colourCard = page.locator(CARD).filter({ hasText: /White \/ White \/ White\/Blue/i }).first();
  if (!(await colourCard.isVisible().catch(() => false))) {
    // Fallback: first card — record which one we actually clicked.
    colourCard = page.locator(CARD).first();
    notes.colourFallback = true;
  }
  const chosenColour = await colourCard.textContent();
  notes.chosenColourCard = chosenColour;
  console.log('  picking colour card:', chosenColour);
  await colourCard.scrollIntoViewIfNeeded().catch(() => {});
  await colourCard.click({ force: true });
  await page.waitForTimeout(2000);

  // Rego section appears after a colour is picked. The RegoPicker
  // auto-matches "Recreational Vessel — 4.5m to 8m" ($163 ex GST, QLD
  // Transport catalog). The MPF Registration Module band "4.51m to 6.0m"
  // ($250, doc data-warehouse/qld-transport/regoTypes/mpf-rego-2) was
  // imported in Phase 4 — select IT so both systems quote the same rego.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);
  // The RegoPicker SelectTrigger shows the auto-matched band's name —
  // target it directly by its visible text (role=combobox in shadcn).
  const regoTrigger = page
    .locator('[role="combobox"]:has-text("Recreational Vessel"), [role="combobox"]:has-text("4.5m"), button:has-text("Recreational Vessel — 4.5m to 8m")')
    .first();
  if (await regoTrigger.isVisible().catch(() => false)) {
    await regoTrigger.scrollIntoViewIfNeeded().catch(() => {});
    await regoTrigger.click({ force: true });
    await page.waitForTimeout(1000);
    const mpfBand = page
      .locator('[role="option"]')
      .filter({ hasText: /4\.51m to 6\.0m/ })
      .filter({ hasNotText: /Pensioner|Concession/i })
      .first();
    if (await mpfBand.isVisible({ timeout: 4000 }).catch(() => false)) {
      const optText = await mpfBand.textContent();
      await mpfBand.click({ force: true });
      notes.regoMode = `MPF band selected: ${optText?.slice(0, 80)}`;
    } else {
      const allOpts = await page.locator('[role="option"]').allTextContents().catch(() => []);
      notes.regoOptions = allOpts.slice(0, 30);
      await page.keyboard.press('Escape');
      notes.regoMode = 'MPF band NOT in dropdown — kept auto-match';
    }
  } else {
    notes.regoMode = 'RegoPicker trigger not found — kept auto-match';
  }
  console.log('  rego:', notes.regoMode);
  await page.waitForTimeout(1500);
  await shot('hl-step1-colour-rego', true);

  // ── STEP 2: factory options — select NONE ──
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(3000);
  await shot('hl-step2-factory-options', true);

  // ── STEP 3: motor — NSM menu slot 1: Yamaha - F90XB ──
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(3500);
  // The NSM motor-menu cards render the motor display name; slot 1 carries
  // a Recommended badge. Target an F90XB card that is NOT the XB2 variant.
  const motorCards = page.locator(`${CARD}, .cursor-pointer`).filter({ hasText: /F90XB/ });
  const motorCount = await motorCards.count();
  notes.motorCardCount = motorCount;
  let clickedMotor = false;
  for (let i = 0; i < motorCount; i++) {
    const t = (await motorCards.nth(i).textContent()) || '';
    if (/F90XB(?!2)/.test(t) && !/XB2|White/i.test(t)) {
      await motorCards.nth(i).scrollIntoViewIfNeeded().catch(() => {});
      await motorCards.nth(i).click({ force: true });
      notes.motorCardClicked = t.slice(0, 200);
      clickedMotor = true;
      break;
    }
  }
  if (!clickedMotor && motorCount > 0) {
    await motorCards.first().click({ force: true });
    notes.motorCardClicked = 'first F90XB card (fallback)';
  }
  console.log('  motor clicked:', clickedMotor, notes.motorCardClicked);
  await page.waitForTimeout(2500);
  await shot('hl-step3-motor', true);

  // ── STEP 4: trailer — standard REDCO TA600-MOB ──
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(3500);
  const trailerCard = page.locator(`${CARD}, .cursor-pointer`).filter({ hasText: /TA600-MOB/ }).first();
  if (await trailerCard.isVisible().catch(() => false)) {
    const t = (await trailerCard.textContent()) || '';
    // Only click if it doesn't already show as selected (avoid toggling off).
    const cls = (await trailerCard.getAttribute('class')) || '';
    notes.trailerCardText = t.slice(0, 200);
    notes.trailerCardClass = cls.slice(0, 200);
    if (!/border-primary|ring-|selected|border-blue/i.test(cls)) {
      await trailerCard.scrollIntoViewIfNeeded().catch(() => {});
      await trailerCard.click({ force: true });
      notes.trailerClicked = true;
    } else {
      notes.trailerClicked = 'already selected';
    }
  } else {
    notes.trailerClicked = 'TA600-MOB card not found (auto-assigned?)';
  }
  console.log('  trailer:', notes.trailerClicked);
  await page.waitForTimeout(2000);
  // Trailer rego toggle (if present on this step)
  const trailerRego = page.locator('div.cursor-pointer:has-text("Trailer Registration"), div.cursor-pointer:has-text("12 Months Trailer")').first();
  if (await trailerRego.isVisible().catch(() => false)) {
    const cls = (await trailerRego.getAttribute('class')) || '';
    if (!/border-primary|bg-primary/.test(cls)) {
      await trailerRego.click({ force: true }).catch(() => {});
      notes.trailerRego = 'clicked';
    } else notes.trailerRego = 'already on';
  } else notes.trailerRego = 'toggle not found on step 4';
  await page.waitForTimeout(1500);
  await shot('hl-step4-trailer', true);

  // ── STEP 5: dealer fit — exactly the 2 MPF lines ──
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(3500);
  // The MPF dealer-fit lines render as toggle PILLS in the
  // "Recommended for this boat" strip (NsmDealerFitStrip <button>s),
  // not as rounded-[1.5rem] cards. Click the two MPF-configured lines.
  const wanted = [
    { key: 'tubeCovers', re: /Tube Covers to suit PVC Boat - 5\.6/i },
    { key: 'vhf', re: /GX750B Hideaway/i },
  ];
  for (const w of wanted) {
    const pill = page.locator('button').filter({ hasText: w.re }).first();
    if (await pill.isVisible().catch(() => false)) {
      await pill.scrollIntoViewIfNeeded().catch(() => {});
      await pill.click({ force: true });
      notes[`df-${w.key}`] = ((await pill.textContent()) || '').slice(0, 200);
    } else {
      notes[`df-${w.key}`] = 'PILL NOT FOUND';
    }
    await page.waitForTimeout(1500);
  }
  console.log('  dealer fit:', notes['df-tubeCovers'], '|', notes['df-vhf']);
  await shot('hl-step5-dealerfit', true);

  // ── STEP 6: Administration (new v1.33) → STEP 7: summary ──
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(2000);
  await shot('hl-step6-administration', true);
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(4000);
  await shot('hl-step7-summary', true);

  // Extract the whole summary text + the headline totals.
  const summaryText = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(`${OUT}/hl-summary-text.txt`, summaryText);
  const totalMatch = summaryText.match(/\$([\d,]+(?:\.\d{2})?)\s*inc\.?\s*gst/i);
  notes.hlTotalIncGst = totalMatch ? totalMatch[1] : null;
  const exMatch = summaryText.match(/PACKAGE PRICING \(EXCL\. GST\)\s*\$\s*([\d,]+(?:\.\d{2})?)/i);
  notes.hlTotalExGst = exMatch ? exMatch[1] : null;
  console.log('  HL totals:', notes.hlTotalExGst, 'ex |', notes.hlTotalIncGst, 'inc');

  // Closeup of the totals panel: screenshot the element containing "inc GST".
  const totalEl = page.locator('text=/inc GST/').first();
  if (await totalEl.isVisible().catch(() => false)) {
    const panel = page.locator('div').filter({ has: totalEl }).last();
    await panel.screenshot({ path: `${OUT}/hl-summary-total-closeup.png` }).catch(async () => {
      await totalEl.screenshot({ path: `${OUT}/hl-summary-total-closeup.png` }).catch(() => {});
    });
  }

  // ── Finalize -> proposal -> download the customer PDF ──
  await page.locator('button:has-text("Finalize Project"), button:has-text("Finalize")').first().click({ force: true });
  await page.waitForTimeout(2000);
  await page.locator('#cust-name, input[placeholder="John Smith"]').first().fill('Ultimate Test — MPF Parity');
  const email = page.locator('#cust-email, input[type="email"]').first();
  if (await email.isVisible().catch(() => false)) await email.fill('ultimate-test@example.com');
  await shot('hl-finalize-dialog');
  await page.locator('button:has-text("Create Proposal")').first().click({ force: true });
  await page.waitForURL(/\/proposals\//, { timeout: 30000 });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(6000);
  notes.proposalUrl = page.url();
  await shot('hl-proposal-view', true);

  const proposalText = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(`${OUT}/hl-proposal-text.txt`, proposalText);

  // Customer PDF (server-side react-pdf render can take >60s cold).
  const dlPromise = page.waitForEvent('download', { timeout: 150000 });
  await page.locator('button:has-text("Download"), button:has-text("PDF")').first().click({ force: true });
  const dl = await dlPromise;
  const pdfPath = `${OUT}/hl-customer-quote.pdf`;
  await dl.saveAs(pdfPath);
  notes.pdfBytes = fs.statSync(pdfPath).size;
  console.log(`  PDF: ${((notes.pdfBytes as number) / 1048576).toFixed(2)} MB`);

  fs.writeFileSync(`${OUT}/hl-notes.json`, JSON.stringify(notes, null, 1));
  expect(notes.hlTotalIncGst).toBeTruthy();
});
