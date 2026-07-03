import { test } from '@playwright/test';
import { login, BASE_URL } from './helpers/auth';

/** Phase 6 debug 2 — param stripping isolation. */
test('non-org quote URL + param watch', async ({ page }) => {
  test.setTimeout(120000);
  await login(page);
  // Log every URL change
  await page.exposeFunction('urlLog', (u: string) => console.log('URLCHANGE', u));
  await page.addInitScript(() => {
    const emit = () => (window as any).urlLog?.(location.href);
    const push = history.pushState.bind(history);
    const rep = history.replaceState.bind(history);
    history.pushState = (...a: any[]) => { (push as any)(...a); emit(); };
    history.replaceState = (...a: any[]) => { (rep as any)(...a); emit(); };
    window.addEventListener('popstate', emit);
  });
  const url = `${BASE_URL}/modules/M1Yf3R9igpJDxJnOVr6f/quote/sp560?range=nQ2LE50z9Tbf2uss0Ote&vendor=LafOLpLb6QIFE856TiD4`;
  console.log('goto (no org slug):', url);
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(10000);
  console.log('final url:', page.url());
  const body = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log('BODY:', JSON.stringify(body));
  await page.screenshot({ path: 'test-results/ultimate-debug3.png', fullPage: true });
});
