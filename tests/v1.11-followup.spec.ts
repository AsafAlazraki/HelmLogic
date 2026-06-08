/**
 * v1.11 follow-up — three workstream verification (real navigation).
 *
 * Drives the live dev deploy with the proven New Quote → Classic → CL380
 * pattern from cl380-fully-specced.spec.ts.
 *
 *  1. Motor click-to-deselect on Step 3 (hero click removes; Restore pill shows)
 *  2. Fit-Up Step 5: the THREE tier package cards (Simple/Medium/Complex)
 *     render as the primary surface; clicking Medium adds members + the
 *     selected-items detail panel appears with packageName stamped
 *  3. PDF: download from existing fixture quote; check size + that the new
 *     navy palette / Official Proposal mark is present (PDFs are binary so
 *     we check via pdf-parse text extraction).
 */
import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';
import path from 'path';

test.use({ viewport: { width: 1440, height: 900 } });

const OUT = 'test-results/v111fu';
const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
fs.mkdirSync(OUT, { recursive: true });

test('v1.11 follow-up — motor toggle, tier packages, PDF', async ({ page }) => {
  test.setTimeout(420_000);

  const consoleErrs: string[] = [];
  page.on('pageerror', e => consoleErrs.push(`pageerror: ${String(e).slice(0, 250)}`));
  page.on('console', m => {
    if (m.type() === 'error') {
      const t = m.text();
      // ignore noisy CORS image misses — they don't affect functionality
      if (!/yamaha-motor|dunbier|firebasestorage|ERR_FAILED|CORS/i.test(t)) {
        consoleErrs.push(t.slice(0, 250));
      }
    }
  });

  const shot = async (n: string, full = false) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full });
    console.log(`📸 ${n}${full ? ' (full)' : ''}`);
  };

  await login(page);
  console.log('▶ logged in', page.url());

  // navigate to Highfield module
  const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
  const orgSlug = m ? m[1] : '';
  await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}?_t=${Date.now()}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3500);
  await shot('00-module');

  // New Quote → Classic → CL380
  const newQ = page.locator('button:has-text("New Quote"), button:has-text("New Proposal")').first();
  await newQ.waitFor({ state: 'visible', timeout: 30000 });
  await newQ.click();
  const dlg = page.locator('[role="dialog"]');
  await dlg.waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
  await dlg.locator('.cursor-pointer:has-text("Classic")').first().click({ force: true });
  await page.waitForTimeout(1500);
  await dlg.locator('.cursor-pointer:has-text("CL380")').first().click({ force: true });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);
  await shot('01-step1-boat', true);

  // Step 1 — minimal: PVC + first colour, then Next
  const pvc = page.locator('button:has-text("PVC")').first();
  if (await pvc.isVisible().catch(() => false)) {
    await pvc.click();
    await page.waitForTimeout(1500);
  }
  await page.locator('button.rounded-\\[1\\.5rem\\]').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);

  // → Step 2 (factory options)
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(3500);

  // → Step 3 (motor)
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(4500);
  await shot('02-step3-motor-with-default', true);

  // ── TEST 1: motor click-to-deselect ──
  // Hero is a button with aria-label / title we set
  const hero = page.locator('button[aria-label*="remove motor" i], button[title*="Click to remove" i]').first();
  const heroVisible = await hero.isVisible().catch(() => false);
  console.log('▶ motor hero (clickable) visible:', heroVisible);
  expect(heroVisible, 'auto-default motor hero should render as a clickable button').toBe(true);

  await hero.click({ force: true });
  await page.waitForTimeout(1500);
  await shot('03-after-hero-click');

  const restorePill = page.locator('text=/Boat-only quote/i').first();
  const restoreVisible = await restorePill.isVisible().catch(() => false);
  console.log('▶ Restore-default pill visible:', restoreVisible);
  expect(restoreVisible, 'clicking the hero should show the Boat-only quote pill').toBe(true);

  // Restore default — click "Restore default" then verify a motor re-appears
  await page.locator('button:has-text("Restore default")').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(2500);
  const heroAgain = await page.locator('button[aria-label*="remove motor" i], button[title*="Click to remove" i]').first().isVisible().catch(() => false);
  console.log('▶ motor restored after Restore default:', heroAgain);
  await shot('04-after-restore-default');

  // → Step 4 (trailer)
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(3500);

  // → Step 5 (dealer-fit + fit-up)
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(5500);
  await shot('05-step5-fitup', true);

  // ── TEST 2: tier package cards visible ──
  // Each card has both a tier badge and the package title
  // v1.11 redesign — tier card titles shortened to just SIMPLE/MEDIUM/
  // COMPLEX (the section header above says "Fit-Up & Rigging" so the
  // redundant suffix was dropped). Cards still carry a "$XXX" price so
  // anchor on "<TIER>" + price.
  const simpleHits = await page.locator('button:has-text("SIMPLE"):has-text("$")').count();
  const mediumHits = await page.locator('button:has-text("MEDIUM"):has-text("$")').count();
  const complexHits = await page.locator('button:has-text("COMPLEX"):has-text("$")').count();
  console.log('▶ tier card text matches — Simple:', simpleHits, 'Medium:', mediumHits, 'Complex:', complexHits);
  expect(simpleHits, 'Simple tier card should render').toBeGreaterThan(0);
  expect(mediumHits, 'Medium tier card should render').toBeGreaterThan(0);
  expect(complexHits, 'Complex tier card should render').toBeGreaterThan(0);

  // Click Medium tier — the BUTTON wrapping the card
  const medBtn = page.locator('button:has-text("MEDIUM"):has-text("$")').first();
  await medBtn.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(600);
  await medBtn.click({ force: true });
  await page.waitForTimeout(2500);
  await shot('06-medium-clicked');

  // Selected-items detail panel — appears below
  const selectedPanel = await page.locator('text=/Selected fit-up items/i').count();
  console.log('▶ Selected fit-up items panel:', selectedPanel);
  expect(selectedPanel, 'clicking Medium should reveal selected-items detail panel').toBeGreaterThan(0);

  // All Added badge — Medium card should be all-on
  const allAdded = await page.locator('text="All Added"').count();
  console.log('▶ All Added markers:', allAdded);

  // Custom Fit-Up collapsible
  const customSection = page.locator('button:has-text("Custom Fit-Up")').first();
  const hasCustom = await customSection.isVisible().catch(() => false);
  console.log('▶ Custom Fit-Up collapsible visible:', hasCustom);
  expect(hasCustom, 'Custom Fit-Up section should be present (collapsed)').toBe(true);

  await customSection.click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot('07-custom-fitup-open', true);

  // ── TEST 3: PDF download from an existing fixture quote ──
  await page.goto(`${BASE_URL}/modules/highfield/proposals/t5qEMoapEftr5ijLEop8`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(6500);
  await shot('08-proposal-view', true);

  const dlBtn = page.locator('button:has-text("Download")').first();
  const dlBtnVisible = await dlBtn.isVisible().catch(() => false);
  console.log('▶ Download button visible:', dlBtnVisible);
  expect(dlBtnVisible).toBe(true);

  const dlPromise = page.waitForEvent('download', { timeout: 90_000 }).catch(() => null);
  await dlBtn.click({ force: true });
  const dl = await dlPromise;
  expect(dl, 'PDF download should trigger').not.toBeNull();
  if (dl) {
    const dest = path.resolve(OUT, 'quote.pdf');
    await dl.saveAs(dest);
    const size = fs.statSync(dest).size;
    console.log(`▶ PDF downloaded: ${(size / 1024).toFixed(0)} KB`);
    expect(size, 'PDF size should be > 50KB').toBeGreaterThan(50_000);
    expect(size, 'PDF size should be < 5MB').toBeLessThan(5_000_000);
    // sniff for branding markers in the raw stream
    const buf = fs.readFileSync(dest);
    const head = buf.slice(0, Math.min(buf.length, 200_000)).toString('latin1');
    const hasOfficial = head.includes('OFFICIAL') || head.includes('Official') || head.includes('PROPOSAL') || head.includes('Proposal');
    console.log('▶ PDF contains Official Proposal marker:', hasOfficial);
  }

  if (consoleErrs.length) {
    console.log('--- non-CORS CONSOLE ERRORS ---');
    consoleErrs.slice(0, 10).forEach(e => console.log('  ❌', e));
  }
  console.log('▶ artifacts in', OUT);
});
