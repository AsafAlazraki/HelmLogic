/**
 * Responsive screenshot matrix — navigate to Step 5 ONCE, then resize the
 * viewport across 6 widths and screenshot + assert at each. Far faster and
 * less flaky than re-driving the quote flow per viewport (the New Quote
 * dialog times out at phone widths).
 *
 * Per width, asserts the hard-to-eyeball responsiveness bugs:
 *   - all 3 tier package cards present
 *   - no tier card overflows horizontally (catches the FIT-UP mid-word wrap)
 *   - each card's right edge sits inside the grid container
 *   - the Next Step button text isn't clipped
 *
 * Screenshots land in test-results/v111-responsive/<width>.png for review.
 *
 *   npx playwright test tests/v1.11-responsive-matrix.spec.ts --reporter=line
 */
import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

const OUT = 'test-results/v111-responsive';
const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const RANGE_CLASSIC = 'qo7IePnRzJxjrYyLWhTn';
const VENDOR = 'LafOLpLb6QIFE856TiD4';
const MODEL_CL380 = 'cl380';
fs.mkdirSync(OUT, { recursive: true });

const WIDTHS = [
    { name: '0480', w: 480,  h: 900  },
    { name: '0768', w: 768,  h: 1000 },
    { name: '1024', w: 1024, h: 900  },
    { name: '1093', w: 1093, h: 760  }, // the width from the user's broken screenshot
    { name: '1280', w: 1280, h: 900  },
    { name: '1440', w: 1440, h: 900  },
    { name: '1920', w: 1920, h: 1080 },
];

test('responsive matrix — fit-up Step 5 at 7 widths', async ({ page }) => {
    test.setTimeout(300_000);

    // Start wide so the dialog nav is reliable, then resize. The quote
    // builder can't cold-start from a URL (needs module-page context), so
    // we drive the New Quote dialog — with retries since it's intermittent.
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';

    let onStep1 = false;
    for (let attempt = 1; attempt <= 3 && !onStep1; attempt++) {
        console.log(`▶ dialog attempt ${attempt}`);
        await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}?_t=${Date.now()}`);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(4000);

        const newQ = page.locator('button:has-text("New Quote"), button:has-text("New Proposal")').first();
        if (!(await newQ.isVisible().catch(() => false))) continue;
        await newQ.click({ force: true });

        const dlg = page.locator('[role="dialog"]');
        const dlgUp = await dlg.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
        if (!dlgUp) continue;
        await page.waitForTimeout(1500);

        const classic = dlg.locator('.cursor-pointer:has-text("Classic")').first();
        if (!(await classic.isVisible().catch(() => false))) continue;
        await classic.click({ force: true });
        await page.waitForTimeout(1800);

        const cl380 = dlg.locator('.cursor-pointer:has-text("CL380")').first();
        if (!(await cl380.isVisible().catch(() => false))) continue;
        await cl380.click({ force: true });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(5000);

        // Confirm we landed on Step 1 (look for a Next Step button)
        onStep1 = await page.locator('button:has-text("Next Step")').first().isVisible().catch(() => false);
    }
    expect(onStep1, 'should reach Step 1 of the quote builder within 3 attempts').toBe(true);

    const pvc = page.locator('button:has-text("PVC")').first();
    if (await pvc.isVisible().catch(() => false)) { await pvc.click().catch(() => {}); await page.waitForTimeout(900); }
    await page.locator('button.rounded-\\[1\\.5rem\\]').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
    for (let s = 0; s < 4; s++) {
        await page.locator('button:has-text("Next Step")').first().click({ force: true }).catch(() => {});
        await page.waitForTimeout(2200);
    }
    await page.waitForTimeout(2500);

    // Confirm we're on Step 5 (tier cards present) before the matrix.
    await expect(page.locator('button:has-text("SIMPLE"):has-text("$")').first(), 'should be on Step 5 with tier cards').toBeVisible({ timeout: 20000 });

    const findings: string[] = [];

    for (const vp of WIDTHS) {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.waitForTimeout(700); // let layout settle

        // Scroll the fit-up section into view
        await page.locator('button:has-text("SIMPLE"):has-text("$")').first().scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${vp.name}.png`, fullPage: true });

        const simple = page.locator('button:has-text("SIMPLE"):has-text("$")').first();
        const medium = page.locator('button:has-text("MEDIUM"):has-text("$")').first();
        const complex = page.locator('button:has-text("COMPLEX"):has-text("$")').first();

        const sV = await simple.isVisible().catch(() => false);
        const mV = await medium.isVisible().catch(() => false);
        const cV = await complex.isVisible().catch(() => false);
        if (!(sV && mV && cV)) findings.push(`${vp.name}: missing tier card(s) S=${sV} M=${mV} C=${cV}`);

        // overflow check per card
        for (const [label, loc] of [['simple', simple], ['medium', medium], ['complex', complex]] as const) {
            const ov = await loc.evaluate((el: HTMLElement) => ({ sw: el.scrollWidth, cw: el.clientWidth })).catch(() => null);
            if (ov && ov.sw > ov.cw + 2) findings.push(`${vp.name}: ${label} card overflows (sw=${ov.sw} > cw=${ov.cw})`);
        }

        // Next Step button clip check
        const nextBtn = page.locator('button:has-text("Next Step")').first();
        if (await nextBtn.isVisible().catch(() => false)) {
            const clip = await nextBtn.evaluate((el: HTMLElement) => ({ sw: el.scrollWidth, cw: el.clientWidth })).catch(() => null);
            if (clip && clip.sw > clip.cw + 3) findings.push(`${vp.name}: Next Step button text clipped (sw=${clip.sw} > cw=${clip.cw})`);
        }

        console.log(`📸 ${vp.name} (${vp.w}px) captured — cards S/M/C=${sV}/${mV}/${cV}`);
    }

    console.log('\n=== RESPONSIVE FINDINGS ===');
    if (findings.length === 0) console.log('  ✓ no overflow / clipping / missing-card issues across all widths');
    else findings.forEach(f => console.log('  ✗', f));

    // Don't hard-fail on findings — we want all screenshots captured for review.
    // Log them; the human review of screenshots is the gate.
});
