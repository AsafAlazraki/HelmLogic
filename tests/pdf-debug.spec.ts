import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';
import fs from 'fs';

test.use({ viewport: { width: 1920, height: 1080 } });
test('debug PDF render error', async ({ page }) => {
  test.setTimeout(180000);
  fs.mkdirSync('test-results/cl380', { recursive: true });
  const errors: string[] = [];
  const warns: string[] = [];
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'warning') warns.push(m.text());
  });
  page.on('pageerror', e => errors.push(`pageerror: ${String(e)}`));

  await login(page);
  await page.goto(`${BASE_URL}/modules/highfield/proposals/t5qEMoapEftr5ijLEop8`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);

  console.log('--- console errors BEFORE click ---');
  errors.forEach(e => console.log('  ❌', e.slice(0, 200)));
  errors.length = 0;

  await page.locator('button:has-text("Download"), button:has-text("PDF")').first().click({ force: true });
  console.log('--- clicked Download PDF, waiting 30s for errors / download ---');
  const dl = await page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(2000);

  console.log(`--- download triggered: ${dl ? 'YES' : 'NO'} ---`);
  console.log('--- errors after click ---');
  errors.forEach(e => console.log('  ❌', e.slice(0, 300)));
  console.log('--- warnings ---');
  warns.slice(0, 10).forEach(w => console.log('  ⚠', w.slice(0, 200)));

  expect(true).toBeTruthy();
});
