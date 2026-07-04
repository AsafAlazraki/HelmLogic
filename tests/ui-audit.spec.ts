/**
 * HYPER-critical UI audit (task #17) — SCREENSHOTS + read-only DOM probes ONLY.
 *
 * Walks every operator-facing screen at 1920×1080 AND 1366×768 and captures
 * full-page evidence screenshots into tasks/test-evidence/ui-audit/{w}/.
 * Alongside each shot it runs an in-page probe that records:
 *   - horizontal document overflow (scrollbar-artifact class)
 *   - elements wider than the viewport (which element bleeds)
 *   - broken images (complete && naturalWidth === 0)
 *   - distorted images (rendered aspect vs natural aspect > 25% off)
 *   - "$NaN" / "$undefined" / bare "undefined"/"null" text nodes
 *   - unformatted raw floats (e.g. 37581.82000000004 / $1234.5 style)
 * Probe results append to tasks/test-evidence/ui-audit/probes.jsonl.
 *
 * READ-ONLY: never clicks Finalize / Save / Delete. No Firestore writes.
 * Run:  E2E_BASE_URL=http://localhost:9002 npx playwright test tests/ui-audit.spec.ts \
 *         --config=playwright.evidence.config.ts --workers=1
 */
import { test, type Page } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

const OUT = 'tasks/test-evidence/ui-audit';
const PROBES = `${OUT}/probes.jsonl`;

const HIGHFIELD_MODULE_ID = 'M1Yf3R9igpJDxJnOVr6f';
const HIGHFIELD_VENDOR_ID = 'LafOLpLb6QIFE856TiD4';
const SPORT_RANGE_ID = 'nQ2LE50z9Tbf2uss0Ote';
const CLASSIC_RANGE_ID = 'qo7IePnRzJxjrYyLWhTn';
const STACER_MODULE_ID = 'I0dGRbh39uhNJ3gotEb0';
const STACER_VENDOR_ID = 'LWgHuGoKfUBeKZ8eWnEi';
const SERVICE_MODULE_ID = 'service-module';

const VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 1366, h: 768 },
];

type Probe = {
  screen: string;
  viewport: string;
  hOverflow: boolean;
  wideElements: string[];
  brokenImages: string[];
  distortedImages: string[];
  badText: string[];
  rawFloats: string[];
};

function appendProbe(p: Probe) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.appendFileSync(PROBES, JSON.stringify(p) + '\n');
}

async function probeAndShoot(page: Page, vp: { w: number; h: number }, screen: string, opts?: { fullPage?: boolean }) {
  const dir = `${OUT}/${vp.w}`;
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(700);
  const probe = await page
    .evaluate(() => {
      const doc = document.documentElement;
      const vw = doc.clientWidth;
      const hOverflow = doc.scrollWidth > vw + 1;
      const wideElements: string[] = [];
      const brokenImages: string[] = [];
      const distortedImages: string[] = [];
      const badText: string[] = [];
      const rawFloats: string[] = [];
      const describe = (el: Element) => {
        const cls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 4).join('.');
        return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
      };
      if (hOverflow) {
        document.querySelectorAll('body *').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > vw + 2 && wideElements.length < 12) wideElements.push(`${describe(el)} w=${Math.round(r.width)}`);
        });
      }
      document.querySelectorAll('img').forEach((img) => {
        const r = img.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return;
        if (img.complete && img.naturalWidth === 0) {
          brokenImages.push(`${img.src.slice(0, 120)}`);
        } else if (img.naturalWidth > 0) {
          const cs = getComputedStyle(img);
          if (cs.objectFit === 'fill' || cs.objectFit === '') {
            const natural = img.naturalWidth / img.naturalHeight;
            const rendered = r.width / r.height;
            const ratio = rendered / natural;
            if (ratio > 1.3 || ratio < 0.75) {
              distortedImages.push(`${describe(img)} nat=${img.naturalWidth}x${img.naturalHeight} r=${Math.round(r.width)}x${Math.round(r.height)} src=${img.src.slice(0, 80)}`);
            }
          }
        }
      });
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      // eslint-disable-next-line no-cond-assign
      while ((n = walker.nextNode())) {
        const t = (n.textContent || '').trim();
        if (!t) continue;
        const parent = (n.parentElement && describe(n.parentElement)) || '';
        if (/\$\s*(NaN|undefined|null)/i.test(t) || /\bNaN\b/.test(t)) badText.push(`${parent}: "${t.slice(0, 90)}"`);
        else if (/^(undefined|null)$/.test(t)) badText.push(`${parent}: bare "${t}"`);
        // raw unformatted floats: 3+ decimals, or 4+ digit number with decimals and no thousands separator
        if (/\d+\.\d{3,}/.test(t) && !/\d+\.\d*e-?\d/i.test(t)) rawFloats.push(`${parent}: "${t.slice(0, 90)}"`);
        else if (/\$\d{4,}\.\d/.test(t)) rawFloats.push(`${parent}: no-thousands "${t.slice(0, 90)}"`);
        if (badText.length > 10 && rawFloats.length > 10) break;
      }
      return { hOverflow, wideElements, brokenImages, distortedImages, badText: badText.slice(0, 10), rawFloats: rawFloats.slice(0, 10) };
    })
    .catch(() => null);
  if (probe) appendProbe({ screen, viewport: `${vp.w}x${vp.h}`, ...probe });
  await page.screenshot({ path: `${dir}/${screen}.png`, fullPage: opts?.fullPage !== false }).catch(() => {});
  console.log(`shot ${vp.w}/${screen}` + (probe && (probe.hOverflow || probe.brokenImages.length || probe.badText.length || probe.rawFloats.length) ? '  ⚠ probe hits' : ''));
}

async function settle(page: Page, ms = 3000) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(ms);
}

async function nextStep(page: Page) {
  await page.locator('button:has-text("Next Step")').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(3200);
}

for (const vp of VIEWPORTS) {
  test.describe(`ui-audit @${vp.w}x${vp.h}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });

    test(`login + dashboard (${vp.w})`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.goto(`${BASE_URL}/login`);
      await settle(page, 2500);
      await probeAndShoot(page, vp, '01-login', { fullPage: false });
      await login(page);
      page.setDefaultTimeout(20000);
      await settle(page, 3500);
      await probeAndShoot(page, vp, '02-dashboard');
    });

    test(`highfield module landing (${vp.w})`, async ({ page }) => {
      test.setTimeout(240_000);
      await login(page);
      page.setDefaultTimeout(20000);
      await page.goto(`${BASE_URL}/modules/${HIGHFIELD_MODULE_ID}`);
      await settle(page, 7000);
      await probeAndShoot(page, vp, '03-highfield-landing');
    });

    test(`sp560 quote steps 1-6 (${vp.w})`, async ({ page }) => {
      test.setTimeout(420_000);
      await login(page);
      page.setDefaultTimeout(20000);
      await page.goto(`${BASE_URL}/modules/${HIGHFIELD_MODULE_ID}/quote/sp560?range=${SPORT_RANGE_ID}&vendor=${HIGHFIELD_VENDOR_ID}`);
      await settle(page, 9000);
      // Step 1 — pick PVC so a variant is active (read-only in-page state).
      const pvc = page.locator('button:has-text("PVC")').first();
      if (await pvc.isVisible({ timeout: 3000 }).catch(() => false)) await pvc.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
      await probeAndShoot(page, vp, '04-sp560-step1');
      await nextStep(page);
      await probeAndShoot(page, vp, '05-sp560-step2-factory-options');
      await nextStep(page);
      // Step 3 — motors incl NSM Recommended cards.
      await probeAndShoot(page, vp, '06-sp560-step3-motor');
      // Select a motor so accessories/dealer-fit strip downstream is populated.
      const motorCard = page.locator('button.rounded-\\[1\\.5rem\\]').first();
      await motorCard.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2500);
      await probeAndShoot(page, vp, '07-sp560-step3-motor-selected');
      await nextStep(page);
      await probeAndShoot(page, vp, '08-sp560-step4-trailer');
      await nextStep(page);
      // Step 5 — dealer-fit strip + fit-up.
      await probeAndShoot(page, vp, '09-sp560-step5-dealerfit');
      await nextStep(page);
      // Step 6 — summary incl deposit schedule card.
      await probeAndShoot(page, vp, '10-sp560-step6-summary');
      // NEVER Finalize.
    });

    test(`cl290 step5 dealer-fit FFR-18 retest (${vp.w})`, async ({ page }) => {
      // FFR-18 (MPF section classifier in groupedDealerFit) retest:
      // expect NO '### OBSELETE' category, NO other-model packs (e.g.
      // 'Patrol 600'), NO 'PRE DELIVERY' / 'RIGGING KITS' sections; general
      // accessory categories (Tube Covers / Garmin / TV / Outboard
      // Accessories) present. Assertions are recorded to the probe log as
      // text-scan results; screenshots are the primary evidence.
      test.setTimeout(420_000);
      await login(page);
      page.setDefaultTimeout(20000);
      await page.goto(`${BASE_URL}/modules/${HIGHFIELD_MODULE_ID}/quote/cl290?range=${CLASSIC_RANGE_ID}&vendor=${HIGHFIELD_VENDOR_ID}`);
      await settle(page, 9000);
      const pvc = page.locator('button:has-text("PVC")').first();
      if (await pvc.isVisible({ timeout: 3000 }).catch(() => false)) await pvc.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
      // Advance 1 → 5 (motor picked on Step 3 so dealer-fit context is real).
      await nextStep(page); // 2
      await nextStep(page); // 3
      await page.locator('button.rounded-\\[1\\.5rem\\]').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(2500);
      await nextStep(page); // 4
      await nextStep(page); // 5
      const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
      const checks = {
        noObselete: !/OBSELETE/i.test(body),
        noPatrol600Pack: !/PATROL 600/i.test(body),
        noPreDelivery: !/PRE DELIVERY/i.test(body),
        noRiggingKitsSection: !/RIGGING KITS/i.test(body),
        hasTubeCovers: /TUBE COVERS/i.test(body),
        hasGarmin: /GARMIN/i.test(body),
        hasOutboardAccessories: /OUTBOARD ACCESSORIES/i.test(body),
      };
      console.log('FFR-18 CL290 Step 5 checks:', JSON.stringify(checks));
      fs.appendFileSync(PROBES, JSON.stringify({ screen: 'ffr18-cl290-step5', viewport: `${vp.w}x${vp.h}`, checks }) + '\n');
      await probeAndShoot(page, vp, '23-cl290-step5-ffr18');
      // Scroll the dealer-fit column mid-way for a second evidence frame.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2)).catch(() => {});
      await page.waitForTimeout(800);
      await probeAndShoot(page, vp, '24-cl290-step5-ffr18-mid', { fullPage: false });
    });

    test(`stacer quote steps 1-2 gate-lifted (${vp.w})`, async ({ page }) => {
      test.setTimeout(300_000);
      await login(page);
      page.setDefaultTimeout(20000);
      await page.goto(`${BASE_URL}/modules/${STACER_MODULE_ID}/quote/sa409apr?range=mpf-catalog&vendor=${STACER_VENDOR_ID}`);
      await settle(page, 9000);
      await probeAndShoot(page, vp, '11-stacer-step1-build-config');
      await nextStep(page);
      await probeAndShoot(page, vp, '12-stacer-step2-factory-options');
    });

    test(`catalog manager (${vp.w})`, async ({ page }) => {
      test.setTimeout(240_000);
      await login(page);
      page.setDefaultTimeout(20000);
      await page.goto(`${BASE_URL}/pricing-manager`);
      await settle(page, 7000);
      await probeAndShoot(page, vp, '13-catalog-manager');
    });

    test(`manage mpf-data all five managers (${vp.w})`, async ({ page }) => {
      test.setTimeout(300_000);
      await login(page);
      page.setDefaultTimeout(20000);
      await page.goto(`${BASE_URL}/manage`);
      await settle(page, 5000);
      // Switch to the MPF Data section.
      await page.locator('button:has-text("MPF Data")').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(4000);
      const tabs: Array<[string, string]> = [
        ['Rigging Kits', '14-mpf-rigging-kits'],
        ['Suppliers', '15-mpf-suppliers'],
        ['Pricing Matrix', '16-mpf-pricing-matrix'],
        ['Freight', '17-mpf-freight'],
        ['Engine Servicing', '18-mpf-engine-servicing'],
      ];
      for (const [label, shotName] of tabs) {
        await page.getByRole('tab', { name: label }).first().click({ force: true }).catch(() => {});
        await page.waitForTimeout(3500);
        await probeAndShoot(page, vp, shotName);
      }
    });

    test(`service quoting dashboard + detail sheet (${vp.w})`, async ({ page }) => {
      test.setTimeout(300_000);
      await login(page);
      page.setDefaultTimeout(20000);
      await page.goto(`${BASE_URL}/modules/${SERVICE_MODULE_ID}`);
      await settle(page, 8000);
      await probeAndShoot(page, vp, '19-service-dashboard');
      // Open the first quote card's detail sheet (read-only look; close after).
      const card = page.locator('[data-testid="service-quote-card"], .cursor-pointer:has-text("SQ-"), div.cursor-pointer:has-text("ops")').first();
      if (await card.isVisible().catch(() => false)) {
        await card.click({ force: true }).catch(() => {});
        await page.waitForTimeout(3500);
        await probeAndShoot(page, vp, '20-service-detail-sheet', { fullPage: false });
        await page.keyboard.press('Escape').catch(() => {});
      } else {
        console.log('service detail: no quote card visible — skipped');
      }
    });

    test(`customers + reporting (${vp.w})`, async ({ page }) => {
      test.setTimeout(300_000);
      await login(page);
      page.setDefaultTimeout(20000);
      await page.goto(`${BASE_URL}/customers`);
      await settle(page, 6000);
      await probeAndShoot(page, vp, '21-customers');
      await page.goto(`${BASE_URL}/reporting`);
      await settle(page, 8000);
      await probeAndShoot(page, vp, '22-reporting');
    });
  });
}
