import { expect, type Page, type Locator } from '@playwright/test';

/**
 * Assertive helpers for HelmLogic E2E tests.
 *
 * Philosophy: tests should FAIL when functionality is broken, not silently skip.
 * These helpers favour strong assertions over best-effort checks, and they
 * target the specific post-v1.3 UX patterns (tabs synced to URL, toast-based
 * save feedback, refresh-restores-state).
 */

/**
 * Waits for a toast (sonner/shadcn) to appear and optionally matches text.
 * Throws if no toast appears within timeout — save flows MUST produce a toast.
 */
export async function waitForToast(
  page: Page,
  options: { text?: RegExp | string; timeout?: number } = {}
): Promise<Locator> {
  const { text, timeout = 10000 } = options;
  // shadcn/sonner toasts render with role="status" or as list items inside an
  // [aria-live] region. Radix Toast also uses role="status".
  const toastLocator = text
    ? page.locator('[role="status"], [data-sonner-toast], li[data-state="open"]').filter({ hasText: text })
    : page.locator('[role="status"], [data-sonner-toast], li[data-state="open"]');

  const toast = toastLocator.first();
  await toast.waitFor({ state: 'visible', timeout });
  return toast;
}

/**
 * Asserts NO error-boundary / crash UI is visible on the page.
 * Call after any navigation/action that could trigger a ReferenceError or
 * render-time exception.
 */
export async function assertNoCrash(page: Page, timeout = 1500): Promise<void> {
  const crashText = page.locator(
    'text=/SOMETHING WENT WRONG|Application error|Unhandled|ReferenceError|TypeError/i'
  ).first();
  const visible = await crashText.isVisible({ timeout }).catch(() => false);
  if (visible) {
    const text = await crashText.textContent().catch(() => '(no text)');
    throw new Error(`Page crashed with error UI visible: ${text}`);
  }
}

/**
 * Reloads the page and runs an assertion. Used to verify that UI state
 * (active tab, current view, etc.) survives a browser refresh.
 *
 * Fails with a clear message if the post-reload state doesn't match.
 */
export async function reloadAndAssert(
  page: Page,
  assertion: () => Promise<void>,
  options: { waitAfterReload?: number } = {}
): Promise<void> {
  const { waitAfterReload = 2500 } = options;
  const urlBefore = page.url();
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(waitAfterReload);
  await assertNoCrash(page);
  const urlAfter = page.url();
  // Sanity: the URL path + search params should match (auth may still be settling).
  if (new URL(urlBefore).pathname !== new URL(urlAfter).pathname) {
    throw new Error(
      `URL path changed on reload. Before: ${urlBefore} — After: ${urlAfter}. ` +
      `Refresh persistence is broken: user was redirected instead of staying put.`
    );
  }
  await assertion();
}

/**
 * Clicks a tab by its accessible role name. Asserts the tab panel becomes
 * active (data-state="active") rather than just clicking blindly.
 */
export async function openTab(page: Page, label: string): Promise<void> {
  const tab = page.getByRole('tab', { name: label }).first();
  await expect(tab).toBeVisible({ timeout: 10000 });
  await tab.click();
  // Verify the tab actually activated.
  await expect(tab).toHaveAttribute('data-state', 'active', { timeout: 5000 });
  await page.waitForTimeout(800); // brief paint wait for content
}

/**
 * Extracts the `tab` URL search parameter. Returns null if absent.
 * Used to verify that tab-sync-to-URL is working after user interaction.
 */
export function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

/**
 * Waits for a Firestore-backed value to settle. After a save we often need
 * a brief moment for the snapshot listener to push the new value back into
 * the UI. Use this in place of a raw waitForTimeout so the intent is clear.
 */
export async function waitForFirestoreSettle(page: Page, ms = 2500): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * Navigates to Catalog → first range → first model and opens the editor.
 * Returns true if a model was reached, false if the catalog had no data
 * (tests should fail in that case, not skip).
 */
export async function openFirstModelEditor(page: Page): Promise<boolean> {
  await openTab(page, 'Catalog');
  await page.waitForTimeout(1500);

  const rangeCard = page.locator('text=/Classic|Sport|Roll[- ]?Up|Adventure|Patrol|Ultra[- ]?Light/i').first();
  const hasRange = await rangeCard.isVisible().catch(() => false);
  if (!hasRange) return false;
  await rangeCard.click();
  await page.waitForTimeout(2000);

  const modelCell = page.locator('text=/^(CL|SP|RU|AL|PA|UL)\\d{3}/').first();
  const hasModel = await modelCell.isVisible().catch(() => false);
  if (!hasModel) return false;
  await modelCell.click();
  // Model editor transition has a 1200ms timeout in code
  await page.waitForTimeout(2500);

  // Verify editor is actually open (Update Config button is a reliable marker)
  const saveBtn = page.locator('button:has-text("Update Config"), button:has-text("Update Master")').first();
  return await saveBtn.isVisible({ timeout: 5000 }).catch(() => false);
}

/**
 * Reads all visible toast messages as a string[] — useful for debugging
 * when an assertion fails. Doesn't throw if none present.
 */
export async function getToastMessages(page: Page): Promise<string[]> {
  const toasts = page.locator('[role="status"], [data-sonner-toast]');
  const count = await toasts.count();
  const messages: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await toasts.nth(i).textContent().catch(() => null);
    if (text) messages.push(text.trim());
  }
  return messages;
}
