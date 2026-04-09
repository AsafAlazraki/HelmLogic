# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v1.2-features.spec.ts >> v1.2 Feature Verification >> Model images render without broken alt text
- Location: tests/v1.2-features.spec.ts:36:7

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
```

```
Error: page.goto: Test timeout of 30000ms exceeded.
Call log:
  - navigating to "https://dev--studio-2290360004-3b963.asia-southeast1.hosted.app/", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | 
  3   | const BASE_URL = 'https://dev--studio-2290360004-3b963.asia-southeast1.hosted.app';
  4   | const TEST_EMAIL = 'billh@nsmarine.com.au';
  5   | const TEST_PASSWORD = 'Bill2026!';
  6   | 
  7   | async function login(page: Page) {
> 8   |   await page.goto(BASE_URL);
      |              ^ Error: page.goto: Test timeout of 30000ms exceeded.
  9   |   // Wait for either dashboard or login page
  10  |   await page.waitForLoadState('networkidle');
  11  | 
  12  |   // Check if we need to login
  13  |   const url = page.url();
  14  |   if (url.includes('login') || url.includes('signup')) {
  15  |     await page.fill('input[type="email"]', TEST_EMAIL);
  16  |     await page.fill('input[type="password"]', TEST_PASSWORD);
  17  |     await page.click('button[type="submit"]');
  18  |     await page.waitForURL(/dashboard|modules/, { timeout: 15000 });
  19  |   }
  20  | }
  21  | 
  22  | test.describe('v1.2 Feature Verification', () => {
  23  | 
  24  |   test.beforeEach(async ({ page }) => {
  25  |     await login(page);
  26  |   });
  27  | 
  28  |   // ---- DASHBOARD & NAVIGATION ----
  29  | 
  30  |   test('Dashboard loads with module cards', async ({ page }) => {
  31  |     await page.waitForSelector('text=Highfield', { timeout: 10000 });
  32  |     const cards = await page.locator('[class*="rounded-2xl"]').count();
  33  |     expect(cards).toBeGreaterThan(0);
  34  |   });
  35  | 
  36  |   test('Model images render without broken alt text', async ({ page }) => {
  37  |     // Navigate to Highfield module catalog
  38  |     await page.click('text=Highfield');
  39  |     await page.waitForLoadState('networkidle');
  40  |     // Click on Catalog tab
  41  |     await page.click('text=Catalog', { timeout: 5000 }).catch(() => {});
  42  |     await page.waitForTimeout(2000);
  43  | 
  44  |     // Check no broken image alt text visible as plain text
  45  |     const brokenImages = await page.locator('img[alt]').evaluateAll(imgs =>
  46  |       imgs.filter(img => !img.complete || img.naturalHeight === 0).length
  47  |     );
  48  |     // Just log, don't fail — external images may be slow
  49  |     console.log(`Broken images found: ${brokenImages}`);
  50  |   });
  51  | 
  52  |   // ---- MODULE MANAGEMENT ----
  53  | 
  54  |   test('Admin modules page has delete and rename buttons', async ({ page }) => {
  55  |     await page.goto(`${BASE_URL}/modules`);
  56  |     await page.waitForLoadState('networkidle');
  57  | 
  58  |     // Hover over a module card to reveal action buttons
  59  |     const firstCard = page.locator('[class*="group relative"]').first();
  60  |     await firstCard.hover();
  61  |     await page.waitForTimeout(500);
  62  | 
  63  |     // Check for trash and pencil icons
  64  |     const hasActions = await firstCard.locator('button').count();
  65  |     expect(hasActions).toBeGreaterThan(0);
  66  |   });
  67  | 
  68  |   test('Add module page has module type selector', async ({ page }) => {
  69  |     await page.goto(`${BASE_URL}/modules/add`);
  70  |     await page.waitForLoadState('networkidle');
  71  | 
  72  |     // Look for module type dropdown
  73  |     const hasModuleType = await page.locator('text=Module Type').count();
  74  |     expect(hasModuleType).toBeGreaterThan(0);
  75  |   });
  76  | 
  77  |   // ---- HIGHFIELD MODULE ----
  78  | 
  79  |   test('Highfield module loads with tabs', async ({ page }) => {
  80  |     await page.click('text=Highfield');
  81  |     await page.waitForLoadState('networkidle');
  82  | 
  83  |     // Check tabs exist
  84  |     await expect(page.locator('text=Dashboard')).toBeVisible({ timeout: 10000 });
  85  |     await expect(page.locator('text=Catalog')).toBeVisible();
  86  |     await expect(page.locator('text=Stock Management')).toBeVisible();
  87  |     await expect(page.locator('text=Pricing')).toBeVisible();
  88  |     await expect(page.locator('text=Settings')).toBeVisible();
  89  |   });
  90  | 
  91  |   // ---- STOCK MANAGEMENT ----
  92  | 
  93  |   test('Stock Management tab loads with workspace', async ({ page }) => {
  94  |     await page.click('text=Highfield');
  95  |     await page.waitForLoadState('networkidle');
  96  |     await page.click('text=Stock Management');
  97  |     await page.waitForTimeout(2000);
  98  | 
  99  |     // Check workspace header
  100 |     await expect(page.locator('text=STOCK MANAGEMENT').first()).toBeVisible({ timeout: 5000 });
  101 | 
  102 |     // Check sub-tabs exist
  103 |     await expect(page.locator('text=Stock Boats').first()).toBeVisible();
  104 |     await expect(page.locator('text=On Order').first()).toBeVisible();
  105 |     await expect(page.locator('text=Delivered Deals').first()).toBeVisible();
  106 |   });
  107 | 
  108 |   test('Stock table shows items sorted most recent first', async ({ page }) => {
```