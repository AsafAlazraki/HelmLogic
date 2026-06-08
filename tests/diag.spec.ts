import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

const OUT = 'test-results/diag';
const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';

test.use({ viewport: { width: 1920, height: 1080 } });

test('diag: dump step 5 DOM + full-page screenshot', async ({ page }) => {
  test.setTimeout(180000);
  fs.mkdirSync(OUT, { recursive: true });

  await login(page);
  const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
  const orgSlug = m ? m[1] : '';
  await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3500);

  await page.locator('button:has-text("New Quote")').first().click();
  await page.waitForTimeout(1500);
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator('.cursor-pointer:has-text("Classic")').first().click({ force: true });
  await page.waitForTimeout(1500);
  await dialog.locator('.cursor-pointer:has-text("CL380")').first().click({ force: true });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);

  // step 1 -> 5
  await page.locator('button:has-text("PVC")').first().click();
  await page.waitForTimeout(1200);
  await page.locator('button.rounded-\\[1\\.5rem\\]').first().click({ force: true });
  await page.waitForTimeout(1000);
  for (let i = 0; i < 4; i++) {
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(5000);  // let fit-up async load

  // Dump everything we need
  const dims = await page.evaluate(() => ({
    bodyHeight: document.body.scrollHeight,
    viewportHeight: window.innerHeight,
  }));
  console.log('  dimensions:', dims);

  // Find every element with "fit" or "Fit" in its text
  const fitTexts = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('*').forEach(el => {
      const t = el.textContent?.trim() || '';
      if (/fit/i.test(t) && t.length < 80 && el.children.length === 0) {
        out.push(t);
      }
    });
    return Array.from(new Set(out)).slice(0, 30);
  });
  console.log('  fit-related text:', fitTexts);

  // Was the FitUpQuoteSelector even rendered? Check for any element with our known props
  const hasSelector = await page.evaluate(() => {
    // Look for the loader, the empty-state text, or the header text
    const txt = document.body.innerText;
    return {
      hasFitUpHeader: txt.includes('Fit-Up & Rigging') || txt.includes('Fit-up & Rigging'),
      hasNoItemsMsg: txt.includes('No fit-up items'),
      hasLoader: !!document.querySelector('.animate-spin'),
      orgIdAvailable: document.body.innerText.includes('AcFZVEFA5UDJG2hyetWT'),
    };
  });
  console.log('  selector probe:', hasSelector);

  // Scroll to bottom and take FULL-PAGE screenshot
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/step5-full.png`, fullPage: true });
  console.log('  📸 step5-full.png (full page)');

  // Also check window.console errors
  expect(true).toBeTruthy();
});
