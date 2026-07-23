import { test, expect, type Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.34 evidence — one clean, full-page screenshot of EVERY step of the
 * 7-step boat quote flow, on a representative real config (SP560 HYP +
 * F90XB + TA600-MOB + a couple of options/DFOs so each step shows real
 * content, not an empty state).
 *
 * Steps: 1 Boat Base · 2 Factory Options · 3 Motor · 4 Trailer ·
 * 5 Dealer Fit · 6 Administration · 7 Summary.
 *
 * Output: tasks/test-evidence/v1.34/quote-flow-steps/step-N-*.png
 */

const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const VENDOR_ID = 'LafOLpLb6QIFE856TiD4';
const RANGE_ID = 'nQ2LE50z9Tbf2uss0Ote'; // Sport
const MODEL_ID = 'sp560';
const SHOTS = 'tasks/test-evidence/v1.34/quote-flow-steps';

async function clickNext(page: Page) {
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(2000);
}

async function shot(page: Page, name: string) {
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
    console.log(`SHOT ${name}`);
}

test.describe('Quote flow — screenshot every step', () => {
    test('walk all 7 steps with a real SP560 config', async ({ page }) => {
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

        // ── Step 1: Boat Base — pick HYP material + a colour so pricing shows ──
        const hypBtn = page.locator('button.h-32').filter({ hasText: /HYP|Hypalon/i }).first();
        await hypBtn.waitFor({ timeout: 20000 });
        await hypBtn.click({ force: true });
        await page.waitForTimeout(900);
        const colour = page.locator('button').filter({ hasText: /Light Grey \/ White \/ White\/?Blue/i }).first();
        if (await colour.isVisible().catch(() => false)) await colour.click({ force: true });
        else await page.locator('button.rounded-\\[1\\.5rem\\]').first().click({ force: true });
        await page.waitForTimeout(1400);
        await shot(page, 'step-1-boat-base');
        await clickNext(page);

        // ── Step 2: Factory Options — select a couple so the step shows state ──
        for (const name of ['Fabric T Top', 'Stern shade']) {
            const opt = page.locator('button', { hasText: new RegExp(name, 'i') }).first();
            if (await opt.isVisible().catch(() => false)) await opt.click({ force: true });
            await page.waitForTimeout(700);
        }
        await shot(page, 'step-2-factory-options');
        await clickNext(page);

        // ── Step 3: Motor — pick F90XB from the NSM slot ──
        const recommended = page.locator('button, [role="button"]').filter({ hasText: /F90XB(?!2)/ }).first();
        await recommended.waitFor({ timeout: 25000 });
        await recommended.click({ force: true });
        await page.waitForTimeout(2500); // rigging + prop lines resolve async
        await shot(page, 'step-3-motor');
        await clickNext(page);

        // ── Step 4: Trailer — menu trailer auto-selected on MPF boats ──
        await page.waitForTimeout(1500);
        await shot(page, 'step-4-trailer');
        await clickNext(page);

        // ── Step 5: Dealer Fit — pick one item so the selection UI shows ──
        const search = page.locator('input[placeholder="Search dealer fit options..."]').first();
        await search.waitFor({ timeout: 25000 });
        await search.fill('GME GX750B');
        await page.waitForTimeout(1100);
        const card = page.locator('button').filter({ hasText: /GME GX750B/i }).first();
        if (await card.isVisible().catch(() => false)) await card.click({ force: true });
        await page.waitForTimeout(900);
        await search.fill('');
        await page.waitForTimeout(900);
        await shot(page, 'step-5-dealer-fit');
        await clickNext(page);

        // ── Step 6: Administration ──
        await shot(page, 'step-6-administration');
        await clickNext(page);

        // ── Step 7: Summary ──
        await shot(page, 'step-7-summary');
        console.log('ALL 7 STEPS CAPTURED');
    });
});
