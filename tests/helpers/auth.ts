import { type Page } from '@playwright/test';

export const BASE_URL = 'https://dev--studio-2290360004-3b963.asia-southeast1.hosted.app';
export const TEST_EMAIL = 'billh@nsmarine.com.au';
export const TEST_PASSWORD = 'Bill2026!';

/**
 * Logs the test user into HelmLogic and waits until the post-login route loads.
 * Reusable across all specs — mirrors the pattern established in v1.2-features.spec.ts.
 */
export async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Let Firebase Auth SDK initialize

  const emailInput = page.locator('input[placeholder="name@example.com"]').first();
  await emailInput.waitFor({ timeout: 10000 });
  await emailInput.click();
  await emailInput.fill(TEST_EMAIL);

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.click();
  await passwordInput.fill(TEST_PASSWORD);

  const loginButton = page.locator('button:has-text("Login")').first();
  await loginButton.waitFor({ timeout: 5000 });
  await loginButton.click();

  await page.waitForFunction(
    () => !window.location.pathname.includes('/login'),
    { timeout: 20000 }
  );
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Let dashboard fully render
}

/**
 * Navigates to the Highfield module via the dashboard card.
 * Assumes the user is already authenticated.
 */
export async function openHighfieldModule(page: Page): Promise<void> {
  await page.click('text=Highfield');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

/**
 * Clicks a named tab within a workspace (Dashboard/Catalog/Stock Management/Pricing/Settings).
 */
export async function clickTab(page: Page, label: string): Promise<void> {
  await page.locator(`[role="tab"]:has-text("${label}"), button:has-text("${label}")`).first().click();
  await page.waitForTimeout(1500);
}
