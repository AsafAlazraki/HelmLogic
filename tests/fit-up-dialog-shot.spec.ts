/**
 * Visual proof shot of the redesigned Fit-Up Add/Edit dialog.
 * One screenshot — feed it to the user / Mark for visual signoff.
 */
import { test } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

const OUT = 'test-results/fit-up-dialog-shot';
fs.mkdirSync(OUT, { recursive: true });

test.use({ viewport: { width: 1440, height: 900 } });

test('Fit-Up edit dialog redesign — visual proof', async ({ page }) => {
    test.setTimeout(120_000);

    await login(page);
    const m = page.url().match(/\/([^/]+)\/(dashboard|modules|$)/);
    const orgSlug = m ? m[1] : 'northside-marine';

    await page.goto(`${BASE_URL}/${orgSlug}/manage?_t=${Date.now()}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4500);

    await page.getByRole('tab', { name: /Fit-Up Catalog/i }).first().click();
    await page.waitForTimeout(2500);

    // Click the first pencil edit icon
    const pencil = page.locator('svg.lucide-pencil').first();
    await pencil.scrollIntoViewIfNeeded().catch(() => {});
    await pencil.locator('xpath=ancestor::button').first().click({ force: true }).catch(async () => {
        // Fall back to clicking the icon container
        await pencil.click({ force: true });
    });
    await page.waitForTimeout(2000);

    // Take a tall full-page screenshot so the user can see the entire dialog
    await page.screenshot({ path: `${OUT}/fit-up-edit-dialog.png`, fullPage: true });
    console.log('📸 screenshot saved to', `${OUT}/fit-up-edit-dialog.png`);
});
