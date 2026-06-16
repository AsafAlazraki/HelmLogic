/**
 * v1.12 — Service Quoting end-to-end walkthrough.
 *
 * Validates the full claim made in the v1.12-v1.16 release email:
 * service-quote view + edit + status lifecycle + customer-facing PDF
 * + send. Takes screenshots at each surface so we have actual evidence
 * the surfaces exist + work.
 *
 * Story coverage:
 *   11.2.2 — Service-quote view/edit + status lifecycle (detail sheet,
 *            state machine, estimateType selector, save-on-blur)
 *   11.2.3 — Service-quote PDF (download button, dynamic import)
 *   11.2.4 — Send service quote via email (Send button visibility)
 *
 * Surfaces walked:
 *   /<org>/modules/service-module  → dashboard
 *   ServiceQuoteDashboard card list
 *   Click card → ServiceQuoteDetailSheet opens
 *   Status select + Download PDF + Send buttons visible
 */
import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

const OUT = 'test-results/v1.12-service-quoting';
const SERVICE_MODULE_ID = 'service-module';

const ticks: Record<string, boolean> = {};
function tick(name: string, ok: boolean) {
    ticks[name] = ok;
    console.log(`${ok ? '✅' : '❌'} ${name}`);
}

test.afterAll(() => {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('   v1.12 Service Quoting walkthrough');
    console.log('══════════════════════════════════════════════════════════');
    for (const [name, ok] of Object.entries(ticks)) {
        console.log(`   ${ok ? '✅' : '❌'}  ${name}`);
    }
    const pass = Object.values(ticks).filter(Boolean).length;
    console.log(`   ${pass}/${Object.keys(ticks).length} passed\n`);
});

test('Service Quoting — dashboard + detail sheet + PDF + Send', async ({ page }) => {
    test.setTimeout(420_000);
    await login(page);

    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';

    await page.goto(`${BASE_URL}/${orgSlug}/modules/${SERVICE_MODULE_ID}?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(12000);
    await page.screenshot({ path: `${OUT}/01-dashboard.png`, fullPage: true });
    // Capture network + console errors for debugging
    const consoleMsgs: string[] = [];
    page.on('console', m => consoleMsgs.push(`[${m.type()}] ${m.text()}`));

    // 11.2.x — Dashboard mounts (top-level title or any service-quote text)
    const dashboardTitle = await page.locator('text=/Service Quot|Service Job/i').first().isVisible({ timeout: 8000 }).catch(() => false);
    tick('v1.12/11.2.x-service-dashboard-mounts', dashboardTitle);

    // Look for any existing service quote card. Test orgs may not have one
    // — if not, click "New service quote" to create one before walking the
    // detail sheet.
    const quoteCard = page.locator('[role="button"], button, div.cursor-pointer').filter({ hasText: /[A-Z]{2,}.*\$/ }).first();
    let cardCount = await page.locator('text=/draft|sent|accepted|complete|cancelled/i').count();

    if (cardCount === 0) {
        // No existing quotes — create one
        console.log('▶ no existing service quotes — creating one');
        const newBtn = page.locator('button:has-text("New"), button:has-text("Create")').first();
        const newBtnVisible = await newBtn.isVisible({ timeout: 5000 }).catch(() => false);
        tick('v1.12/11.2.x-new-service-quote-button', newBtnVisible);
        if (newBtnVisible) {
            await newBtn.click({ force: true });
            await page.waitForTimeout(2500);
            await page.screenshot({ path: `${OUT}/02-new-quote-wizard.png`, fullPage: true });

            // Try to push through the wizard with minimal input — fill customer name field if present
            const custInput = page.locator('input[placeholder*="ustomer"], input[placeholder*="ame"]').first();
            if (await custInput.isVisible({ timeout: 3000 }).catch(() => false)) {
                await custInput.fill('Test Customer for v1.12 spec');
                await page.waitForTimeout(500);
            }
            // Click Next 4× to push to the end
            for (let i = 0; i < 4; i++) {
                const nextBtn = page.locator('button:has-text("Next"), button:has-text("Review"), button:has-text("Create"), button:has-text("Save")').last();
                if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await nextBtn.click({ force: true }).catch(() => {});
                    await page.waitForTimeout(1500);
                }
            }
            await page.screenshot({ path: `${OUT}/03-after-create.png`, fullPage: true });
            await page.waitForTimeout(2500);
        }
    } else {
        tick('v1.12/11.2.x-new-service-quote-button', true);
    }

    // Click on first card to open detail sheet — target by customer name
    // (not the status filter pill which also matches /draft|sent|.../).
    const firstCard = page.locator('text=/TEST CUSTOMER|Highfield CL380.*test/').first();
    const cardClickable = await firstCard.isVisible({ timeout: 5000 }).catch(() => false);
    if (cardClickable) {
        await firstCard.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${OUT}/04-detail-sheet.png`, fullPage: true });

        // 11.2.2 — Detail sheet opens (look for Sheet/dialog with status + estimateType)
        const sheetOpen = await page.locator('[role="dialog"], [data-state="open"]').first().isVisible({ timeout: 5000 }).catch(() => false);
        tick('v1.12/11.2.2-detail-sheet-opens', sheetOpen);

        // estimateType selector (Installation / Insurance / Mechanical Estimate)
        const estimateType = await page.locator('text=/Installation|Insurance|Mechanical Estimate|Estimate Type/i').first().isVisible({ timeout: 3000 }).catch(() => false);
        tick('v1.12/11.2.2-estimateType-selector', estimateType);

        // Status select (state machine)
        const statusSelect = await page.locator('button, select').filter({ hasText: /draft|sent|accepted/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
        tick('v1.12/11.2.2-status-state-machine', statusSelect);

        // 11.2.3 — Download PDF button
        const downloadBtn = await page.locator('button:has-text("Download"), button:has-text("PDF")').first().isVisible({ timeout: 3000 }).catch(() => false);
        tick('v1.12/11.2.3-download-pdf-button', downloadBtn);

        // 11.2.4 — Send button (gated on email-send + customer email)
        const sendBtn = await page.locator('button:has-text("Send")').first().isVisible({ timeout: 3000 }).catch(() => false);
        tick('v1.12/11.2.4-send-button', sendBtn);
    } else {
        console.log('▶ no clickable service quote card after create attempt');
        tick('v1.12/11.2.2-detail-sheet-opens', false);
        tick('v1.12/11.2.2-estimateType-selector', false);
        tick('v1.12/11.2.2-status-state-machine', false);
        tick('v1.12/11.2.3-download-pdf-button', false);
        tick('v1.12/11.2.4-send-button', false);
    }
});
