import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';

/**
 * SP560 end-to-end visual walkthrough — navigates like a real user
 * (Module → New Quote → Sport → SP560) and screenshots every step.
 * Direct-linking the quote URL hard-fails (CONTEXT ERROR), so we click
 * through the QuoteInitialization dialog the way a salesperson does.
 */
const OUT = 'test-results/sp560';

async function shot(page: any, name: string) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log('  📸', name, '→', page.url());
}

test('SP560 e2e walkthrough (screenshots)', async ({ page }) => {
  test.setTimeout(240000);
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await login(page);
  const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
  const orgSlug = m ? m[1] : '';
  // Navigate straight to the Highfield module workspace.
  await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(4000);
  await shot(page, '00-module');

  // Find the New Quote button — try tabs (Quotes/Proposals/Dashboard) then
  // any New-Quote/New-Proposal button across the module.
  let newQuote = page.locator('button:has-text("New Quote"), button:has-text("New Proposal"), button:has-text("Create Quote")').first();
  if (!(await newQuote.isVisible().catch(() => false))) {
    for (const tab of ['Quotes', 'Proposals', 'Dashboard', 'Catalog']) {
      const t = page.getByRole('tab', { name: tab }).first();
      if (await t.isVisible().catch(() => false)) { await t.click(); await page.waitForTimeout(2000); }
      newQuote = page.locator('button:has-text("New Quote"), button:has-text("New Proposal"), button:has-text("Create Quote")').first();
      if (await newQuote.isVisible().catch(() => false)) break;
    }
  }
  if (!(await newQuote.isVisible().catch(() => false))) {
    await shot(page, '01-no-newquote-button');
    throw new Error('New Quote button not found on module');
  }
  await newQuote.click();
  await page.waitForTimeout(1500);
  await shot(page, '01-quote-dialog');

  // Pick Sport range, then SP560.
  const dialog = page.locator('[role="dialog"]');
  await dialog.getByText('Sport', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  const search = dialog.locator('input').first();
  if (await search.isVisible().catch(() => false)) { await search.fill('SP560'); await page.waitForTimeout(1000); }
  await shot(page, '02-model-pick');
  await dialog.getByText('SP560', { exact: true }).first().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);
  await shot(page, '03-step1-config');

  // Walk the steps. On each, opportunistically click a motor/option/fit-up
  // tile to populate the build, then screenshot.
  const stepNames = ['04-step2', '05-step3', '06-step4', '07-step5', '08-step6'];
  for (const nm of stepNames) {
    const next = page.locator('button:has-text("Next Step"), button:has-text("Next")').first();
    if (!(await next.isEnabled().catch(() => false))) break;
    await next.click().catch(() => {});
    await page.waitForTimeout(2800);
    // engage first selectable card on this step (motor/dealer-fit/fit-up)
    const pick = page.locator('button:has-text("Select"), button:has-text("Add")').first();
    if (await pick.isVisible().catch(() => false)) { await pick.click().catch(() => {}); await page.waitForTimeout(1500); }
    await shot(page, nm);
  }

  console.log('  page errors:', errors.length);
  errors.slice(0, 6).forEach((e) => console.log('   ⚠', e.slice(0, 140)));

  const built = page.locator('text=/Step|Material|Motor|Trailer|Dealer Fit|Fit-Up|Registration|Summary|Finalize/i').first();
  expect(await built.isVisible().catch(() => false)).toBeTruthy();
});
