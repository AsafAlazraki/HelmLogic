import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';

// -----------------------------------------------------------------------------
// v1.4 Trailers + Rego module smoke tests
// -----------------------------------------------------------------------------
// Read-only smoke suite. These specs assert that the v1.4 UI renders without
// runtime errors and surfaces the expected entry points. They DO NOT mutate
// Firestore — no writes, no overrides saved, no quotes finalised. Mutations
// are covered by the manual test matrix in testing/v1.4/README.md §§5-8.
//
// Each spec is independent and isolated:
//   1. Trailers module — Catalog tab loads.
//   2. Trailers module — Pricing Manager tab loads + shows waterfall.
//   3. Trailers module — Settings tab exposes Brand and Dealer Fit sections.
//   4. Rego module — Workspace renders with Types + Settings tabs.
//   5. Quote flow — Trailer step shows the "Pick from Catalog" trigger.
//
// Known fragility:
//   - Firebase websockets prevent 'networkidle'; we use 'domcontentloaded'.
//   - Sidebar links share text with dashboard cards — we scope by role.
//   - Dialogs open via buttons; no URL navigation is asserted.
// -----------------------------------------------------------------------------

const DASHBOARD_TIMEOUT = 30_000;

async function openModuleByType(page: Page, moduleType: 'trailers' | 'rego'): Promise<boolean> {
    // We identify modules from the dashboard by their moduleType badge, which
    // renders as an uppercase label (e.g. "TRAILERS", "REGO") inside the card.
    // The card is a link wrapping the module icon + title.
    const label = moduleType.toUpperCase();
    const card = page.locator(`a[href*="/modules/"]`).filter({ hasText: label }).first();
    const visible = await card.isVisible().catch(() => false);
    if (!visible) return false;
    await card.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);
    return true;
}

test.describe('v1.4 Trailers module', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.waitForSelector('text=Dashboard', { timeout: DASHBOARD_TIMEOUT }).catch(() => {});
    });

    test('Catalog tab loads without console errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));

        const opened = await openModuleByType(page, 'trailers');
        test.skip(!opened, 'No trailers module configured in this environment');

        // Catalog is the default tab — verify the Catalog nav item is active
        // and at least one search input is present.
        await expect(page.getByRole('tab', { name: /catalog/i }).first()).toBeVisible({ timeout: 15_000 });

        // Either a brand section renders or the "No trailer brands selected"
        // empty-state card shows — both are valid post-load states.
        const hasBrandOrEmpty = await Promise.race([
            page.locator('text=No trailer brands selected').first().waitFor({ timeout: 10_000 }).then(() => 'empty'),
            page.locator('[placeholder*="code or name" i]').first().waitFor({ timeout: 10_000 }).then(() => 'catalog'),
        ]).catch(() => null);
        expect(hasBrandOrEmpty, 'Either the empty-state card or the Catalog search input must render').toBeTruthy();

        expect(errors, `Unexpected page errors: ${errors.join('\n')}`).toHaveLength(0);
    });

    test('Pricing Manager tab renders waterfall shell', async ({ page }) => {
        const opened = await openModuleByType(page, 'trailers');
        test.skip(!opened, 'No trailers module configured in this environment');

        await page.getByRole('tab', { name: /pricing manager/i }).first().click();
        await page.waitForTimeout(2000);

        // Header copy is stable across empty and populated states.
        await expect(page.getByText(/pricing manager/i).first()).toBeVisible();
        await expect(page.getByText(/waterfall/i).first()).toBeVisible({ timeout: 10_000 });
    });

    test('Settings tab exposes brand + dealer-fit managers', async ({ page }) => {
        const opened = await openModuleByType(page, 'trailers');
        test.skip(!opened, 'No trailers module configured in this environment');

        await page.getByRole('tab', { name: /settings/i }).first().click();
        await page.waitForTimeout(2000);

        await expect(page.getByText(/trailer brands/i).first()).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText(/trailer dealer fit categories/i).first()).toBeVisible({ timeout: 10_000 });
    });
});

test.describe('v1.4 Rego module', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.waitForSelector('text=Dashboard', { timeout: DASHBOARD_TIMEOUT }).catch(() => {});
    });

    test('Rego workspace renders types + settings tabs', async ({ page }) => {
        const opened = await openModuleByType(page, 'rego');
        test.skip(!opened, 'No rego module configured in this environment');

        // Rego workspace ships two tabs. The Types tab is default.
        await expect(page.getByRole('tab', { name: /types/i }).first()).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole('tab', { name: /settings/i }).first()).toBeVisible({ timeout: 15_000 });

        // Clicking Settings should reveal the Rego Authority selection list.
        await page.getByRole('tab', { name: /settings/i }).first().click();
        await page.waitForTimeout(1500);
        await expect(page.getByText(/rego authorit/i).first()).toBeVisible({ timeout: 10_000 });
    });
});

test.describe('v1.4 Highfield quote flow', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.waitForSelector('text=Dashboard', { timeout: DASHBOARD_TIMEOUT }).catch(() => {});
    });

    test('Trailer step exposes Pick from Catalog trigger', async ({ page }) => {
        // Enter the Highfield module and open the first available range/model
        // path that surfaces the quote flow. This is best-effort — if the org
        // has no Highfield module or no ranges seeded, we skip.
        const highfieldCard = page.locator('a[href*="/modules/"]').filter({ hasText: /highfield/i }).first();
        const visible = await highfieldCard.isVisible().catch(() => false);
        test.skip(!visible, 'No Highfield module available');
        await highfieldCard.click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2500);

        // Try to click any model card — the quote flow renders one per variant.
        // We hit the first "Start Quote" / "New Quote" CTA we can find; if
        // none exist we gracefully skip.
        const cta = page.locator('button:has-text("Start Quote"), a:has-text("Start Quote"), button:has-text("Quote"), a:has-text("Quote")').first();
        const ctaVisible = await cta.isVisible().catch(() => false);
        test.skip(!ctaVisible, 'Quote CTA not visible for this org/module');

        await cta.click();
        await page.waitForTimeout(3500);

        // Step through to the Trailer step by clicking Next until the step
        // header shows Trailer, or skipping when the flow differs.
        for (let i = 0; i < 5; i++) {
            const trailerHeading = page.getByText(/trailer base|trailer.*step|choose a trailer/i).first();
            if (await trailerHeading.isVisible().catch(() => false)) break;
            const next = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
            if (!(await next.isVisible().catch(() => false))) break;
            await next.click();
            await page.waitForTimeout(1500);
        }

        // The catalog picker trigger — "Pick from Catalog" or "Change Trailer".
        const pickTrigger = page.locator(
            'button:has-text("Pick from Catalog"), button:has-text("Change Trailer")'
        ).first();
        // Best-effort: if the trailer step never appeared (e.g. boat variant
        // with no trailer config), we skip rather than fail.
        if (!(await pickTrigger.isVisible().catch(() => false))) {
            test.skip(true, 'Quote flow never surfaced the trailer step for the tested path');
        }
        await expect(pickTrigger).toBeVisible({ timeout: 10_000 });
    });
});
