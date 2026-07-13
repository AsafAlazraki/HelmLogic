import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/**
 * v1.33 repro — Bill: "PDF Section - Drag to reorder not working, each
 * section is locked". Drives a real pointer drag on a content row in
 * Manage → Document Templates → PDF Sections and checks whether the
 * row order changes (and whether the Firestore write fires).
 */
const SHOTS = 'tasks/test-evidence/v1.33';

test('pdf section drag reorders a content row', async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const consoleWarnings: string[] = [];
    page.on('console', m => { if (m.type() !== 'log') consoleWarnings.push(`${m.type()}: ${m.text()}`); });
    await login(page);

    await page.goto(`${BASE_URL}/manage`);
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('tab', { name: /Document Templates/i }).click();
    await page.waitForTimeout(4000);

    // The PDF Sections list
    const list = page.locator('div:has(> div > h3:text("PDF Sections"))').first();
    await expect(list.locator('h3', { hasText: 'PDF Sections' })).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: `${SHOTS}/pdf-sections-before.png`, fullPage: false });

    const rows = list.locator('ul > li');
    const rowCount = await rows.count();
    const labelsBefore: string[] = [];
    for (let i = 0; i < rowCount; i++) labelsBefore.push((await rows.nth(i).innerText()).split('\n')[0].trim());
    console.log('rows before:', JSON.stringify(labelsBefore));

    // Count lock icons vs grip handles
    const grips = await list.locator('button[aria-label="Drag to reorder"]').count();
    const locks = await list.locator('span[title="Anchored position"]').count();
    console.log(`grip handles: ${grips} · locked rows: ${locks}`);

    // Drag the first draggable content row down over the next row.
    const handle = list.locator('button[aria-label="Drag to reorder"]').first();
    await handle.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error('no drag handle found');
    // find this handle's row index
    const startY = handleBox.y + handleBox.height / 2;
    const startX = handleBox.x + handleBox.width / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // exceed the 5px activation distance slowly, then move two rows down
    await page.mouse.move(startX, startY + 8, { steps: 4 });
    await page.waitForTimeout(200);
    await page.mouse.move(startX, startY + 110, { steps: 20 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(3000);

    const labelsAfter: string[] = [];
    const rowCount2 = await rows.count();
    for (let i = 0; i < rowCount2; i++) labelsAfter.push((await rows.nth(i).innerText()).split('\n')[0].trim());
    console.log('rows after:', JSON.stringify(labelsAfter));
    await page.screenshot({ path: `${SHOTS}/pdf-sections-after.png`, fullPage: false });

    console.log('console noise:', JSON.stringify(consoleWarnings.filter(w => /pdf-structure|denied|permission/i.test(w))));
    const changed = JSON.stringify(labelsBefore) !== JSON.stringify(labelsAfter);
    console.log(`ORDER CHANGED: ${changed}`);
    expect(changed, 'drag changed the row order').toBe(true);
});
