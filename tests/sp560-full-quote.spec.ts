import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

/**
 * SP560 MAXIMAL quote — clicks every selectable option on every step to
 * produce a fully-loaded quote (colour, all factory options, motor + all
 * accessories, trailer + all options, all dealer-fit + all fit-up), then
 * screenshots the summary. Registration auto-matches by length/ATM.
 *
 * Option/accessory/dealer-fit/fit-up cards are all Tailwind
 * `rounded-[1.5rem]` buttons; nav buttons are `rounded-xl`. So we click
 * every `rounded-[1.5rem]` card on each step (twice — newly-revealed
 * accessories appear after a motor/trailer is picked).
 */
const OUT = 'test-results/sp560-full';
const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const CARD = 'button.rounded-\\[1\\.5rem\\]';

test.use({ viewport: { width: 1920, height: 1080 } });

test('SP560 maximal full quote (1920)', async ({ page }) => {
  test.setTimeout(300000);
  fs.mkdirSync(OUT, { recursive: true });
  const shot = async (n: string) => { await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('  📸', n); };

  // Click every option card currently on screen (best-effort, re-queried).
  async function clickAllCards(label: string) {
    for (let pass = 0; pass < 2; pass++) {
      const cards = page.locator(CARD);
      const count = await cards.count().catch(() => 0);
      let clicked = 0;
      for (let i = 0; i < count; i++) {
        const c = cards.nth(i);
        if (await c.isVisible().catch(() => false)) {
          await c.scrollIntoViewIfNeeded().catch(() => {});
          await c.click().catch(() => {});
          clicked++;
          await page.waitForTimeout(250);
        }
      }
      await page.waitForTimeout(900);
      console.log(`     ${label} pass${pass}: clicked ${clicked} cards`);
    }
  }

  await login(page);
  const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
  const orgSlug = m ? m[1] : '';
  await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}`);
  await page.waitForLoadState('domcontentloaded');

  // Open New Quote (retry — deploy rebuilds can make first paint slow).
  const newQuote = page.locator('button:has-text("New Quote"), button:has-text("New Proposal")').first();
  await newQuote.waitFor({ state: 'visible', timeout: 45000 });
  await newQuote.click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.getByText('Sport', { exact: true }).first().waitFor({ timeout: 20000 });
  await dialog.getByText('Sport', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  await dialog.getByText('SP560', { exact: true }).first().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(4500);

  // STEP 1 — material + every colour (last wins) → ensures a variant is set.
  await page.locator('button:has-text("PVC")').first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await clickAllCards('s1-colours');
  await shot('s1-boat');

  // STEPS 2–6 — advance, clicking every option card on each.
  const names = ['s2-factory-options', 's3-motor', 's4-trailer', 's5-dealerfit-fitup', 's6-summary'];
  for (const nm of names) {
    const next = page.locator('button:has-text("Next Step")').first();
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click().catch(() => {});
    await page.waitForTimeout(2800);
    if (nm !== 's6-summary') await clickAllCards(nm);
    await shot(nm);
  }

  // Finalize screen (don't submit — just capture the gate).
  const fin = page.locator('button:has-text("Finalize Project"), button:has-text("Finalize")').first();
  if (await fin.isVisible().catch(() => false)) await shot('s7-finalize-ready');

  expect(true).toBeTruthy();
});
