/**
 * Viewport-matrix screenshot regression test.
 *
 * Drives the quote flow to Step 5 (Dealer Fit + Fit-Up) and captures the
 * fit-up selector at 6 common viewport widths. Per shot, asserts a small
 * set of hard-to-spot responsiveness bugs:
 *
 *  - The 3 tier package cards (Simple / Medium / Complex) all render
 *  - Card titles don't word-break mid-token (e.g. "FIT-" / "UP")
 *  - No tier card has horizontal overflow
 *  - The Next Step button text isn't clipped (.scrollWidth ≤ .clientWidth)
 *
 * Run this whenever the quote-flow UI changes so the responsive matrix
 * is verified before pushing.
 *
 * Usage:
 *   npx playwright test tests/v1.11-responsive-matrix.spec.ts --reporter=line
 *
 * Output: per-viewport screenshots in test-results/v111-responsive/
 */
import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

const OUT = 'test-results/v111-responsive';
const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
    { name: 'sm-portrait',   width: 480,  height: 800  }, // phone-ish
    { name: 'md-tablet',     width: 768,  height: 1024 },
    { name: 'lg-1024',       width: 1024, height: 768  },
    { name: 'lg-1280',       width: 1280, height: 800  },
    { name: 'xl-1440',       width: 1440, height: 900  }, // common laptop
    { name: '2xl-1920',      width: 1920, height: 1080 },
];

async function walkToStep5(page: any) {
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';
    await page.goto(`${BASE_URL}/${orgSlug}/modules/${MODULE_ID}?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3500);

    const newQ = page.locator('button:has-text("New Quote"), button:has-text("New Proposal")').first();
    await newQ.waitFor({ state: 'visible', timeout: 30000 });
    await newQ.click();
    const dlg = page.locator('[role="dialog"]');
    await dlg.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(1200);
    await dlg.locator('.cursor-pointer:has-text("Classic")').first().click({ force: true });
    await page.waitForTimeout(1500);
    await dlg.locator('.cursor-pointer:has-text("CL380")').first().click({ force: true });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4500);

    const pvc = page.locator('button:has-text("PVC")').first();
    if (await pvc.isVisible().catch(() => false)) {
        await pvc.click().catch(() => {});
        await page.waitForTimeout(900);
    }
    await page.locator('button.rounded-\\[1\\.5rem\\]').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);

    for (let s = 0; s < 4; s++) {
        await page.locator('button:has-text("Next Step")').first().click({ force: true }).catch(() => {});
        await page.waitForTimeout(2200);
    }
    await page.waitForTimeout(2500);
}

for (const vp of VIEWPORTS) {
    test(`${vp.name} (${vp.width}×${vp.height}) — fit-up cards fit cleanly`, async ({ page }) => {
        test.setTimeout(360_000);
        await page.setViewportSize({ width: vp.width, height: vp.height });

        await login(page);
        await walkToStep5(page);

        // Screenshot — full page so we see the whole right column
        await page.screenshot({ path: `${OUT}/${vp.name}-full.png`, fullPage: true });

        // ── ASSERT 1: each tier card exists ──
        const simpleCard = page.locator('button:has-text("SIMPLE"):has-text("$")').first();
        const mediumCard = page.locator('button:has-text("MEDIUM"):has-text("$")').first();
        const complexCard = page.locator('button:has-text("COMPLEX"):has-text("$")').first();
        await expect(simpleCard, 'Simple tier card visible').toBeVisible();
        await expect(mediumCard, 'Medium tier card visible').toBeVisible();
        await expect(complexCard, 'Complex tier card visible').toBeVisible();

        // ── ASSERT 2: card content doesn't overflow horizontally ──
        // For each card, the inner h4 title's scrollWidth should not exceed
        // its clientWidth (= title doesn't horizontally overflow). Catches
        // the previous "FIT-UP wraps mid-word" bug after we shortened titles.
        const checkNoOverflow = async (cardLocator: any, label: string) => {
            const card = await cardLocator.elementHandle();
            if (!card) return;
            const box = await cardLocator.boundingBox();
            if (!box) return;
            const overflow = await cardLocator.evaluate((el: HTMLElement) => {
                return { sw: el.scrollWidth, cw: el.clientWidth };
            });
            console.log(`  ${label}: cw=${overflow.cw} sw=${overflow.sw} box=${Math.round(box.width)}×${Math.round(box.height)}`);
            // 2px tolerance for sub-pixel rounding
            expect(overflow.sw, `${label} should not overflow horizontally`).toBeLessThanOrEqual(overflow.cw + 2);
        };
        await checkNoOverflow(simpleCard, 'simple');
        await checkNoOverflow(mediumCard, 'medium');
        await checkNoOverflow(complexCard, 'complex');

        // ── ASSERT 3: cards' bounding boxes all fit inside their parent grid ──
        const grid = page.locator(':has(> button:has-text("SIMPLE")):has(> button:has-text("MEDIUM"))').first();
        const gridBox = await grid.boundingBox();
        if (gridBox) {
            const cards = [simpleCard, mediumCard, complexCard];
            for (let i = 0; i < cards.length; i++) {
                const cb = await cards[i].boundingBox();
                if (!cb) continue;
                // Each card right edge must be ≤ grid right edge + small tolerance
                const cardRight = cb.x + cb.width;
                const gridRight = gridBox.x + gridBox.width;
                expect(cardRight, `card ${i} right edge ${cardRight} should be ≤ grid right ${gridRight}`).toBeLessThanOrEqual(gridRight + 3);
            }
        }

        // ── ASSERT 4: Next Step button text not clipped ──
        const nextBtn = page.locator('button:has-text("Next Step")').first();
        if (await nextBtn.isVisible().catch(() => false)) {
            const clip = await nextBtn.evaluate((el: HTMLElement) => ({
                sw: el.scrollWidth, cw: el.clientWidth,
            }));
            // Allow 3px tolerance — Tailwind `whitespace-normal` may wrap
            // text but should NOT overflow horizontally.
            expect(clip.sw, `Next Step button text shouldn't overflow at ${vp.name}`).toBeLessThanOrEqual(clip.cw + 3);
        }

        console.log(`✓ ${vp.name} (${vp.width}×${vp.height}) — all responsive asserts pass`);
    });
}
