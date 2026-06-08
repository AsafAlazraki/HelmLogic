import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

/**
 * Forensic capture — hard-refreshes, takes FULL-PAGE screenshots of step 5
 * (so we see everything below the fold including any fit-up section), and
 * dumps every visible element + JS console errors so we can see exactly
 * what's there and what's not.
 */
const OUT = 'test-results/forensic';
const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';

test.use({ viewport: { width: 1920, height: 1080 } });

test('forensic: full-page step 5 + console + DOM dump', async ({ page, context }) => {
  test.setTimeout(180000);
  fs.mkdirSync(OUT, { recursive: true });
  await context.clearCookies();
  await context.clearPermissions();
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`);
    if (m.type() === 'warning') warnings.push(`[warn] ${m.text()}`);
  });
  page.on('pageerror', e => errors.push(`[pageerror] ${String(e)}`));

  await login(page);
  const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
  const orgSlug = m ? m[1] : '';
  // Cache-bust the goto
  await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}?_t=${Date.now()}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3500);

  await page.locator('button:has-text("New Quote")').first().click();
  const dialog = page.locator('[role="dialog"]');
  await page.waitForTimeout(1500);
  await dialog.locator('.cursor-pointer:has-text("Sport")').first().click({ force: true });
  await page.waitForTimeout(1500);
  await dialog.locator('.cursor-pointer:has-text("SP560")').first().click({ force: true });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);

  // Step 1 -> select PVC + first colour
  await page.locator('button:has-text("PVC")').first().click();
  await page.waitForTimeout(1500);
  await page.locator('button.rounded-\\[1\\.5rem\\]').first().click({ force: true });
  await page.waitForTimeout(1000);

  // Advance to step 5
  for (let i = 0; i < 4; i++) {
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(3000);
  }

  // Wait for fit-up items to load (selector queries Firestore async)
  await page.waitForTimeout(5000);

  // Take FULL-PAGE screenshot (not viewport) so we see EVERYTHING below the fold
  await page.screenshot({ path: `${OUT}/step5-FULL.png`, fullPage: true });
  console.log(`  📸 step5-FULL.png`);

  // Also scroll to bottom + capture
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/step5-bottom.png` });
  console.log(`  📸 step5-bottom.png`);

  // Dump every text containing "Fit" or "fit-up" anywhere on the page
  const fitTexts = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('*').forEach(el => {
      const t = el.textContent?.trim() || '';
      if ((/fit[- ]?up/i.test(t) || t.startsWith('Fit-Up') || t === 'Fit-Up & Rigging') && t.length < 200) {
        if (el.children.length === 0) out.push(t);
      }
    });
    return Array.from(new Set(out));
  });
  console.log(`  fit-up-related text on page:`, fitTexts);

  // Check page height + scroll position
  const dim = await page.evaluate(() => ({
    scrollH: document.body.scrollHeight,
    viewportH: window.innerHeight,
    scrollTop: window.scrollY,
  }));
  console.log(`  dimensions:`, dim);

  console.log(`  errors: ${errors.length}`);
  errors.slice(0, 10).forEach(e => console.log(`    ${e.slice(0, 200)}`));
  console.log(`  warnings: ${warnings.length}`);

  expect(true).toBeTruthy();
});
