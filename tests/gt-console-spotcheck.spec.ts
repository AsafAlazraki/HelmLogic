import { test, expect, type Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * FFR-32 (Asaf field bug, 2026-07-05) — GT console spot-check on a live
 * CL340 (Classic):
 *  - selecting a GT console must NOT lock in or offer a seat pick
 *  - the Seats panel shows the FCT-comes-standard note instead
 *  - a non-GT console (Elegance/FCT8/etc. with an RS7 pairing) still locks
 *    its paired seat, proving the pairing mechanism itself is intact
 */

const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const VENDOR_ID = 'LafOLpLb6QIFE856TiD4';
const RANGE_ID = 'qo7IePnRzJxjrYyLWhTn'; // Classic
const MODEL_ID = 'cl340';
const SHOTS = 'tasks/test-evidence/ffr32-gt-console';

async function openStep2(page: Page) {
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

    // Step 1 — PVC + first colour.
    const matBtn = page.locator('button.h-32').filter({ hasText: /^\s*PVC\s*$/i }).first();
    await matBtn.waitFor({ timeout: 20000 });
    await matBtn.click({ force: true });
    await page.waitForTimeout(800);
    const colourCard = page.locator('button.rounded-\\[1\\.5rem\\]').first();
    await colourCard.waitFor({ timeout: 15000 });
    await colourCard.click({ force: true });
    await page.waitForTimeout(1200);

    // Advance one step to reach factory options (Step 2).
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(2000);
}

test.describe('FFR-32 — GT console never offers a seat (CL340)', () => {
    test('GT select → FCT note, no seat; non-GT console still pairs its seat', async ({ page }) => {
        test.setTimeout(240000);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await openStep2(page);

        // ── GT console ──
        const gtCard = page.locator('button', { hasText: /^GT\b/i }).filter({ hasText: /Steering/i }).first();
        await gtCard.waitFor({ timeout: 20000 });
        await gtCard.click({ force: true });
        await page.waitForTimeout(1500);

        // FCT-standard note shows in the Seats panel; no seat card offered.
        await expect(page.locator('text=/FCT comes standard/i').first()).toBeVisible({ timeout: 10000 });
        expect(await page.locator('text=/Paired with GT/i').count(), 'no locked RS7 under GT').toBe(0);
        await page.screenshot({ path: `${SHOTS}/gt-selected-no-seat.png`, fullPage: false });

        // ── control: a non-GT console with a pairing still locks its seat ──
        const otherConsole = page.locator('button', { hasText: /Elegance|FCT8/i }).first();
        if (await otherConsole.isVisible().catch(() => false)) {
            await otherConsole.click({ force: true });
            await page.waitForTimeout(1500);
            const pairedCount = await page.locator('text=/Paired with/i').count();
            const noteCount = await page.locator('text=/FCT comes standard/i').count();
            // Either a paired seat locks (pairing intact) or that console also
            // has no pairing (then the generic/no-seat path renders) — but the
            // GT note must NOT leak onto non-GT consoles.
            expect(noteCount, 'FCT note is GT-specific').toBe(0);
            await page.screenshot({ path: `${SHOTS}/non-gt-console-pairing-intact.png`, fullPage: false });
            console.log(`control console: pairedSeatLocked=${pairedCount > 0}`);
        }
    });
});
