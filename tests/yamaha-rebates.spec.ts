import { test, expect, type Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.34 — Yamaha Rebates end-to-end lifecycle proof, driven entirely
 * through the UI a sales manager would use:
 *
 *  1. Create a rebate on the motor module (F90XB @ the MPF's own campaign
 *     number $15,635, photo-less, offer link, auto-end timer).
 *  2. Boat quote flow Step 3 shows the red band + slashed prices; a
 *     finalized proposal snapshots the rebate + writes the sale record;
 *     the customer PDF carries the red rebate banner.
 *  3. The NEW 3-step motor wizard (Customer → Motor → Review) shows the
 *     rebate chip + slashed price; creating the quote records the sale;
 *     the branded motor PDF carries the banner.
 *  4. Sales history visible under the rebate (both deals).
 *  5. "End now" → Past Rebates + audit trail; prices RESTORED (F90XB
 *     back at $17,643 — the FFR-33 number — with no band).
 *
 * Evidence: tasks/test-evidence/v1.34/rebates/
 */

const MOTOR_MODULE = 'KddayQaREA5tdZzzXjDW';
const BOAT_MODULE = 'M1Yf3R9igpJDxJnOVr6f';
const VENDOR_ID = 'LafOLpLb6QIFE856TiD4';
const RANGE_ID = 'nQ2LE50z9Tbf2uss0Ote';
const SHOTS = 'tasks/test-evidence/v1.34/rebates';

const REBATE_NAME = 'July Repower Rebate';
const REBATE_PRICE = 15635; // BF campaign Sell Price on the live F90XB row
const RETAIL = 17643;

async function gotoRebatesTab(page: Page) {
    await page.goto(`${BASE_URL}/modules/${MOTOR_MODULE}?motorTab=promotions&_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('button', { name: /New Rebate/i }).first().waitFor({ timeout: 40000 });
    await page.waitForTimeout(1500);
}

async function gotoBoatMotorStep(page: Page) {
    await page.goto(`${BASE_URL}/modules/${BOAT_MODULE}/quote/sp560?range=${RANGE_ID}&vendor=${VENDOR_ID}&_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    const hypBtn = page.locator('button.h-32').filter({ hasText: /HYP|Hypalon/i }).first();
    await hypBtn.waitFor({ timeout: 40000 });
    await hypBtn.click({ force: true });
    await page.waitForTimeout(900);
    const colour = page.locator('button').filter({ hasText: /Light Grey \/ White \/ White\/?Blue/i }).first();
    if (await colour.isVisible().catch(() => false)) await colour.click({ force: true });
    await page.waitForTimeout(1200);
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(1500);
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(2500);
    // Motor step — wait for the menu to resolve
    await page.locator('text=/F90XB/').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
}

test.describe.serial('Yamaha Rebates — full lifecycle', () => {
    test('1. create the rebate through the manager UI', async ({ page }) => {
        test.setTimeout(240000);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await login(page);
        await gotoRebatesTab(page);
        await page.screenshot({ path: `${SHOTS}/01-manager-before.png`, fullPage: true });

        // Idempotent: a prior (partial) run may have already created the
        // rebate — the SKU single-rebate guard then rightly blocks a second
        // add. If the card is already live, that IS the desired state.
        // Wait for the list to actually resolve (card OR true empty state)
        // before deciding — the subscription can lag the button render.
        let existing = '';
        for (let i = 0; i < 40; i++) {
            existing = await page.evaluate(() => document.body.innerText);
            if (existing.toUpperCase().includes(REBATE_NAME.toUpperCase()) || /No live rebates/i.test(existing)) break;
            await page.waitForTimeout(500);
        }
        // CSS-uppercased card titles come back transformed from innerText —
        // compare case-insensitively (motors-table-probe lesson).
        if (existing.toUpperCase().includes(REBATE_NAME.toUpperCase())) {
            await page.screenshot({ path: `${SHOTS}/03-active-card.png`, fullPage: true });
            console.log('REBATE ALREADY LIVE — continuing');
            return;
        }

        await page.getByRole('button', { name: /New Rebate/i }).first().click();
        await page.waitForTimeout(800);
        await page.locator('input[placeholder*="Winter Repower"]').fill(REBATE_NAME);
        await page.locator('textarea').first().fill('Factory rebate on selected F90 outboards. Limited time only.');
        await page.locator('input[type="url"]').fill('https://www.yamaha-motor.com.au/offers');
        // Auto-end timer: the SECOND date input is "auto-ends after".
        await page.locator('input[type="date"]').nth(1).fill('2026-07-31');

        // SKU search → add F90XB
        const skuSearch = page.locator('input[placeholder*="Search model code"]');
        await skuSearch.fill('F90XB');
        await page.waitForTimeout(700);
        await page.locator('button').filter({ hasText: /F90XB/ }).first().click();
        await page.waitForTimeout(600);

        // Type the rebate price (the MPF's own campaign number for F90XB).
        const priceInput = page.locator('table input[type="number"]').first();
        await priceInput.fill(String(REBATE_PRICE));
        await page.waitForTimeout(400);
        const dialogText = await page.evaluate(() => document.body.innerText);
        expect(dialogText, 'saving shown').toMatch(/2,008|2008/);
        await page.screenshot({ path: `${SHOTS}/02-create-dialog.png`, fullPage: false });

        await page.getByRole('button', { name: /Go live/i }).click();
        await page.waitForTimeout(6000);
        const after = await page.evaluate(() => document.body.innerText);
        expect(after.toUpperCase(), 'active card visible').toContain(REBATE_NAME.toUpperCase());
        await page.screenshot({ path: `${SHOTS}/03-active-card.png`, fullPage: true });
        console.log('REBATE LIVE');
    });

    test('2. boat quote flow: band + slashed price + finalize + PDF banner', async ({ page }) => {
        test.setTimeout(420000);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await login(page);
        await gotoBoatMotorStep(page);

        const body = await page.evaluate(() => document.body.innerText);
        expect(body, 'red rebate band present').toMatch(/Limited-time factory rebate/i);
        expect(body, 'rebate price shown').toContain('15,635');
        expect(body, 'slashed retail shown').toContain('17,643');
        await page.screenshot({ path: `${SHOTS}/04-boat-motor-step-band.png`, fullPage: true });

        // Pick F90XB → hero shows slashed price
        await page.locator('button, [role="button"]').filter({ hasText: /F90XB(?!2)/ }).first().click({ force: true });
        await page.waitForTimeout(2500);
        const hero = await page.evaluate(() => document.body.innerText);
        expect(hero, 'hero at rebate price').toContain('15,635');
        await page.screenshot({ path: `${SHOTS}/05-boat-hero-rebate.png`, fullPage: false });

        // Walk to Summary and finalize
        for (let i = 0; i < 4; i++) {
            await page.locator('button:has-text("Next Step")').first().click({ force: true });
            await page.waitForTimeout(1800);
        }
        await page.locator('button:has-text("Finalize Project"), button:has-text("Finalize")').first().click({ force: true });
        await page.waitForTimeout(2000);
        await page.locator('#cust-name, input[placeholder="John Smith"]').first().fill('Rebate Proof Boat Buyer');
        const email = page.locator('#cust-email, input[type="email"]').first();
        if (await email.isVisible().catch(() => false)) await email.fill('rebate-proof@nsmarine.com.au');
        await page.locator('button:has-text("Create Proposal")').first().click({ force: true });
        await page.waitForURL(/\/proposals\//, { timeout: 30000 });
        await page.waitForTimeout(5000);
        const dlPromise = page.waitForEvent('download', { timeout: 150000 });
        await page.locator('button:has-text("Download"), button:has-text("PDF")').first().click({ force: true });
        const dl = await dlPromise;
        await dl.saveAs(`${SHOTS}/06-boat-proposal-rebate.pdf`);
        console.log('BOAT PDF with rebate saved');
    });

    test('3. motor wizard: 3 focused steps + rebate + PDF', async ({ page }) => {
        test.setTimeout(420000);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await login(page);
        await page.goto(`${BASE_URL}/modules/${MOTOR_MODULE}?_t=${Date.now()}`);
        await page.waitForLoadState('domcontentloaded');
        const btn = page.getByRole('button', { name: /New Motor Quote/i }).first();
        await btn.waitFor({ timeout: 40000 });
        await btn.click();
        await page.waitForTimeout(4000);

        // Step 1 — Customer (+ sale type). Stepper must show exactly 3 steps.
        const step1 = await page.evaluate(() => document.body.innerText);
        expect(step1, 'motor wizard step count').toMatch(/Step 1 of 3/i);
        expect(step1, 'no service Operations step').not.toMatch(/Step 1 of 4/i);
        await page.locator('input[placeholder="John Smith"]').fill('Rebate Motor Buyer');
        await page.getByRole('button', { name: /Repower/i }).first().click({ force: true });
        await page.waitForTimeout(500);
        await page.locator('input[placeholder*="900hrs"]').first().fill('2015 F115 approx 900hrs').catch(() => {});
        await page.locator('input[type="number"]').last().fill('4500').catch(() => {});
        await page.screenshot({ path: `${SHOTS}/07-motor-step1-customer.png`, fullPage: false });
        await page.getByRole('button', { name: /^Next/i }).click({ force: true });
        await page.waitForTimeout(3000);

        // Step 2 — Motor ONLY (no tabs, no ops, no service parts)
        const step2 = await page.evaluate(() => document.body.innerText);
        expect(step2, 'motor step title').toMatch(/Step 2 of 3: Motor/i);
        expect(step2, 'no trailer tab').not.toMatch(/Trailers/);
        expect(step2, 'no dealer-fit tab').not.toMatch(/Dealer Fit/);
        const search = page.locator('input[placeholder*="Search motors"]').first();
        await search.waitFor({ timeout: 30000 });
        await search.fill('F90XB');
        await page.waitForTimeout(1500);
        const picker = await page.evaluate(() => document.body.innerText);
        expect(picker, 'rebate chip on picker row').toMatch(/Rebate/i);
        expect(picker, 'rebate price in picker').toContain('15,635');
        await page.screenshot({ path: `${SHOTS}/08-motor-step2-picker.png`, fullPage: false });
        const pkgBtn = page.getByRole('button', { name: /Package \$/ }).first();
        if (await pkgBtn.isVisible().catch(() => false)) await pkgBtn.click({ force: true });
        else await page.getByRole('button', { name: /^Add$/i }).first().click({ force: true });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${SHOTS}/09-motor-step2-selected.png`, fullPage: false });
        await page.getByRole('button', { name: /^Next/i }).click({ force: true });
        await page.waitForTimeout(1200);

        // Step 3 — Review (motor language + trade-in + balance payable)
        const review = await page.evaluate(() => document.body.innerText);
        expect(review, 'motor package heading').toMatch(/Motor & package/i);
        expect(review, 'balance payable with trade-in').toMatch(/Balance payable/i);
        await page.screenshot({ path: `${SHOTS}/10-motor-step3-review.png`, fullPage: true });
        await page.getByRole('button', { name: /Create quote/i }).click({ force: true });
        await page.waitForTimeout(5000);

        // Open the created quote → download the branded PDF (rebate banner).
        await page.locator('text=Rebate Motor Buyer').first().click({ force: true });
        await page.waitForTimeout(3000);
        const dlPromise = page.waitForEvent('download', { timeout: 120000 });
        await page.getByRole('button', { name: /Download/i }).first().click({ force: true });
        const dl = await dlPromise;
        await dl.saveAs(`${SHOTS}/11-motor-quote-rebate.pdf`);
        console.log('MOTOR PDF with rebate saved');
    });

    test('4. sales history + end now + past rebates + restoration', async ({ page }) => {
        test.setTimeout(300000);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await login(page);
        await gotoRebatesTab(page);

        // Sales under the active rebate: both deals recorded.
        await page.getByRole('button', { name: /Sales & audit/i }).first().click();
        await page.waitForTimeout(3000);
        const salesText = await page.evaluate(() => document.body.innerText);
        expect(salesText, 'boat deal recorded').toMatch(/Rebate Proof Boat Buyer/i);
        expect(salesText, 'motor deal recorded').toMatch(/Rebate Motor Buyer/i);
        await page.screenshot({ path: `${SHOTS}/12-sales-history.png`, fullPage: false });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);

        // End it now.
        await page.getByRole('button', { name: /End now/i }).first().click();
        await page.waitForTimeout(8000);
        const after = await page.evaluate(() => document.body.innerText);
        expect(after, 'moved to past').toMatch(/Past Rebates/i);
        await page.screenshot({ path: `${SHOTS}/13-past-rebates.png`, fullPage: true });

        // Past detail: sales + audit trail survive.
        await page.locator('button').filter({ hasText: new RegExp(REBATE_NAME, 'i') }).first().click();
        await page.waitForTimeout(3000);
        const detail = await page.evaluate(() => document.body.innerText);
        expect(detail, 'past sales visible').toMatch(/Rebate Proof Boat Buyer/i);
        expect(detail, 'audit trail visible').toMatch(/Audit trail/i);
        expect(detail, 'ended-manually logged').toMatch(/ended manually/i);
        await page.screenshot({ path: `${SHOTS}/14-past-detail-audit.png`, fullPage: false });
        await page.keyboard.press('Escape');

        // Restoration: boat quote flow back at retail, no band.
        await gotoBoatMotorStep(page);
        const restored = await page.evaluate(() => document.body.innerText);
        expect(restored, 'band gone').not.toMatch(/Limited-time factory rebate/i);
        expect(restored, 'retail price back').toContain('17,643');
        await page.screenshot({ path: `${SHOTS}/15-restored.png`, fullPage: true });
        console.log('LIFECYCLE COMPLETE — prices restored');
    });
});
