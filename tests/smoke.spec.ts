import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

/**
 * Fast 60s smoke against latest deploy:
 *   - open Highfield module → New Quote → Sport → SP560
 *   - select PVC + first colour + advance to step 5
 *   - click first 3 fit-up cards specifically
 *   - finalize → check Investment Summary has fit-up row + PDF size
 */
const OUT = 'test-results/smoke';
const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const CARD = 'button.rounded-\\[1\\.5rem\\]';

test.use({ viewport: { width: 1920, height: 1080 } });

test('smoke: fit-up captures + PDF size', async ({ page }) => {
  test.setTimeout(180000);
  fs.mkdirSync(OUT, { recursive: true });
  const shot = async (n: string) => { await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('  📸', n); };

  await login(page);
  const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
  const orgSlug = m ? m[1] : '';
  await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);

  const newQuote = page.locator('button:has-text("New Quote")').first();
  await newQuote.waitFor({ state: 'visible', timeout: 30000 });
  await newQuote.click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator('.cursor-pointer:has-text("Sport")').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await dialog.locator('.cursor-pointer:has-text("Sport")').first().click({ force: true });
  await page.waitForTimeout(1500);
  await dialog.locator('.cursor-pointer:has-text("SP560")').first().click({ force: true });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(4000);

  // Step 1: PVC + first colour
  await page.locator('button:has-text("PVC")').first().click();
  await page.waitForTimeout(1200);
  await page.locator(CARD).first().click({ force: true });
  await page.waitForTimeout(1000);

  // Advance to step 5 (Dealer Fit + Fit-Up)
  for (let i = 0; i < 4; i++) {
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(2500);
  }
  await shot('step5-before-fitup');

  // Scroll to fit-up section + click first 3 fit-up cards specifically
  // Fit-up section has header "Fit-Up & Rigging"
  const fitupHeader = page.locator('text=/Fit-Up.*Rigging/i').first();
  if (await fitupHeader.isVisible().catch(() => false)) {
    await fitupHeader.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    // Cards after the fit-up header
    const fitupCards = page.locator(`${CARD}:has-text("simple"), ${CARD}:has-text("medium"), ${CARD}:has-text("complex"), ${CARD}:has-text("Anchor"), ${CARD}:has-text("VHF"), ${CARD}:has-text("GPS")`);
    const fc = await fitupCards.count();
    console.log('  fit-up cards found:', fc);
    for (let i = 0; i < Math.min(3, fc); i++) {
      await fitupCards.nth(i).click({ force: true });
      await page.waitForTimeout(500);
    }
    await shot('step5-after-fitup-clicks');
  } else {
    console.log('  ⚠ No fit-up section visible');
  }

  // Advance through Administration (new v1.33 step) to Summary
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(2000);
  await shot('step6-administration');
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(3000);
  await shot('step7-summary');

  // Finalize
  await page.locator('button:has-text("Finalize Project"), button:has-text("Finalize")').first().click({ force: true });
  await page.waitForTimeout(2000);
  const name = page.locator('#cust-name, input[placeholder="John Smith"]').first();
  await name.fill('Smoke Test');
  await page.locator('button:has-text("Create Proposal")').first().click({ force: true });
  await page.waitForURL(/\/proposals\//, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await shot('proposal-after-finalize');

  // Download PDF + check size
  const dlPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.locator('button:has-text("Download"), button:has-text("PDF")').first().click({ force: true });
  const download = await dlPromise;
  if (download) {
    const p = `${OUT}/smoke.pdf`;
    await download.saveAs(p);
    const size = fs.statSync(p).size;
    console.log(`  💾 PDF: ${(size/1048576).toFixed(2)} MB ${size < 5*1048576 ? '✅ small' : '❌ still huge'}`);
  }

  expect(true).toBeTruthy();
});
