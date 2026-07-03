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
  const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
  const orgSlug = m ? m[1] : '';
  await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}?_t=${Date.now()}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3500);

  // New Quote -> Sport -> SP560
  const newQ = page.locator('button:has-text("New Quote"), button:has-text("New Proposal")').first();
  await newQ.waitFor({ state: 'visible', timeout: 45000 });
  await newQ.click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
  const sportCard = dialog.locator('.cursor-pointer:has-text("Sport")').first();
  await sportCard.waitFor({ state: 'visible', timeout: 20000 });
  await sportCard.click({ force: true });
  await page.waitForTimeout(1800);
  const sp560 = dialog.locator('.cursor-pointer:has-text("SP560")').first();
  await sp560.waitFor({ timeout: 15000 });
  await sp560.click({ force: true });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);
  await shot('hl-step1-boat', true);

  // ── STEP 1: material PVC + colour W-W-WB ──
  await page.locator('button:has-text("PVC")').first().click();
  await page.waitForTimeout(1800);
  const cardTexts = await page.locator(CARD).allTextContents();
  notes.step1CardTexts = cardTexts;
  console.log('  colour cards:', JSON.stringify(cardTexts));
  // Prefer the W-W-WB colour card (colour code or name containing it).
  let colourCard = page.locator(CARD).filter({ hasText: /W-W-WB/i }).first();
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

  // Rego section appears after a colour is picked. Prefer the band picker
  // ("4.51m to 6.0m"), fall back to the legacy 12-months toggle.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1200);
  const bandOption = page.locator('button, [role="option"], .cursor-pointer').filter({ hasText: /4\.51m to 6\.0m/ }).first();
  if (await bandOption.isVisible().catch(() => false)) {
    await bandOption.click({ force: true }).catch(() => {});
    notes.regoMode = 'band-picker 4.51m to 6.0m';
  } else {
    const legacyRego = page.locator('div.cursor-pointer:has-text("12 Months Registration")').first();
    if (await legacyRego.isVisible({ timeout: 4000 }).catch(() => false)) {
      await legacyRego.scrollIntoViewIfNeeded().catch(() => {});
      await legacyRego.click({ force: true }).catch(() => {});
      notes.regoMode = 'legacy 12-months toggle';
    } else {
      notes.regoMode = 'NOT FOUND on step 1';
    }
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
  const wanted = [
    { key: 'tubeCovers', re: /Tube Covers to suit PVC Boat - 5\.6/i },
    { key: 'vhf', re: /GX750B Hideaway/i },
  ];
  for (const w of wanted) {
    const card = page.locator(`${CARD}, .cursor-pointer`).filter({ hasText: w.re }).first();
    if (await card.isVisible().catch(() => false)) {
      await card.scrollIntoViewIfNeeded().catch(() => {});
      await card.click({ force: true });
      notes[`df-${w.key}`] = ((await card.textContent()) || '').slice(0, 200);
    } else {
      // search the page for the text anywhere (may need scrolling/tabs)
      notes[`df-${w.key}`] = 'CARD NOT FOUND';
    }
    await page.waitForTimeout(1200);
  }
  console.log('  dealer fit:', notes['df-tubeCovers'], '|', notes['df-vhf']);
  await shot('hl-step5-dealerfit', true);

  // ── STEP 6: summary ──
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(4000);
  await shot('hl-step6-summary', true);

  // Extract the whole summary text + the headline totals.
  const summaryText = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(`${OUT}/hl-summary-text.txt`, summaryText);
  const totalMatch = summaryText.match(/\$([\d,]+)\s*inc GST/);
  notes.hlTotalIncGst = totalMatch ? totalMatch[1] : null;
  console.log('  HL total inc GST:', notes.hlTotalIncGst);

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
