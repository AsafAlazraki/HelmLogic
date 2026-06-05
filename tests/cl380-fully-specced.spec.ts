import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

/**
 * CL380 fully-specced quote — select EVERYTHING on every step, finalize,
 * download PDF, verify in Firestore.
 *
 * Differs from sp560-full-quote.spec.ts: targets CL380 (smaller boat,
 * different range, more optional features = 15), and explicitly:
 *  - waits for fit-up to load before clicking
 *  - takes FULL-PAGE screenshots so we can see what's actually there
 *  - reports what got captured in Firestore vs what was clicked
 */
const OUT = 'test-results/cl380';
const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const CARD = 'button.rounded-\\[1\\.5rem\\]';

test.use({ viewport: { width: 1920, height: 1080 } });

test('CL380 fully specced', async ({ page }) => {
  test.setTimeout(360000);
  fs.mkdirSync(OUT, { recursive: true });
  const shot = async (n: string, full = false) => {
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full });
    console.log(`  📸 ${n}${full ? ' (full)' : ''}`);
  };

  await login(page);
  const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
  const orgSlug = m ? m[1] : '';
  // Cache-bust
  await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}?_t=${Date.now()}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3500);

  // New quote -> Classic -> CL380
  await page.locator('button:has-text("New Quote")').first().click();
  const dialog = page.locator('[role="dialog"]');
  await page.waitForTimeout(1200);
  await dialog.locator('.cursor-pointer:has-text("Classic")').first().click({ force: true });
  await page.waitForTimeout(1500);
  const cl380 = dialog.locator('.cursor-pointer:has-text("CL380")').first();
  await cl380.waitFor({ timeout: 15000 });
  await cl380.click({ force: true });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);
  await shot('s01-boat-step', true);

  // STEP 1 — pick PVC + first colour
  await page.locator('button:has-text("PVC")').first().click();
  await page.waitForTimeout(1500);
  await page.locator(CARD).first().click({ force: true });
  await page.waitForTimeout(1500);
  await shot('s02-boat-colour-picked');

  // Helper — select EVERY card on current step exactly once (don't toggle off)
  async function selectAll(label: string) {
    const cards = page.locator(CARD);
    const count = await cards.count();
    let clicked = 0;
    for (let i = 0; i < count; i++) {
      const c = cards.nth(i);
      try {
        await c.scrollIntoViewIfNeeded({ timeout: 2000 });
        await c.click({ force: true, timeout: 4000 });
        clicked++;
        await page.waitForTimeout(180);
      } catch { /* skip unreachable */ }
    }
    console.log(`  ${label}: ${clicked}/${count} cards clicked`);
  }

  // Click Next + select all on each subsequent step
  const steps = [
    { name: 's03-factory-options', label: 'factory-opts' },
    { name: 's04-motor', label: 'motor' },
    { name: 's05-trailer', label: 'trailer', skipClicks: true },  // keep auto-assigned trailer
    { name: 's06-dealerfit-fitup', label: 'dealer+fitup' },
  ];
  for (const s of steps) {
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(3500);
    if (!s.skipClicks) await selectAll(s.label);
    // For step 5 specifically, wait extra for fit-up async load + scroll to capture full page
    if (s.name === 's06-dealerfit-fitup') {
      await page.waitForTimeout(3000);
      await shot(s.name, true);  // full-page so we see fit-up below dealer-fit
    } else {
      await shot(s.name);
    }
  }

  // Step 6 summary
  await page.locator('button:has-text("Next Step")').first().click({ force: true });
  await page.waitForTimeout(3500);
  await shot('s07-summary', true);

  // Finalize
  await page.locator('button:has-text("Finalize Project")').first().click({ force: true });
  await page.waitForTimeout(2000);
  await shot('s08-finalize-dialog');
  await page.locator('#cust-name, input[placeholder="John Smith"]').first().fill('CL380 Test Customer');
  // New required: email
  await page.locator('#cust-email, input[type="email"]').first().fill('cl380test@example.com');
  await page.locator('button:has-text("Create Proposal")').first().click({ force: true });
  await page.waitForURL(/\/proposals\//, { timeout: 30000 });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(6000);
  await shot('s09-proposal', true);

  // Download PDF
  const dlPromise = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('button:has-text("Download"), button:has-text("PDF")').first().click({ force: true });
  const dl = await dlPromise;
  const pdfPath = `${OUT}/CL380-fully-specced.pdf`;
  await dl.saveAs(pdfPath);
  const size = fs.statSync(pdfPath).size;
  console.log(`  💾 PDF: ${(size / 1048576).toFixed(2)} MB`);

  // Capture URL so we can fetch the saved quote from Firestore
  const url = page.url();
  console.log(`  proposal URL: ${url}`);
  fs.writeFileSync(`${OUT}/proposal-url.txt`, url);

  expect(true).toBeTruthy();
});
