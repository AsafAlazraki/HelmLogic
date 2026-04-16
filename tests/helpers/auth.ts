import { type Page } from '@playwright/test';

// Override via env: E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD.
export const BASE_URL =
  process.env.E2E_BASE_URL ||
  'https://dev--studio-2290360004-3b963.asia-southeast1.hosted.app';
export const TEST_EMAIL = process.env.E2E_EMAIL || 'billh@nsmarine.com.au';
export const TEST_PASSWORD = process.env.E2E_PASSWORD || 'Bill2026!';

/**
 * Logs the test user into HelmLogic and waits until the post-login route loads.
 * Reusable across all specs — mirrors the pattern established in v1.2-features.spec.ts.
 *
 * NOTE: We avoid waitForLoadState('networkidle') because Firebase uses long-lived
 * websocket/streaming connections that prevent "networkidle" from ever firing.
 * Instead we wait for specific UI elements and use 'domcontentloaded'.
 */
export async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000); // Let Firebase Auth SDK initialize

  // If already authenticated (session cookie/localStorage), the login page may redirect.
  if (!page.url().includes('/login')) {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    return;
  }

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
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000); // Let dashboard fully render
}

/**
 * Navigates to the Highfield module via the dashboard card.
 * Assumes the user is already authenticated.
 *
 * NOTE: The sidebar may also contain "Highfield" text, so we target the
 * dashboard module card specifically — it's rendered as an <a> link pointing
 * at `/[orgSlug]/modules/...`. Falls back to the first visible Highfield element
 * if the link locator doesn't resolve.
 */
export async function openHighfieldModule(page: Page): Promise<void> {
  // Dashboard module cards are <Link> elements wrapping a <Card>.
  const moduleLink = page.locator('a[href*="/modules/"]').filter({ hasText: /highfield/i }).first();
  if (await moduleLink.isVisible().catch(() => false)) {
    await moduleLink.click();
  } else {
    // Fallback: click the first visible Highfield node (excluding hidden sidebar items).
    await page.locator('text=Highfield').first().click();
  }
  await page.waitForLoadState('domcontentloaded');
  // Wait for any tab to appear, indicating the module workspace has loaded.
  await page.waitForSelector('[role="tab"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

/**
 * Clicks a named tab within a workspace (Dashboard/Catalog/Stock Management/Pricing/Settings).
 * Uses role="tab" to disambiguate from sidebar links with identical text.
 */
export async function clickTab(page: Page, label: string): Promise<void> {
  await page.getByRole('tab', { name: label }).first().click();
  await page.waitForTimeout(1500);
}
