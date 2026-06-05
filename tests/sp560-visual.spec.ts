import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

/**
 * SP560 VISUAL QA at real desktop resolution (1920x1080, actual viewport
 * not full-page) so we judge the layout the way an operator sees it.
 */
const OUT = 'test-results/sp560-visual';
const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';

test.use({ viewport: { width: 1920, height: 1080 } });

async function shot(page: any, name: string) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png` }); // viewport only
  console.log('  📸', name);
}

test('SP560 visual QA (1920)', async ({ page }) => {
  test.setTimeout(240000);
  fs.mkdirSync(OUT, { recursive: true });
  await login(page);
  const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
  const orgSlug = m ? m[1] : '';
  await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3500);

  await page.locator('button:has-text("New Quote"), button:has-text("New Proposal")').first().click();
  await page.waitForTimeout(1500);
  const dialog = page.locator('[role="dialog"]');
  await dialog.getByText('Sport', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await dialog.getByText('SP560', { exact: true }).first().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);
  await shot(page, '01-step1-empty');

  // Select PVC -> colours appear.
  await page.locator('button:has-text("PVC")').first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, '02-step1-material');

  // Click the first colour swatch (buttons that contain an <img> in the
  // right config column). Material buttons have no img, so this targets colours.
  const colourBtns = page.locator('button:has(img)');
  const n = await colourBtns.count();
  console.log('  colour-candidate buttons:', n);
  if (n > 0) { await colourBtns.nth(Math.min(2, n - 1)).click().catch(() => {}); await page.waitForTimeout(2000); }
  await shot(page, '03-step1-colour');

  // Walk steps with viewport screenshots.
  const steps = ['04-factory', '05-motor', '06-trailer', '07-dealerfit-fitup', '08-summary'];
  for (const nm of steps) {
    const next = page.locator('button:has-text("Next Step")').first();
    const enabled = await next.isEnabled().catch(() => false);
    if (!enabled) { await shot(page, nm + '-DISABLED'); break; }
    await next.click().catch(() => {});
    await page.waitForTimeout(3000);
    const pick = page.locator('button:has-text("Select"), button:has-text("Add")').first();
    if (await pick.isVisible().catch(() => false)) { await pick.click().catch(() => {}); await page.waitForTimeout(1800); }
    await shot(page, nm);
  }

  expect(true).toBeTruthy();
});
