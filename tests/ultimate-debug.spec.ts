import { test } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/** Phase 6 debug — why does /quote/sp560 show Context Error? */
test('debug sp560 quote page context', async ({ page }) => {
  test.setTimeout(120000);
  page.on('console', msg => {
    if (['error', 'warning'].includes(msg.type())) console.log('CONSOLE', msg.type(), msg.text().slice(0, 300));
  });
  await login(page);
  const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
  const orgSlug = m ? m[1] : '';
  console.log('orgSlug:', orgSlug, 'url after login:', page.url());

  const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
  const url = `${BASE_URL}/${orgSlug}/modules/${MODULE_ID}/quote/sp560?range=nQ2LE50z9Tbf2uss0Ote&vendor=LafOLpLb6QIFE856TiD4`;
  console.log('direct goto:', url);
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(9000);
  console.log('final url:', page.url());
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log('BODY:', JSON.stringify(bodyText));
  await page.screenshot({ path: 'test-results/ultimate-debug.png' });

  // Also try via module page dialog and log mainVendor presence
  await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(6000);
  const newQ = page.locator('button:has-text("New Quote"), button:has-text("New Proposal")').first();
  if (await newQ.isVisible().catch(() => false)) {
    await newQ.click();
    await page.waitForTimeout(2500);
    const dialog = page.locator('[role="dialog"]');
    const dialogText = await dialog.evaluate(el => (el as HTMLElement).innerText.slice(0, 400)).catch(() => 'NO DIALOG');
    console.log('DIALOG:', JSON.stringify(dialogText));
    const sport = dialog.locator('.cursor-pointer:has-text("Sport")').first();
    await sport.click({ force: true }).catch(e => console.log('sport click fail', e.message));
    await page.waitForTimeout(2500);
    const sp560 = dialog.locator('.cursor-pointer:has-text("SP560")').first();
    await sp560.click({ force: true }).catch(e => console.log('sp560 click fail', e.message));
    await page.waitForTimeout(7000);
    console.log('after dialog nav url:', page.url());
    const bt = await page.evaluate(() => document.body.innerText.slice(0, 400));
    console.log('BODY2:', JSON.stringify(bt));
    await page.screenshot({ path: 'test-results/ultimate-debug2.png' });
  } else {
    console.log('New Quote button not found');
  }
});
