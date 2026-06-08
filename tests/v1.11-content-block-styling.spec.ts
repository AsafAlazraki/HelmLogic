/**
 * Verify the per-block PDF presentation styling controls render in the
 * Content Block Manager — accent / background / text colour pickers
 * + size + alignment selects + italic toggle.
 *
 * We're not yet asserting the styling appears on the rendered PDF; that
 * needs a finalize + render cycle which the v1.11-allup spec already
 * does for the default styling. This spec proves the controls exist
 * and can be opened on the live deploy.
 */
import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

const OUT = 'test-results/v1.11-content-styling';
fs.mkdirSync(OUT, { recursive: true });

test.use({ viewport: { width: 1440, height: 900 } });

test('Content Block styling controls render in the manager', async ({ page }) => {
    test.setTimeout(180_000);

    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';

    await page.goto(`${BASE_URL}/${orgSlug}/manage?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);

    // Manage → Document Templates is where the Content Block Manager
    // lives in v1.11; click that tab, then the Quote sub-section.
    const docTemplatesTab = page.locator('button:has-text("Document Templates"), [role="tab"]:has-text("Document Templates")').first();
    await expect(docTemplatesTab, 'Document Templates tab visible on Manage page').toBeVisible({ timeout: 15000 });
    await docTemplatesTab.click({ force: true });
    await page.waitForTimeout(2500);
    // If there's a sub-tab for Quote content, click it
    const quoteSub = page.locator('button:has-text("Quote"), [role="tab"]:has-text("Quote")').first();
    if (await quoteSub.isVisible().catch(() => false)) {
        await quoteSub.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: `${OUT}/00-manager.png`, fullPage: true });

    // Pick a REGULAR content block from the PDF Sections column —
    // NOT Salesperson Message (that's a separate component without the
    // styling overrides). Why Choose Us / Brand & Model Story / After
    // Sales / Terms & Conditions / Value Summary are all fine.
    const blockLabels = ['Why Choose Us', 'Brand & Model Story', 'After Sales', 'Terms & Conditions', 'Value Summary'];
    let openedAny = false;
    for (const label of blockLabels) {
        const el = page.locator(`button:has-text("${label}"), [role="button"]:has-text("${label}"), li:has-text("${label}")`).first();
        if (await el.isVisible().catch(() => false)) {
            await el.click({ force: true });
            await page.waitForTimeout(2500);
            openedAny = true;
            console.log(`▶ opened block: ${label}`);
            break;
        }
    }
    expect(openedAny, 'should open a regular content block').toBe(true);
    await page.screenshot({ path: `${OUT}/01-block-detail.png`, fullPage: true });

    // Hit Edit if we landed on a read mode
    const editBtn = page.locator('button:has-text("Edit"), button:has-text("Modify")').first();
    if (await editBtn.isVisible().catch(() => false)) {
        await editBtn.click({ force: true });
        await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: `${OUT}/02-edit-mode.png`, fullPage: true });

    // Look for our new "PDF presentation" section
    const presentationSummary = page.locator(':text("PDF presentation"), :text("PDF Presentation")').first();
    await expect(presentationSummary, '"PDF presentation" section visible').toBeVisible({ timeout: 15000 });

    // Ensure the colour pickers + selects are reachable
    await presentationSummary.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/03-styling-section.png`, fullPage: true });

    const accentLabel = page.locator(':text("Accent")').first();
    const backgroundLabel = page.locator(':text("Card background")').first();
    const titleSizeLabel = page.locator(':text("Title size")').first();
    const bodyAlignLabel = page.locator(':text("Body align")').first();
    const italicLabel = page.locator(':text("Italic title")').first();
    await expect(accentLabel).toBeVisible();
    await expect(backgroundLabel).toBeVisible();
    await expect(titleSizeLabel).toBeVisible();
    await expect(bodyAlignLabel).toBeVisible();
    await expect(italicLabel).toBeVisible();

    console.log('▶ content-block styling controls verified live');
});
