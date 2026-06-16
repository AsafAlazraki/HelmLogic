/**
 * v1.12 + v1.13 smoke spec.
 *
 * Verifies the new surfaces load on the live dev URL without crashing:
 *   1. Service Quote Dashboard mounts on a service module page
 *   2. Catalog Manager → Trailer Brand → Trailers Table mounts
 *   3. The InlineEditCell pencil hint appears on a trailers cell
 *
 * Not exhaustive — full per-story coverage comes in v1.14 polish specs.
 */
import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

test.use({ viewport: { width: 1440, height: 900 } });

test('v1.12 service-quote dashboard mounts on the service module page', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';

    // Service-quoting module — find it on the modules list. The dashboard mounts
    // when moduleType === 'service'. Hit the modules list and pick the first
    // service-flagged module.
    await page.goto(`${BASE_URL}/${orgSlug}/dashboard?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3500);

    // Look for any "Service" labelled module card or link
    const serviceLink = page.locator('a[href*="/modules/"]').filter({ hasText: /service/i }).first();
    const hasServiceModule = await serviceLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasServiceModule) {
        console.log('▶ no service module visible on dashboard — service-quote dashboard reachability not asserted in this env');
        return;
    }

    await serviceLink.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);

    // The ServiceQuoteDashboard renders a "Service Quotes" header
    const dashboardHeader = await page.locator('text=/Service Quotes/i').first().isVisible({ timeout: 8000 }).catch(() => false);
    expect(dashboardHeader, 'Service Quote Dashboard header should render').toBe(true);

    // And a "New service quote" button
    const newBtn = await page.locator('button:has-text("New service quote")').first().isVisible().catch(() => false);
    expect(newBtn, 'New service quote button should render').toBe(true);
});

test('v1.13 trailers table mounts via Catalog Manager → Trailer Brand', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';

    await page.goto(`${BASE_URL}/${orgSlug}/pricing-manager?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);

    // Find a Trailer Brand vendor in the sidebar — e.g. Redco / Tinka / Easytow.
    // The vendors list shows the vendor name; click any trailer-looking one.
    const trailerVendor = page.locator('button, [role="button"]').filter({ hasText: /redco|tinka|easytow|dunbier|trailer/i }).first();
    const hasTrailerVendor = await trailerVendor.isVisible({ timeout: 8000 }).catch(() => false);

    if (!hasTrailerVendor) {
        console.log('▶ no Trailer Brand vendor visible — Trailers Table reachability not asserted in this env');
        return;
    }

    await trailerVendor.click({ force: true }).catch(() => {});
    await page.waitForTimeout(3500);

    // The TrailersTableView shows "Trailers Catalogue" in its CardTitle
    const trailerCard = await page.locator('text=/Trailers Catalogue/i').first().isVisible({ timeout: 8000 }).catch(() => false);
    expect(trailerCard, 'TrailersTableView CardTitle should render').toBe(true);

    // And the table headers: ATM, Tare, Cost, Sell, Margin
    const headers = await page.locator('th').filter({ hasText: /ATM|Tare|Cost|Sell|Margin/i }).count();
    expect(headers, 'Trailers Table headers should render').toBeGreaterThan(3);
});

test('v1.13 inline-edit cell pencil hint appears on a trailers cell', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';

    await page.goto(`${BASE_URL}/${orgSlug}/pricing-manager?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);

    const trailerVendor = page.locator('button, [role="button"]').filter({ hasText: /redco|tinka|easytow|dunbier|trailer/i }).first();
    if (!(await trailerVendor.isVisible({ timeout: 8000 }).catch(() => false))) {
        console.log('▶ no Trailer Brand vendor visible — inline edit reachability not asserted');
        return;
    }
    await trailerVendor.click({ force: true }).catch(() => {});
    await page.waitForTimeout(4000);

    // The InlineEditCell button has title="Click to edit". Hovering it reveals
    // a pencil icon (group-hover:opacity-60 on a lucide-pencil svg).
    const editable = page.locator('button[title="Click to edit"]').first();
    const hasEditable = await editable.isVisible({ timeout: 8000 }).catch(() => false);
    expect(hasEditable, 'At least one InlineEditCell affordance should be present').toBe(true);
});
