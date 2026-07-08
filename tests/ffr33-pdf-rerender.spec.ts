import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * FFR-33 — re-render the already-finalized proof quote's customer PDF after
 * the proposal-view convention fix. The quote doc was always correct
 * (totalPriceIncGst 103,734.29, display-sheet-v2); only the view's inline
 * legacy financials copy rendered $103,443. This just re-downloads.
 */
const QUOTE_NUMBER = 'NSM-QE0WHKVFQ';
const SHOTS = 'tasks/test-evidence/ffr33-sp560-proof';

test('proof quote PDF re-render shows the Display-Sheet total', async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);
    await page.goto(`${BASE_URL}/proposals/${QUOTE_NUMBER}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${SHOTS}/proposal-view-fixed.png`, fullPage: false });
    const body = await page.evaluate(() => document.body.innerText);
    console.log('view contains 103,734:', body.includes('103,734'));
    const dlPromise = page.waitForEvent('download', { timeout: 150000 });
    await page.locator('button:has-text("Download"), button:has-text("PDF")').first().click({ force: true });
    const dl = await dlPromise;
    await dl.saveAs(`${SHOTS}/SP560-display-sheet-proof.pdf`);
    console.log('PDF re-saved');
    expect(body.includes('103,734'), 'proposal view shows the Display-Sheet total').toBe(true);
});
