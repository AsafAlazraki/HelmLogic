import { test, expect, type Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * FFR-33 PROOF — Mark's SP560 rebuilt under Display-Sheet parity.
 *
 * Reproduces the exact configuration from Mark's 2026-07-07 field test
 * (SP560 HYP Light Grey/White/White-Blue + F90XB from the NSM slot + T Top +
 * Stern Shade + TA600-MOB + spare wheel + regos + the 4 dealer-fit items +
 * rego decals) and asserts the running total equals the Display-Sheet
 * composition computed from the same live catalog figures:
 *
 *   hull 48,350 (inc ladder) + PD tier 5,300 + F90XB 17,643
 *   + slot rigging installed 3,110 + prop 285.29 (retailIncGst; NSM's file
 *     carries 4 coexisting prop prices — see display-sheet-composition.md)
 *   + trailer 10,430 + spare wheel 760 + regos 250 + 283
 *   + T Top 2,720 + Stern Shade 630
 *   + DFO 5,004 + 1,016 + 2,488 + 5,296 + decals 169
 *   = $103,734.29 inc GST  (Mark's sheet: $103,731 — the $3.29 delta is
 *     entirely the prop-price ambiguity inside NSM's own file)
 *
 * Evidence: screenshots to tasks/test-evidence/ffr33-sp560-proof/.
 */

const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const VENDOR_ID = 'LafOLpLb6QIFE856TiD4';
const RANGE_ID = 'nQ2LE50z9Tbf2uss0Ote'; // Sport
const MODEL_ID = 'sp560';
const SHOTS = 'tasks/test-evidence/ffr33-sp560-proof';

const EXPECTED_INC = 103734; // rounded display of 103,734.29

async function clickNext(page: Page) {
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(1800);
}

async function readRunningTotal(page: Page): Promise<number> {
    // The running card's big number is the inc-GST package under
    // display-sheet pricing.
    const txt = await page.locator('div.text-4xl.font-black').first().innerText();
    return Number(txt.replace(/[^\d]/g, ''));
}

test.describe('FFR-33 — SP560 Display-Sheet parity proof', () => {
    test("Mark's config prices to the Display-Sheet number", async ({ page }) => {
        test.setTimeout(420000);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await login(page);

        let mounted = false;
        for (let attempt = 1; attempt <= 3 && !mounted; attempt++) {
            await page.goto(`${BASE_URL}/modules/${MODULE_ID}/quote/${MODEL_ID}?range=${RANGE_ID}&vendor=${VENDOR_ID}&_t=${Date.now()}_${attempt}`);
            await page.waitForLoadState('domcontentloaded');
            const deadline = Date.now() + 30000;
            while (Date.now() < deadline) {
                if (await page.locator('button:has-text("Next Step")').first().isVisible().catch(() => false)) { mounted = true; break; }
                await page.waitForTimeout(500);
            }
        }
        expect(mounted, 'quote flow mounted').toBe(true);

        // ── Step 1: HYP material + Light Grey / White / White/Blue + rego on ──
        const hypBtn = page.locator('button.h-32').filter({ hasText: /HYP|Hypalon/i }).first();
        await hypBtn.waitFor({ timeout: 20000 });
        await hypBtn.click({ force: true });
        await page.waitForTimeout(900);
        const colour = page.locator('button').filter({ hasText: /Light Grey \/ White \/ White\/?Blue/i }).first();
        if (await colour.isVisible().catch(() => false)) {
            await colour.click({ force: true });
        } else {
            await page.locator('button.rounded-\\[1\\.5rem\\]').first().click({ force: true });
        }
        await page.waitForTimeout(1400);
        await page.screenshot({ path: `${SHOTS}/s1-variant.png` });
        await clickNext(page);

        // ── Step 2: Fabric T Top + Stern Shade ──
        for (const name of ['Fabric T Top', 'Stern shade']) {
            const opt = page.locator('button', { hasText: new RegExp(name, 'i') }).first();
            if (await opt.isVisible().catch(() => false)) await opt.click({ force: true });
            await page.waitForTimeout(700);
        }
        await page.screenshot({ path: `${SHOTS}/s2-options.png` });
        await clickNext(page);

        // ── Step 3: F90XB from NSM Recommended (slot 1) ──
        const recommended = page.locator('button, [role="button"]').filter({ hasText: /F90XB(?!2)/ }).first();
        await recommended.waitFor({ timeout: 25000 });
        await recommended.click({ force: true });
        await page.waitForTimeout(2500); // rigging + prop lines resolve async
        await page.screenshot({ path: `${SHOTS}/s3-motor.png` });
        await clickNext(page);

        // ── Step 4: trailer TA600-MOB (auto-selected from the menu on MPF
        // boats — verify, don't blind-click) + spare wheel + both regos ──
        const trailer = page.locator('button, [role="button"]').filter({ hasText: /TA600-MOB/i }).first();
        if (await trailer.isVisible().catch(() => false)) {
            const before = await readRunningTotal(page);
            await trailer.click({ force: true });
            await page.waitForTimeout(1200);
            const after = await readRunningTotal(page);
            // If the click DESELECTED the auto-selected trailer (total dropped), click again.
            if (after < before) { await trailer.click({ force: true }); await page.waitForTimeout(1200); }
        }
        // Spare wheel — delta-verified (+760).
        const spare = page.locator('button, label, [role="button"]').filter({ hasText: /Spare Wheel/i }).first();
        if (await spare.isVisible().catch(() => false)) {
            for (let attempt = 0; attempt < 2; attempt++) {
                const before = await readRunningTotal(page);
                await spare.click({ force: true });
                await page.waitForTimeout(900);
                const after = await readRunningTotal(page);
                if (Math.abs((after - before) - 760) <= 2) break;
                console.log(`spare wheel moved ${before} -> ${after}; ${attempt === 0 ? 'retrying' : 'FAILED'}`);
            }
        }
        // Regos — shadcn Selects (boat + trailer). Pick the first offered
        // band in each rego select on this page; delta-verify.
        const regoTriggers = page.locator('button[role="combobox"]').filter({ hasText: /registration type|Select a registration/i });
        const regoCount = await regoTriggers.count();
        console.log(`rego selects visible on Step 4: ${regoCount}`);
        for (let i = 0; i < regoCount; i++) {
            const before = await readRunningTotal(page);
            await regoTriggers.nth(0).click({ force: true }); // always the first unset one
            await page.waitForTimeout(600);
            const opt = page.locator('[role="option"]').first();
            if (await opt.isVisible().catch(() => false)) {
                await opt.click({ force: true });
                await page.waitForTimeout(900);
                console.log(`rego pick ${i + 1}: total ${before} -> ${await readRunningTotal(page)}`);
            } else {
                await page.keyboard.press('Escape');
            }
        }
        await page.screenshot({ path: `${SHOTS}/s4-trailer.png` });
        await clickNext(page);

        // ── Step 5: the four DFO items + rego decals ──
        // Each pick is VERIFIED by its effect on the running total: after a
        // click the total must move UP by the item's price (a click on an
        // already-selected card toggles it off — retry once to re-select).
        const search = page.locator('input[placeholder="Search dealer fit options..."]').first();
        await search.waitFor({ timeout: 25000 });
        const picks: Array<[string, number]> = [
            ['Tube Covers to suit Hypalon Boat - 5.6', 5004],
            ['GME GX750B', 1016],
            ['Fusion Apollo RA670', 2488],
            ['EchoMap Ultra 2 125sv', 5296],
            ['Rego Decals (Std) t/s Hypalon', 169],
        ];
        for (const [term, price] of picks) {
            await search.fill(term);
            await page.waitForTimeout(1100);
            const card = page.locator('button').filter({ hasText: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
            expect(await card.isVisible().catch(() => false), `card visible: ${term}`).toBe(true);
            for (let attempt = 0; attempt < 2; attempt++) {
                const before = await readRunningTotal(page);
                await card.click({ force: true });
                await page.waitForTimeout(900);
                const after = await readRunningTotal(page);
                if (Math.abs((after - before) - price) <= 2) break; // selected ✓
                console.log(`pick '${term}' moved total ${before} -> ${after} (wanted +${price}); ${attempt === 0 ? 'retrying' : 'FAILED'}`);
            }
        }
        await search.fill('');
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${SHOTS}/s5-dealerfit.png` });

        // ── The number ──
        const total = await readRunningTotal(page);
        console.log(`RUNNING TOTAL: $${total.toLocaleString()} (expected ~$${EXPECTED_INC.toLocaleString()})`);
        await page.screenshot({ path: `${SHOTS}/total.png` });
        expect(Math.abs(total - EXPECTED_INC), 'inc-GST package within $5 of the Display-Sheet composition').toBeLessThanOrEqual(5);
    });
});
