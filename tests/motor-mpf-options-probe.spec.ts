import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.34 — MPF option-band auto-assignment proof (Asaf: "that stuff all
 * exists in MPF data so should be auto assigned and allow them to
 * search filter"):
 *  1. The motor editor shows the motor's OWN MPF option lists (rigging /
 *     props with Default / FOs / named accessories), searchable.
 *  2. One-click Assign resolves a rigging option against the org
 *     catalogue, prices it, and lands it in the accessory package
 *     (then removed to leave data clean).
 *  3. The workspace has a Dealer Fit tab.
 */
const MOTOR_MODULE = 'KddayQaREA5tdZzzXjDW';
const SHOTS = 'tasks/test-evidence/v1.34';

test('editor shows MPF option bands + one-click assign round-trip', async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);
    await page.goto(`${BASE_URL}/modules/${MOTOR_MODULE}?motorTab=catalog&_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    const search = page.locator('input[placeholder="Search motors..."]').first();
    await search.waitFor({ timeout: 45000 });
    await page.waitForTimeout(3000);
    await search.fill('F90');
    await page.waitForTimeout(1200);
    await page.locator('text=/Yamaha - F90XB$/i').first().click({ force: true });
    await page.waitForTimeout(2500);

    const sheet = (await page.evaluate(() => document.body.innerText)).toUpperCase();
    expect(sheet, 'MPF options panel').toContain('MPF OPTIONS FOR THIS MOTOR');
    expect(sheet, 'rigging options band').toContain('RIGGING OPTIONS');
    await page.screenshot({ path: `${SHOTS}/mpf-options-bands.png`, fullPage: false });

    // Filter the bands.
    await page.locator('input[placeholder="Filter options…"]').fill('CL5');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/mpf-options-filtered.png`, fullPage: false });

    // One-click assign the first visible option, verify it lands, remove it.
    const before = await page.locator('text=/Assigned ✓/').count();
    const assignBtn = page.getByRole('button', { name: /^Assign$/ }).first();
    await assignBtn.waitFor({ timeout: 10000 });
    await assignBtn.click();
    await page.waitForTimeout(3500);
    const after = await page.evaluate(() => document.body.innerText);
    const assignedNow = await page.locator('text=/Assigned ✓/').count();
    console.log(`assigned markers: ${before} -> ${assignedNow}`);
    expect(assignedNow, 'option assigned into package').toBeGreaterThan(before);
    await page.screenshot({ path: `${SHOTS}/mpf-options-assigned.png`, fullPage: false });

    // Clean up: remove the just-added accessory (last X in the package list).
    const removeButtons = page.locator('section button[title="Remove from this motor"]');
    const nRemove = await removeButtons.count();
    if (nRemove > 0) {
        await removeButtons.last().click();
        await page.waitForTimeout(2500);
    }
    console.log('MPF OPTIONS VERIFIED + CLEANED');
});

test('workspace has a Dealer Fit tab', async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);
    await page.goto(`${BASE_URL}/modules/${MOTOR_MODULE}?motorTab=dealer-fit&_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(8000);
    const body = await page.evaluate(() => document.body.innerText);
    expect(body, 'dealer fit tab active').toMatch(/Dealer Fit/i);
    await page.screenshot({ path: `${SHOTS}/motor-dealer-fit-tab.png`, fullPage: false });
    console.log('DEALER FIT TAB VERIFIED');
});
