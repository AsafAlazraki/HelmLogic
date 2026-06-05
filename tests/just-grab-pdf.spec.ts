import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

const OUT = 'test-results/cl380';
test.use({ viewport: { width: 1920, height: 1080 } });

test('grab the PDF', async ({ page }) => {
  test.setTimeout(240000);
  fs.mkdirSync(OUT, { recursive: true });
  await login(page);
  // Use the existing CL380 quote we just made (fitUp=12 confirmed)
  await page.goto(`${BASE_URL}/modules/highfield/proposals/t5qEMoapEftr5ijLEop8`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/grab-proposal.png`, fullPage: true });

  const dlPromise = page.waitForEvent('download', { timeout: 180000 });
  await page.locator('button:has-text("Download"), button:has-text("PDF")').first().click({ force: true });
  const dl = await dlPromise;
  await dl.saveAs(`${OUT}/CL380-grabbed.pdf`);
  console.log('  💾 PDF saved, size:', fs.statSync(`${OUT}/CL380-grabbed.pdf`).size);
  expect(true).toBeTruthy();
});
