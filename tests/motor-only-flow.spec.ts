import { test, expect, type Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.34 — Motor-only FULL quote flow (Asaf: "same quote style as boats,
 * same damn one"). Proves the real thing end-to-end in the browser:
 *
 *   Yamaha module → New Motor Quote → the boat flow engine at the Motor
 *   step (search over the whole MPF catalogue) → pick F90XB → per-row
 *   package lines (rigging/prop standards + its own Install - Sell line)
 *   → Dealer Fit → Administration (no boat/trailer rego) → Summary (no
 *   Base Vessel card) → Finalize → proposal page (motor hero) → the
 *   proposal-style PDF with the Yamaha-branded motor cover.
 *
 * Evidence: tasks/test-evidence/v1.34/motor-only-flow/
 */

const MOTOR_MODULE = 'KddayQaREA5tdZzzXjDW';
const SHOTS = 'tasks/test-evidence/v1.34/motor-only-flow';
const CUSTOMER = 'Motor Only Flow Proof';

async function clickNext(page: Page) {
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(1800);
}

async function shot(page: Page, name: string, fullPage = true) {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
    console.log(`SHOT ${name}`);
}

test('motor-only flow — full proposal-style walk', async ({ page }) => {
    test.setTimeout(480000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);

    // ── Entry: Yamaha module header button ──
    await page.goto(`${BASE_URL}/modules/${MOTOR_MODULE}?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    const entry = page.getByRole('button', { name: /New Motor Quote/i }).first();
    await entry.waitFor({ timeout: 40000 });
    await entry.click();
    await page.waitForURL(/\/motor-quote/, { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');

    // ── Step 1 (Motor): full-screen flow, 4-step stepper, catalogue search ──
    const search = page.locator('input[placeholder*="Search motors"]').first();
    await search.waitFor({ timeout: 45000 });
    const header = await page.evaluate(() => document.body.innerText);
    expect(header, '4-step flow').toMatch(/Step 1 of 4/i);
    expect(header, 'motor step label').toMatch(/MOTOR/);
    expect(header, 'no boat base step').not.toMatch(/BOAT BASE/);
    expect(header, 'no trailer step').not.toMatch(/TRAILER\b/);
    await shot(page, '01-motor-step-search');

    await search.fill('F90XB');
    await page.waitForTimeout(1500);
    await shot(page, '02-motor-step-results');

    // Pick the F90XB card from the grid — target the card's name <p>
    // exactly (the button-level filter matched an unstable ancestor).
    await page.locator('p', { hasText: /^Yamaha - F90XB$/i }).first().click({ force: true });
    await page.waitForTimeout(2500);
    const picked = await page.evaluate(() => document.body.innerText);
    expect(picked, 'motor price (MPF NSM Retail)').toContain('17,643');
    expect(picked, 'per-row install line present').toMatch(/Install Motor/i);
    await shot(page, '03-motor-selected-package');

    // Running total must be INC-GST money: motor 17,643 + install 680 +
    // any standard rigging/prop lines. Grab it for the finalize check.
    const totalTxt = await page.locator('div.text-4xl.font-black').first().innerText();
    const runningTotal = Number(totalTxt.replace(/[^\d]/g, ''));
    console.log(`running total after motor pick: $${runningTotal.toLocaleString()}`);
    expect(runningTotal, 'total at least motor+install').toBeGreaterThanOrEqual(17643 + 680);

    await clickNext(page);

    // ── Step 2: Dealer Fit ──
    const step2 = await page.evaluate(() => document.body.innerText);
    expect(step2, 'dealer fit step').toMatch(/Step 2 of 4/i);
    await shot(page, '04-dealer-fit');
    await clickNext(page);

    // ── Step 3: Administration — no boat/trailer rego on a motor quote ──
    const step3 = await page.evaluate(() => document.body.innerText);
    expect(step3, 'administration step').toMatch(/Step 3 of 4/i);
    expect(step3, 'no boat rego toggle').not.toMatch(/Boat Rego/i);
    await shot(page, '05-administration');
    await clickNext(page);

    // ── Step 4: Summary — no Base Vessel card ──
    const step4 = await page.evaluate(() => document.body.innerText);
    expect(step4, 'summary step').toMatch(/Step 4 of 4/i);
    expect(step4, 'no base vessel card').not.toMatch(/Base Vessel/i);
    expect(step4, 'powertrain card present').toMatch(/F90XB/);
    await shot(page, '06-summary');

    // ── Finalize → proposal ──
    await page.locator('button:has-text("Finalize Project"), button:has-text("Finalize")').first().click({ force: true });
    await page.waitForTimeout(2000);
    await page.locator('#cust-name, input[placeholder="John Smith"]').first().fill(CUSTOMER);
    const email = page.locator('#cust-email, input[type="email"]').first();
    if (await email.isVisible().catch(() => false)) await email.fill('motor-only@nsmarine.com.au');
    await shot(page, '07-finalize-dialog', false);
    await page.locator('button:has-text("Create Proposal")').first().click({ force: true });
    await page.waitForURL(/\/proposals\//, { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(6000);
    const proposal = await page.evaluate(() => document.body.innerText);
    expect(proposal, 'motor hero name').toMatch(/F90XB/);
    expect(proposal, 'no phantom Range eyebrow').not.toMatch(/^\s*Range$/m);
    await shot(page, '08-proposal-view');

    // ── The proposal-style PDF (Yamaha-branded motor cover) ──
    const dlPromise = page.waitForEvent('download', { timeout: 150000 });
    await page.locator('button:has-text("Download"), button:has-text("PDF")').first().click({ force: true });
    const dl = await dlPromise;
    await dl.saveAs(`${SHOTS}/09-motor-proposal.pdf`);
    console.log('MOTOR-ONLY FLOW COMPLETE');
});
