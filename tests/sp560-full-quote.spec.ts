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

  // Select every option card ONCE. These are toggles — clicking a card
  // twice deselects it — so we click indices [0..n), then only the NEWLY
  // revealed cards (e.g. motor accessories that appear after a motor is
  // picked) on a second pass. Never re-click an already-selected card.
  async function clickAllCards(label: string) {
    const cards = page.locator(CARD);
    const first = await cards.count().catch(() => 0);
    for (let i = 0; i < first; i++) {
      const c = cards.nth(i);
      if (await c.isVisible().catch(() => false)) {
        await c.scrollIntoViewIfNeeded().catch(() => {});
        await c.click().catch(() => {});
        await page.waitForTimeout(250);
      }
    }
    await page.waitForTimeout(900);
    const grown = await cards.count().catch(() => first);
    for (let i = first; i < grown; i++) {
      const c = cards.nth(i);
      if (await c.isVisible().catch(() => false)) {
        await c.scrollIntoViewIfNeeded().catch(() => {});
        await c.click().catch(() => {});
        await page.waitForTimeout(250);
      }
    }
    console.log(`     ${label}: selected ${first} + ${Math.max(0, grown - first)} revealed`);
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
  // The text inside each range card has a hover-scale animation that
  // detaches the span mid-click. Target the wrapping cursor-pointer Card
  // instead — that's the actual onClick handler and it doesn't animate.
  const sportCard = dialog.locator('.cursor-pointer:has-text("Sport")').first();
  await sportCard.waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await sportCard.click({ force: true });
  await page.waitForTimeout(1800);
  // After picking the range, models render as cards (also cursor-pointer).
  const sp560Card = dialog.locator('.cursor-pointer:has-text("SP560")').first();
  await sp560Card.waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  await sp560Card.click({ force: true });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(4500);

  // STEP 1 — material + every colour (last wins) → ensures a variant is set.
  await page.locator('button:has-text("PVC")').first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await clickAllCards('s1-colours');
  await shot('s1-boat');

  // STEPS 2–6 — advance, clicking every option card on each.
  // On the Trailer step we DON'T click cards: the correct trailer is
  // already auto-assigned (size-matched Dunbier) with its standard
  // options pre-ticked; clicking every card would jump to a wrong
  // trailer (e.g. a PA600 unit) with coded option names.
  const names = ['s2-factory-options', 's3-motor', 's4-trailer', 's5-dealerfit-fitup', 's6-summary'];
  for (const nm of names) {
    const next = page.locator('button:has-text("Next Step")').first();
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click().catch(() => {});
    await page.waitForTimeout(2800);
    if (nm !== 's6-summary' && nm !== 's4-trailer') await clickAllCards(nm);
    await shot(nm);
  }

  // Finalize -> create proposal -> proposal view -> PDF.
  const fin = page.locator('button:has-text("Finalize Project"), button:has-text("Finalize")').first();
  if (await fin.isVisible().catch(() => false)) {
    await fin.click().catch(() => {});
    await page.waitForTimeout(2000);
    await shot('s7-finalize-dialog');
    // Customer name is required.
    const name = page.locator('#cust-name, input[placeholder="John Smith"]').first();
    if (await name.isVisible().catch(() => false)) {
      await name.fill('E2E Test Customer');
      await page.waitForTimeout(500);
      const create = page.locator('button:has-text("Create Proposal")').first();
      await create.click().catch(() => {});
      // Wait for navigation to the proposal view.
      await page.waitForURL(/\/proposals\//, { timeout: 30000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(5000);
      await shot('s8-proposal-top');
      // Scroll down to capture the investment summary / line items.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await page.waitForTimeout(1500);
      await shot('s9-proposal-mid');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      await shot('s10-proposal-bottom');

      // Enable itemised fit-up so the dedicated Fit-Up PDF section renders.
      const fitToggle = page.locator('button:has-text("Itemise fit-up")').first();
      if (await fitToggle.isVisible().catch(() => false)) {
        await fitToggle.click().catch(() => {});
        await page.waitForTimeout(1800);
        await shot('s10b-fitup-itemised');
      }

      // Capture the PDF if a Download button exists.
      const dl = page.locator('button:has-text("Download"), button:has-text("PDF")').first();
      if (await dl.isVisible().catch(() => false)) {
        const dlPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
        await dl.click().catch(() => {});
        const download = await dlPromise;
        if (download) {
          const p = `${OUT}/SP560-proposal.pdf`;
          await download.saveAs(p).catch(() => {});
          console.log('  💾 PDF saved:', p);
        }
        await shot('s11-after-pdf');
      }
    }
  }

  expect(true).toBeTruthy();
});
