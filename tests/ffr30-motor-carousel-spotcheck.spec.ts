/**
 * FFR-30 — SP560 Step-3 motor-click hero-carousel spot-check.
 *
 * Field bug (Asaf's video): on Step 3, clicking/selecting a motor made the
 * hero carousel show the TRAILER image (REDCO brand shot) instead of the
 * motor. Root cause: slide order is …motor → trailer; when the picked
 * motor produced no renderable slide (SP560's Yamaha menu motors only
 * carry `SummaryImage`, and a dead image drops the slide), embla's reInit
 * kept the numeric index so the trailer slide shifted into the motor's
 * place, and the auto-scroll effect bailed on `motorIdx === -1`.
 *
 * Fix under test (src/lib/hero-carousel.ts + highfield-quote-flow.tsx):
 * motor selection scrolls to the motor slide when it exists, otherwise
 * falls back variant → boat, and NEVER lands on an unrelated slide type.
 *
 * Assertion strategy — after each motor click, the ACTIVE hero slide
 * (the [aria-roledescription="slide"] item overlapping the hero centre)
 * must be either:
 *   - a motor slide (single object-contain img whose src is Yamaha), or
 *   - hull imagery (boat/variant/gallery slides render TWO imgs: blurred
 *     echo + contained main).
 * A single-img slide whose src is NOT a motor image (trailer / anything
 * else) fails — that is exactly the field bug.
 */
import { test, expect, type Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

const MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const VENDOR_ID = 'LafOLpLb6QIFE856TiD4';
const RANGE_ID = 'nQ2LE50z9Tbf2uss0Ote'; // Sport
const MODEL_ID = 'sp560';
const SHOTS = 'tasks/test-evidence/ffr30-motor-carousel';
fs.mkdirSync(SHOTS, { recursive: true });

test.use({ viewport: { width: 1600, height: 950 } });

interface ActiveSlide {
    found: boolean;
    imgCount: number;
    srcs: string[];
    classes: string[];
}

/** The active embla slide = the slide item whose box overlaps the hero
 *  wrapper's centre point. */
async function readActiveSlide(page: Page): Promise<ActiveSlide> {
    return page.evaluate(() => {
        const hero = document.querySelector('div.rounded-\\[2rem\\].group');
        if (!hero) return { found: false, imgCount: 0, srcs: [], classes: [] };
        const hb = hero.getBoundingClientRect();
        const cx = hb.left + hb.width / 2;
        const cy = hb.top + hb.height / 2;
        const slides = Array.from(hero.querySelectorAll('[aria-roledescription="slide"]'));
        const active = slides.find(s => {
            const b = s.getBoundingClientRect();
            return b.left <= cx && b.right >= cx && b.top <= cy && b.bottom >= cy && b.width > 0;
        });
        if (!active) return { found: false, imgCount: 0, srcs: [], classes: [] };
        const imgs = Array.from(active.querySelectorAll('img'));
        return {
            found: true,
            imgCount: imgs.length,
            srcs: imgs.map(i => i.getAttribute('src') || ''),
            classes: imgs.map(i => i.className || ''),
        };
    });
}

function assertNotTrailer(slide: ActiveSlide, label: string) {
    console.log(`▶ [${label}] active slide:`, JSON.stringify(slide));
    // Zero slides at all (model with no imagery) renders the explicit
    // placeholder — acceptable (nothing unrelated shown). SP560 always has
    // hull imagery, so we still require the slide to be found.
    expect(slide.found, `${label}: an active hero slide should exist for SP560`).toBe(true);
    if (slide.imgCount >= 2) {
        // Hull imagery (blur echo + contained main) — the sanctioned fallback.
        return;
    }
    expect(slide.imgCount, `${label}: active slide should carry an image`).toBe(1);
    const src = slide.srcs[0] || '';
    const isMotor = /yamaha/i.test(src);
    const looksTrailer = /trailer|dunbier|redco|tinka|sharepoint/i.test(src);
    expect(looksTrailer, `${label}: hero must NEVER show a trailer image after a motor click (src=${src})`).toBe(false);
    expect(isMotor, `${label}: single-image active slide after a motor click must be the MOTOR image (src=${src})`).toBe(true);
}

test('FFR-30 — SP560 Step 3: motor clicks never land the hero on the trailer slide', async ({ page }) => {
    test.setTimeout(300_000);

    const errs: string[] = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 200)));

    await login(page);

    // Mount the SP560 quote flow directly (same pattern as the step5 spec).
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
    expect(mounted, 'SP560 quote flow mounted').toBe(true);

    // Step 1 — PVC + first colour.
    const matBtn = page.locator('button.h-32').filter({ hasText: /^\s*PVC\s*$/i }).first();
    await matBtn.waitFor({ timeout: 20000 });
    await matBtn.click({ force: true });
    await page.waitForTimeout(800);
    const colourCard = page.locator('button.rounded-\\[1\\.5rem\\]').first();
    await colourCard.waitFor({ timeout: 15000 });
    await colourCard.click({ force: true });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/s1-variant-picked.png` });

    // Step 2 → Step 3.
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(2500);
    await page.locator('button:has-text("Next Step")').first().click({ force: true });
    await page.waitForTimeout(4000); // motors fetch + auto-default + carousel settle
    await page.screenshot({ path: `${SHOTS}/s3-arrival.png`, fullPage: true });

    // The auto-default motor selection already ran — the hero must already
    // be in a legal state on arrival.
    assertNotTrailer(await readActiveSlide(page), 'step-3 arrival (auto-default motor)');

    // ── Reproduce Asaf's click: pick motors from the NSM menu / grid. ──
    // SP560's variant motorMenu resolves 4 Yamahas (F90XB / F90XB2 /
    // F115XB / F115XB2). Click every distinct visible motor card we can
    // find, asserting the hero after each selection change.
    const motorNames = ['F115XB', 'F90XB', 'F115XB2 (White)', 'F90XB2 (White)'];
    let clicks = 0;
    for (const name of motorNames) {
        const card = page
            .locator(`button:has-text("${name}"), div.cursor-pointer:has-text("${name}")`)
            .first();
        if (!(await card.isVisible({ timeout: 3000 }).catch(() => false))) {
            console.log(`▶ motor card "${name}" not visible — skipping`);
            continue;
        }
        await card.scrollIntoViewIfNeeded().catch(() => {});
        await card.click({ force: true });
        clicks++;
        // 150ms auto-scroll timer + embla settle + potential img onError →
        // slide drop → reInit → corrective scroll. Give the full chain time.
        await page.waitForTimeout(3000);
        await page.screenshot({ path: `${SHOTS}/s3-click-${clicks}-${name.replace(/[^a-z0-9]/gi, '_')}.png` });
        assertNotTrailer(await readActiveSlide(page), `after clicking ${name}`);
    }
    expect(clicks, 'should have exercised at least 2 motor selection changes').toBeGreaterThanOrEqual(2);

    // No client crashes throughout.
    expect(errs, `no page errors during Step-3 motor clicks: ${errs.join(' | ')}`).toEqual([]);
});
