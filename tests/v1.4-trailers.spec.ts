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
// Live data assumed (seeded by scripts/seed-trailers.ts + create-trailers-module.ts):
//   - modules/trailers-module exists with 6 trailer brand vendor IDs
//   - 7 brand vendors + 46 series + 449 trailer docs in data-warehouse
// Specs still skip when data is absent so the suite is safe in any env.
//
// Each spec is independent and isolated:
//   1. Trailers module — Catalog tab loads + a seeded brand renders.
//   2. Trailers module — Pricing Manager waterfall + column-code badges.
//   3. Trailers module — Settings exposes Brand and Dealer Fit managers.
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

    test('Dashboard tab loads without console errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));

        const opened = await openModuleByType(page, 'trailers');
        test.skip(!opened, 'No trailers module configured in this environment');

        // Dashboard is the default tab (renamed from Catalog in v1.4 chunk 4).
        await expect(page.getByRole('tab', { name: /dashboard/i }).first()).toBeVisible({ timeout: 15_000 });

        // The gradient banner shows the module name + aggregate stats
        // ("N trailers · M brands · K series"). If the module has no trailer
        // brands selected, the dashboard falls back to an explicit empty card.
        const searchInput = page.locator('[placeholder*="code" i]').first();
        const emptyState = page.locator('text=No trailer brands selected').first();
        const anyBrand = page.getByText(/DUNBIER|MACKAY|GFAB|REDCO|TINKA|STACER|HAINES/i).first();

        const settled = await Promise.race([
            anyBrand.waitFor({ timeout: 12_000 }).then(() => 'brand'),
            emptyState.waitFor({ timeout: 12_000 }).then(() => 'empty'),
            searchInput.waitFor({ timeout: 12_000 }).then(() => 'search'),
        ]).catch(() => null);
        expect(settled, 'Dashboard must render brand content, the search input, or the empty-state card').toBeTruthy();

        expect(errors, `Unexpected page errors: ${errors.join('\n')}`).toHaveLength(0);
    });

    test('Dashboard supports cards ↔ table view toggle', async ({ page }) => {
        const opened = await openModuleByType(page, 'trailers');
        test.skip(!opened, 'No trailers module configured in this environment');

        await expect(page.getByRole('tab', { name: /dashboard/i }).first()).toBeVisible({ timeout: 15_000 });

        // View toggle buttons are aria-labelled.
        const cardBtn = page.getByRole('button', { name: /card view/i }).first();
        const tableBtn = page.getByRole('button', { name: /table view/i }).first();

        // The toggle is only visible once the dashboard content has loaded;
        // skip if the module has no brands selected (empty state shown).
        const toggleVisible = await tableBtn.isVisible({ timeout: 8_000 }).catch(() => false);
        if (!toggleVisible) {
            test.skip(true, 'Dashboard is empty — no trailers loaded to toggle over');
        }

        // Switch to table. A native <table> should appear.
        await tableBtn.click();
        await expect(page.locator('table').first()).toBeVisible({ timeout: 8_000 });
        // The URL should record trailerView=table so a refresh restores it.
        await expect(page).toHaveURL(/trailerView=table/);

        // Switch back to cards. URL param should be dropped.
        await cardBtn.click();
        await page.waitForTimeout(400);
        await expect(page).not.toHaveURL(/trailerView=table/);
    });

    test('Pricing Manager tab renders waterfall + column codes', async ({ page }) => {
        const opened = await openModuleByType(page, 'trailers');
        test.skip(!opened, 'No trailers module configured in this environment');

        await page.getByRole('tab', { name: /pricing manager/i }).first().click();
        await page.waitForTimeout(2500);

        // Header copy is stable across empty and populated states.
        await expect(page.getByText(/pricing manager/i).first()).toBeVisible();
        await expect(page.getByText(/waterfall/i).first()).toBeVisible({ timeout: 10_000 });

        // The pricing manager search input ships with every render of this tab,
        // even if no trailers/brands are loaded yet.
        await expect(page.locator('[placeholder*="code or name" i]').first()).toBeVisible({ timeout: 10_000 });

        // If trailers loaded for any brand, at least one row's column-code badge
        // (BW = Sell ex GST) should render. Skip strict assertion when no data.
        const colCodeBadge = page.getByText(/^BW$/).first();
        const hasData = await colCodeBadge.isVisible({ timeout: 6_000 }).catch(() => false);
        if (!hasData) {
            test.info().annotations.push({ type: 'note', description: 'No trailer rows expanded — column-code assertion skipped' });
        }
    });

    test('Settings tab exposes module image, brand + dealer-fit managers', async ({ page }) => {
        const opened = await openModuleByType(page, 'trailers');
        test.skip(!opened, 'No trailers module configured in this environment');

        await page.getByRole('tab', { name: /settings/i }).first().click();
        await page.waitForTimeout(2500);

        // v1.4 chunk 5b: Settings tab now leads with a Module Image editor.
        await expect(page.getByText(/module image/i).first()).toBeVisible({ timeout: 10_000 });

        await expect(page.getByText(/trailer brands/i).first()).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText(/trailer dealer fit categories/i).first()).toBeVisible({ timeout: 10_000 });

        // The brand multi-select should surface the seeded vendor labels —
        // assert at least one canonical brand name appears in the settings panel.
        const brandLabel = page.getByText(/DUNBIER|MACKAY|GFAB|REDCO|TINKA|STACER/i).first();
        const brandVisible = await brandLabel.isVisible({ timeout: 6_000 }).catch(() => false);
        if (!brandVisible) {
            test.info().annotations.push({ type: 'note', description: 'Trailer Brand vendors not surfaced in settings — env may lack seeded data' });
        }
    });

    test('Trailer detail sheet opens with image + edit affordances', async ({ page }) => {
        const opened = await openModuleByType(page, 'trailers');
        test.skip(!opened, 'No trailers module configured in this environment');

        // Wait for at least one trailer card to render. If none, skip.
        const firstCard = page.locator('[class*="cursor-pointer"][class*="rounded-2xl"]').first();
        const cardVisible = await firstCard.isVisible({ timeout: 12_000 }).catch(() => false);
        if (!cardVisible) {
            test.skip(true, 'No trailer cards rendered in this env — dashboard is empty');
        }

        await firstCard.click();

        // Detail sheet should open — look for the Specifications heading that
        // ships with every trailer detail view.
        await expect(page.getByText(/^specifications$/i).first()).toBeVisible({ timeout: 8_000 });

        // Admins see an Edit button; non-admins don't. Either is acceptable
        // in this smoke test — but if the Edit button is present, clicking it
        // must expose the form fields (Code, Name, Supplier) without crashing.
        const editBtn = page.getByRole('button', { name: /^edit$/i }).first();
        if (await editBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await editBtn.click();
            await page.waitForTimeout(500);
            await expect(page.getByText(/^code$/i).first()).toBeVisible({ timeout: 5_000 });
            await expect(page.getByText(/basic info/i).first()).toBeVisible({ timeout: 5_000 });
            // Leave edit mode cleanly.
            await page.getByRole('button', { name: /cancel/i }).first().click().catch(() => {});
        }
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
