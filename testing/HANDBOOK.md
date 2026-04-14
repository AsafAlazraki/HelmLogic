# HelmLogic Testing Handbook

> **Welcome to the HelmLogic team.** This document walks you through the product,
> your environment, the test workflow, and every UI surface you're expected to
> cover. Read it end-to-end once, then use it as your reference going forward.

---

## Part 1: Welcome & Product Overview

### What is HelmLogic?

HelmLogic is a SaaS platform for marine dealers — the businesses that sell boats,
motors, and trailers to consumers. It replaces the spreadsheets, emails, and
disconnected pricing docs that most dealers currently rely on with a single
source of truth for:

- **Product data** — boat models, specifications, factory options, pricing
- **Quoting** — building a customer proposal (boat + motor + trailer + accessories)
- **Stock management** — tracking inventory, on-order units, delivered deals
- **Sub-dealer distribution** — larger dealers can share stock and pricing with
  smaller sub-dealers
- **Promotions** — vendor rebates (Yamaha etc.) that auto-apply to eligible quotes

### Who uses it?

- **Primary client**: Northside Marine (Sydney) — an Australian Highfield Boats dealer
- **Users within Northside**: Management (Bill Hull, our test user), sales consultants, stock managers
- **Sub-dealers**: Smaller marine shops that sell Northside's stock
- **Future clients**: Other boat/motor dealers in AU/NZ

### The Core User Flow

```
Vendor sends data (boats, motors, parts)
            ↓
Data Warehouse stores master product info
            ↓
Organisation (e.g., Northside) creates a Module linking to the vendor
            ↓
Pricing Workspace — dealer sets cost + markup = sell price across levels
            ↓
Quote Builder — sales consultant picks boat + options + motor + trailer + dealer fit
            ↓
Finalize → Customer Proposal (PDF) OR Save as Stock
            ↓
Stock Management tracks inventory, promotions apply automatically
```

### Key Terminology (You'll See These Everywhere)

| Term | Meaning |
|------|---------|
| **Vendor** | A brand like Highfield, Yamaha, or a parts supplier |
| **Range** | A series within a brand (Classic, Sport, Patrol for Highfield) |
| **Model** | A specific boat (CL340, SP390) — has features, specs, options |
| **Variant / SKU** | A specific material + colour combination of a model, with a price |
| **Module** | An organisation's access point to a vendor — has its own pricing, stock, settings |
| **Dealer Fit** | Accessories dealers add to a quote (safety gear, electronics, canvas work) |
| **Master Price File (MPF)** | Supplier price lists imported as data (parts, accessories) |
| **Price Level** | A pricing tier: `hull_cash` (retail), `hull_trade` (trade dealers), `hull_subdealer`, etc. |
| **Sub-dealer** | A smaller org that belongs to a larger parent org (inherits parent's stock/pricing) |
| **Prop Comes Standard** | Optional toggle on a motor — ticks if the standard prop is included |
| **Promotion** | A vendor rebate that reduces the total quote price (auto-ticked when active) |

---

## Part 2: Getting Set Up

### Prerequisites

- **Node.js 18+** (check: `node --version`)
- **Git** (check: `git --version`)
- A **GitHub account** with access to the repo (ask Asaf)

### Clone & Install

```bash
git clone <REPO_URL>
cd HelmLogic
git checkout claude/app-overview-wKiZ1   # our dev branch
npm install
npx playwright install                    # installs browser drivers for automated tests
```

### Credentials

- **Dev URL**: https://dev--studio-2290360004-3b963.asia-southeast1.hosted.app/
- **Login**: billh@nsmarine.com.au / Bill2026!
- **Role**: Managing Director, Northside Marine — has admin-level access

### Folder Layout (What You Care About)

```
HelmLogic/
├── src/              ← Application code (read-only for QA)
├── tests/            ← Playwright automated tests (add new ones here)
├── testing/          ← YOUR home — this handbook + per-release test artifacts
│   ├── HANDBOOK.md   ← You are here
│   ├── README.md
│   ├── shared/       ← Templates
│   └── v1.X/         ← Per-release folders
├── tasks/            ← Release notes, session handovers (reference, not your primary workspace)
└── playwright.config.ts
```

### Branches

- `claude/app-overview-wKiZ1` — **dev**, auto-deploys to the dev URL above
- `main` — **production**, auto-deploys to the production URL
- `claude/v1.3-release` and similar — feature branches (merged into dev then main)

---

## Part 3: Running Automated Tests

We have a Playwright E2E suite covering 46 tests across 6 spec files. You should
run these before every release and when investigating a bug.

### Commands

```bash
# Full suite (all 46 tests, ~5 min)
npm run test:e2e

# Smoke tests only (6 critical paths, ~30 sec) — run this before merging to main
npm run test:e2e:smoke

# Watch the browser as tests run (useful for debugging)
npx playwright test --headed

# Single file
npx playwright test tests/settings.spec.ts

# Single test by name
npx playwright test -g "Stock table column order"

# Debug mode — step through one test
npx playwright test tests/critical-paths.spec.ts --debug

# View HTML report after a run
npx playwright show-report
```

### Test Files & Coverage

| File | Covers |
|------|--------|
| `critical-paths.spec.ts` | 6 smoke tests — login, Highfield tabs, catalog, model editor, quote flow, proposal view |
| `quote-builder.spec.ts` | 8 tests — all 6 steps of the quote builder including v1.3 features |
| `stock-management.spec.ts` | 4 tests — sub-tabs, column order, detail panel, location dropdown |
| `settings.spec.ts` | 5 tests — dealer fit category management, Yamaha settings isolation |
| `yamaha-motors.spec.ts` | 5 tests — motor catalog, name/ID check, multi-engine HP format |
| `v1.2-features.spec.ts` | Older regression suite for v1.2 features |

### Interpreting Failures

When a test fails, Playwright saves:

- **Screenshot** at time of failure (`test-results/<test-name>/test-failed-1.png`)
- **Trace** (`trace.zip`) — timeline of every action with DOM snapshots
- **Error context** (`error-context.md`) — DOM tree at the time

To inspect a trace:
```bash
npx playwright show-trace test-results/<test-name>/trace.zip
```

**Common failure patterns you'll see:**

1. `locator resolved to <span ... collapsible=icon]:hidden>` — the test is matching
   a hidden sidebar link. If you see this, the test selector needs to be
   role-based (`getByRole('tab', { name: '...' })`).
2. `Test timeout ... waitForLoadState('networkidle')` — Firebase keeps a live
   websocket; the page never reaches "idle". Replace with `domcontentloaded`.
3. `element is not visible` after click — race condition; add a `waitForSelector`
   before the action.

### Adding a New Test

Copy an existing test as a starting point, then:

1. Use `test.describe('Feature Area', () => { ... })` to group related tests
2. Use the `login()` helper from `tests/helpers/auth.ts`
3. Use **role-based selectors**: `page.getByRole('tab', { name: 'Catalog' })`
4. Prefer `page.waitForSelector(...)` over `page.waitForTimeout(...)`
5. Never use `waitForLoadState('networkidle')` — always use `domcontentloaded`
6. Verify discovery: `npx playwright test --list`

---

## Part 4: Manual Testing Workflow

Automated tests catch regressions. Manual testing catches everything else —
visual polish, edge cases, new features before we write automated coverage,
and the "does this actually feel right?" check.

### When to do manual testing

- **New feature just landed** — walk through the feature before we write a
  Playwright test for it. Often reveals issues the automation would miss.
- **Exploratory** — spend 30 min clicking around a part of the app you haven't
  touched recently. You'll find things.
- **Customer-reported bugs** — always reproduce manually first.
- **Visual/polish** — fonts, spacing, colours, hover states, empty states,
  responsive behaviour.

### Test Case Format

Use `testing/shared/test-case-template.md`. Every test case has:

- **Test ID** (e.g., `TC-v1.3-07`)
- **Preconditions** (what must be true before starting)
- **Steps** (numbered, specific)
- **Expected result** (what should happen)
- **Actual result** (what did happen)
- **Status** (Pass / Fail / Blocked / Skipped)

### Picking What to Test (Risk-Based)

You can't test everything every release. Prioritise by risk:

1. **What changed** — read the release notes, test those features deeply
2. **What breaks often** — the quote builder, pricing workspace, proposal PDF
3. **What affects customers** — anything user-facing that a dealer would notice
4. **What breaks silently** — data that saves incorrectly and only shows up in
   proposals or reports later

### Writing a Good Bug Report

Use `testing/shared/bug-report-template.md`. Every bug needs:

- Clear title ("Photo change doesn't persist in catalog grid" not "images broken")
- Severity (Critical / Major / Minor / Cosmetic)
- Exact steps to reproduce
- Expected vs actual behaviour
- Screenshots or screen recording
- Browser console errors if any
- Firestore document paths if relevant

---

## Part 5: Complete UI Specification

The rest of this document is your reference map of every screen, tab, button,
and flow in HelmLogic. Use it to:

1. Verify new features match the spec
2. Write test cases with accurate expectations
3. Understand how one area connects to another

---

## Known Modules on Dashboard

| Module | Type | Vendor |
|--------|------|--------|
| Highfield | Catalog (Boat Brand) | Highfield Boats |
| Yamaha | Motor Brand | Yamaha Outboards (216 motors) |
| Master Price File | Master Price File | Internal |
| Used Boats | Placeholder | — |
| Website Listings | Placeholder | — |

---

## Navigation Map

```
Dashboard
├── Highfield Module
│   ├── Dashboard tab
│   ├── Catalog tab
│   │   ├── Range cards (Classic, Sport, Patrol, Adventure, Roll-Up, Ultra-Light, Coaster)
│   │   ├── Model cards (e.g., CL260, CL340, SP390, PA540)
│   │   └── Model Editor
│   │       ├── Overview tab
│   │       ├── Variants tab
│   │       ├── Factory Options tab
│   │       ├── Trailer Config tab
│   │       ├── Motor Options tab
│   │       └── Dealer Fit tab (categories from global + module + motor)
│   ├── Stock Management tab
│   │   ├── Stock Boats sub-tab
│   │   ├── On Order sub-tab
│   │   ├── Pending sub-tab (NEW v1.3)
│   │   ├── Delivered Deals sub-tab
│   │   ├── Hold Requests sub-tab
│   │   ├── Map View sub-tab
│   │   └── Assignments sub-tab
│   ├── Pricing tab
│   │   ├── Pricing Matrix sub-tab
│   │   └── Price Lists sub-tab
│   └── Settings tab
│       ├── Associated Vendors (with Edit button)
│       ├── Dealer Fit Categories (boat categories)
│       ├── Motor Dealer Fit Categories (motor categories — Rigging, Propeller, General)
│       ├── Trailer Dealer Fit Categories (NEW v1.3 — trailer categories)
│       └── Module Roles (Brand Captain, Module Manager)
├── Yamaha Module
│   ├── Catalog tab (motor cards grouped by HP range)
│   │   └── Motor Detail Sheet (side panel on click)
│   │       ├── Hero image
│   │       ├── Specs grid
│   │       ├── Accessories (Rigging, Propeller, General)
│   │       └── Dealer Fit Options (Master Data Browser)
│   ├── Pricing Manager tab
│   ├── Promotions tab
│   └── Settings tab
│       ├── Associated Vendors
│       ├── Dealer Fit Categories
│       └── Module Roles
├── Master Price File Module
│   ├── Dataset tabs
│   ├── Search bar
│   └── Editable data table
├── Used Boats (placeholder with cover image)
└── Website Listings (placeholder with cover image)
```

---

## Highfield Ranges & Models

| Range | Models |
|-------|--------|
| Classic | CL260, CL290, CL290FT, CL310, CL310FT, CL310LS, CL340, CL340FT, CL340LS, CL340MAX, CL360, CL360LS, CL360MAX, CL380, CL380LS, CL380MAX, CL400, CL420, CL460 |
| Sport | SP300, SP330, SP360, SP390, SP420, SP460 |
| Patrol | PA420, PA460, PA540, PA540ST, PA600 |
| Adventure | AL series |
| Roll-Up | RU series |
| Ultra-Light | UL series |
| Coaster | Coaster series |

---

## Complete UI Specification

### 1. DASHBOARD

**Route**: `/{orgSlug}/dashboard` or `/dashboard`

**Expected Content**:
- **Module Cards** (grid): Cover image or placeholder, module name (bold uppercase), module type badge, click to open module
- **Recent Proposals** (list): Up to 8 recent quotes — Quote #, Customer name, Model, Date, Total price. Click to view proposal detail.
- **Stock Summary Cards**: In Stock count, On Order count, locations count

---

### 2. HIGHFIELD MODULE WORKSPACE

**Route**: `/modules/{moduleId}` (catalog type)

**Header**: Blue gradient banner, module name (large italic uppercase), vendor info

#### Tab 1: Dashboard
- Module statistics, quick access buttons (New Quote, View Catalog, Manage Stock), recent activity

#### Tab 2: Catalog
- **Ranges Screen**: Grid of range cards (5 columns) with images and names. Click → models view.
- **Models Screen**: Grid of model cards with cover images, model name, model code. Click → model editor.
- **Model Editor** (tabs):
  - **Overview**: Cover image, description, standard features, specs, registration pricing
  - **Variants**: Table of material + color combos with SKU, cost, sell price
  - **Factory Options**: Grid by category (Consoles, Seats, Rigging). Name, price, image, applicable variants, associated seat ID
  - **Trailer Config**: Toggle, trailer name/price/image, trailer options sub-table
  - **Motor Options**: Motor configurations by type (Single/Twin). Motor grid with hide/show management. Each motor shows image, HP, specs.
  - **Dealer Fit**: Categories from THREE sources (global + module boat + module motor). Each category shows existing selections with "Add Selection" button → opens Master Data Browser

#### Tab 3: Stock Management
- **Sub-tabs**: Stock Boats, On Order, **Pending (NEW v1.3)**, Delivered Deals, Hold Requests, Map View, Assignments
- **Table columns (v1.3 order)**: **Model** (bold, first per customer request), Colour, Stock Number, Status, Location, Date into Stock, Days in Stock, Sold By, Label, Serial Number, Material, Notes
- **Filters**: Search, status dropdown, location dropdown, material filter
- **Stock Detail Panel**:
  - **Wide (900px)** for quote-origin items: Left column (photos, details, PDFs, actions) + Right column (MiniProposalView with full quote config)
  - **Narrow (480px)** for manual items: Single column only
  - **Location is an interactive dropdown (NEW v1.3)** — users can change a stock item's location directly from the panel without opening a separate edit dialog; selection persists immediately to Firestore

#### Tab 4: Pricing
- **Sub-tabs**: Pricing Matrix (editable cost components) + Price Lists
- Sell columns show EXCL GST and INCL GST
- Publish Prices button

#### Tab 5: Settings
- **Associated Vendors**: Card with vendor list and Edit button
- **Dealer Fit Categories**: Card — add/edit/delete boat dealer fit category names
- **Motor Dealer Fit Categories**: SEPARATE card below — add/edit/delete motor categories (e.g., Rigging, Propeller, General). This controls what motor dealer fit categories appear in the quote builder.
- **Trailer Dealer Fit Categories (NEW v1.3)**: SEPARATE card — add/edit/delete trailer dealer fit category names. Stored on `modules/{moduleId}.trailerDealerFitCategories[]`. Drives the trailer dealer fit section on Step 4 of the quote builder.
- **Module Roles**: Brand Captain + Module Manager dropdowns with save

---

### 3. QUOTE BUILDER (6 Steps)

**Route**: Start from Catalog → select range → select model → enters quote flow

**Layout**: Left = image carousel, Right = step content (scrollable), Bottom = prev/next + price total

#### Step 1: Boat Base
- Material selector (PVC / HYP toggle)
- Color/variant cards (filtered by material)
- Registration options (12mo rego checkbox → sticker → tender-to)

#### Step 2: Factory Options
- Grouped by category with blue category headers
- Card grid per category — click to select, blue border when selected
- **Console-seat pairing**: Selecting a console auto-selects its paired seat (locked with lock icon, "Paired with" badge)
- **Additional Factory Boat Notes/Options** (renamed from "Custom Tactical Additions" in v1.3) — free-form form at bottom with name, price, description inputs

#### Step 3: Motor
- **Before selection**: Grid of motor cards (2 columns) with image, HP badge, name, price
  - **HP Badge (v1.3)**: Multi-engine configurations now display as `2 × 300 HP` (etc.) rather than the old `2 HP` bug
- **After selection**:
  - Grid HIDES
  - **Hero card** appears: full-width, motor image, HP badge, model name, specs badges (Shaft Length, Control, Starting), large price
  - **"Choose Another Motor" button** below hero card — clicking it shows the grid again
  - **"Prop Comes Standard" toggle** (green card, default OFF, user ticks it if applicable). Auto-turns OFF if user selects a different propeller from accessories or dealer fit.
  - **Pre-Rig Information section (NEW v1.3)** — displays any pre-rig notes/specs tied to the selected motor
  - **Motor accessories** slide in grouped by category (Propeller, Rigging, General) — Propeller and Rigging are single-select (radio behavior)
  - **Motor Dealer Fit** (blue-themed headers): Categories from boat module's `motorDealerFitCategories`. Shows dealer fit selections if configured. Only appears if categories exist AND selections have been created.
  - **Dealer Services section (NEW v1.3)**: Toggles for **NSM Extended Warranty** and **Service Plan**
  - **Promotions & Offers section (NEW v1.3)**: Active Yamaha rebates/promotions auto-tick when eligible (date-filtered against promotion validity window). User can untick to exclude. Discount flows through to totals.

#### Step 4: Trailer
- Trailer package card (click to select)
- Trailer hardware options (if trailer selected)
- **Additional Factory Trailer Notes/Options (NEW v1.3)** — free-form notes + custom option form
- **Trailer Dealer Fit (NEW v1.3)** — categories sourced from `modules/{moduleId}.trailerDealerFitCategories[]`
- Trailer registration toggle

#### Step 5: Dealer Fit (Boat only)
- Boat dealer fit categories only (motor and trailer categories are on Steps 3 and 4)
- Empty state: "No dealer fit options configured" (if no selections exist)

#### Step 6: Summary
- Cards for each section: Base Vessel, Factory Options, Powertrain, Trailer, Dealer Fitments
- Each item removable (hover → X button)
- **PDF attach button per section (NEW v1.3)** — Upload button on each section card (Boat, Motor, Trailer, Dealer Fit). PDFs are stored in Firebase Storage under `quotes/{quoteId}/section-pdfs/{section}.pdf` and URLs are saved to `sectionPdfUrls.{section}` on the quote doc.
- **Admin & Trade-In card (NEW v1.3)** — captures `adminDetails.tradeIn`, `adminDetails.insurance`, `adminDetails.finance`, `adminDetails.timing`
- "Finalize Project" button → opens Finalize Dialog

**Technical Utilities buttons (bottom action row)**:
- **Standard Features** (renamed from "Features" in v1.3) — opens standard features dialog for the selected boat
- **Specs (Hull)** — hull specifications dialog
- **Engine Specs (NEW v1.3)** — appears only when a motor is selected; shows engine specification sheet
- **Trailer Specs (NEW v1.3)** — appears only when a trailer is selected; shows trailer specification sheet

---

### 4. FINALIZE QUOTE DIALOG

**Two Modes** (toggle between):

| Mode | Fields | Button |
|------|--------|--------|
| Customer Proposal | Full Name (required), Email, Phone, Company, Address | Create Proposal |
| Save as Stock | Stock Number (auto if empty), Status dropdown, Location dropdown, Customer picker (required for sold statuses) | Save to Stock |

**Stock Statuses**: Pending (yellow), On Order (blue), In Stock (green), In Stock - Sold (purple), On Order - Sold (orange)

---

### 5. PROPOSAL VIEW

**Route**: `/modules/{moduleSlug}/proposals/{quoteId}` or click from dashboard

**Expected Content**:
- Header: quote number, date, consultant name
- Client profile: name, email, phone, company
- Boat cover image (background, faded)
- Investment summary: Vessel Base, Power Pack, options, subtotals, GST, Grand Total
- Standard Features list
- Power & Propulsion section with motor details
- Dealer fit items with category badges
- Action buttons: Audit, Duplicate, Download PDF
- **Must load without crashing** — no "SOMETHING WENT WRONG" errors

---

### 6. YAMAHA MOTOR MODULE

**Route**: `/modules/{moduleId}` (motor-brand type)

**Header**: Blue gradient, "YAMAHA OUTBOARDS", motor count, dataset name

#### Tab 1: Catalog
- Search bar, HP range filter, sort dropdown
- Motor cards grouped by HP range (2.5–25, 30–75, 90–150, 175–250, 300+)
- Each card: Motor image, **model name** (e.g., "F90CETL" — NOT Firestore document IDs), HP and shaft badges, price, accessory count
- Click → Motor Detail Sheet (side panel)

#### Motor Detail Sheet (~480px side panel)
- Hero image (or Ship placeholder)
- Quick stats badges (HP, shaft, price)
- Specifications grid (2 columns, max 20 fields, excludes internal fields)
- **Accessories** grouped by Rigging/Propeller/General — each with name, Std/Optional badge, price
- **Dealer Fit Options** section at bottom: Same Master Data Browser experience as Highfield. Shows categories from module's `moduleDealerFitCategories`. Each category has "Add Selection" button → opens Master Data Browser dialog.

#### Tab 2: Pricing Manager
- Same as Master Price File module (editable tables, import/export)

#### Tab 3: Promotions
- Active/Inactive filter tabs
- Promotion cards: name, status badge, amount, type, applies-to, date range
- Create/Edit dialog with image + PDF upload, display toggles, audit changelog
- Actions: Edit, Activate/Deactivate, Delete

#### Tab 4: Settings
- **Associated Vendors**: Edit button for vendor associations
- **Dealer Fit Categories**: Add/edit/delete category names
- **Module Roles**: Brand Captain + Module Manager

---

### 7. MASTER PRICE FILE MODULE

**Route**: `/modules/{moduleId}` (master-price-file type)

**Toolbar**: Export (Excel/CSV), Import Excel File, Replace Data, Add Row

**Content**:
- Dataset tabs (one per imported Excel sheet)
- Search bar with results counter ("X of Y rows")
- Editable table: Sticky row numbers + sticky first column with shadow, inline cell editing (click to edit, blur to save), image column auto-detection with thumbnails, currency formatting for numeric fields
- Row delete button (hover, right side)

---

### 8. MASTER DATA BROWSER DIALOG

**Triggered From**: Dealer Fit "Add Selection" button (on any module or motor detail panel)

**Layout**:
- **Top**: Search bar (auto-filters ≥2 chars, max 50 results), Category dropdown (shows the category you clicked from — NO duplicate text like "RiggingRigging"), Display Name input
- **Left panel**: Results — item cards with thumbnail, name, code, dataset source, price, "+" button to stage
- **Right panel**: Staged items with count, X to remove each, "Save to {Category}" button
- **On Save**: Dialog closes without crash. Selection appears under the category. **Must not show "Layers is not defined" or any other error.**

---

### 9. IMAGE HANDLING RULES

**All external images** (media.highfieldboats.com, www.highfieldboats.com):
- Use native `<img>` tags (NOT Next.js `<Image>`)
- `onError` handler hides broken image, shows Ship icon placeholder

**Expected States (for any image)**:
- **(A)** Photo loads — image visible ✓
- **(B)** Ship icon placeholder — image failed gracefully ✓
- **(C)** Broken image icon with alt text — **BUG, never acceptable** ✗

---

### 10. KEY INTERACTIONS CHECKLIST

- [ ] All module tabs load without crash
- [ ] Clicking any proposal loads without "SOMETHING WENT WRONG"
- [ ] Motor Options tab on model editor loads without crash
- [ ] Console-seat auto-pairing works (select console → seat locks)
- [ ] Motor selection: grid hides → hero card appears → "Choose Another Motor" works
- [ ] Prop Comes Standard toggle is interactive (default OFF, click to toggle)
- [ ] Prop Comes Standard auto-OFF when propeller selected from accessories
- [ ] Motor accessories: Propeller and Rigging are single-select
- [ ] Dealer fit save via Master Data Browser succeeds without crash
- [ ] Category dropdown shows category name ONCE (no duplicates)
- [ ] Price totals update on every selection change
- [ ] Stock detail panel: wide (900px) for quote-origin items, narrow (480px) for manual
- [ ] Finalize dialog: Customer Proposal mode works, Save as Stock mode works
- [ ] "Sold" statuses require customer selection
- [ ] Classic range model images: all show photo (A) or placeholder (B), never broken (C)
- [ ] Yamaha motor cards show engine names, not Firestore document IDs

---

### 11. DEALER FIT END-TO-END FLOW

This is the complete workflow for setting up and using dealer fit:

**Setup (one-time)**:
1. Go to Highfield → Settings → **Motor Dealer Fit Categories** → Add: Rigging, Propeller, General
2. Go to Highfield → Settings → **Associated Vendors** → Ensure Master Price File vendor is associated
3. Go to Highfield → Catalog → pick a model → **Dealer Fit tab**
4. Categories should show: global categories + boat categories + motor categories (Rigging, Propeller, General)
5. Click "Add Selection" on any motor category → Master Data Browser opens
6. Search for items → stage with "+" → give a name → Save
7. Selection appears under the category

**OR from Yamaha module**:
1. Go to Yamaha → Settings → **Dealer Fit Categories** → Add categories
2. Go to Yamaha → Catalog → click any motor → Motor Detail Sheet
3. Scroll to **Dealer Fit Options** at bottom
4. Click "Add Selection" → Master Data Browser → search → stage → save

**Usage in Quotes**:
1. Start a Highfield quote → reach Step 3 (Motor)
2. Select a motor → motor dealer fit categories appear below accessories
3. Select dealer fit items → they add to the quote total
4. Step 6 Summary shows all selected dealer fit items with category badges

---

### 12. KNOWN FIXED BUGS (Regression Test These)

| Bug | Was | Fix | How to verify |
|-----|-----|-----|--------------|
| Proposal crash | "orgQuoteList is not defined" | Removed stale variable refs | Click any proposal → should load |
| Classic images broken | Next.js Image optimization blocked CDN | Switched to native `<img>` | Classic range → all models show photo or placeholder |
| Motor card names | Showed Firestore doc IDs | Changed to use MODEL field | Yamaha Catalog → cards show engine names |
| Dealer fit save crash | "Layers is not defined" | Added missing Lucide import | Save any dealer fit selection → no crash |
| Category dropdown duplicate | "RiggingRigging" | Removed hardcoded SelectItems | Open Master Data Browser from Rigging → shows "Rigging" once |
| Motor options crash | "Cannot read properties of undefined (reading 'replace')" | Added null guard to formatConfigType | Model Editor → Motor Options tab → no crash |

---

### 13. PERMISSIONS REFERENCE

| Role | Can Do |
|------|--------|
| HelmLogic Admin | Everything — all modules, orgs, users |
| Managing Director (Bill Hull) | Full access to own org modules, quotes, stock, pricing, settings |
| Organisation Member | Access per role permissions (can_edit_boat_data, can_manage_stock, etc.) |
| Sub-Dealer | Read-only parent stock, own quotes, limited module access |

---

### 14. v1.3 NEW FEATURES

These features were added or substantially changed in the v1.3 release. QA should explicitly regression-test each.

#### 14.1 PDF Upload Per Section (Quote Builder Step 6)
- Each summary card (Boat, Motor, Trailer, Dealer Fit) exposes an **Upload PDF** button.
- Selecting a PDF uploads to Firebase Storage at `quotes/{quoteId}/section-pdfs/{section}.pdf`.
- Resulting download URL is persisted to `users/{uid}/quotes/{qid}.sectionPdfUrls.{boat|motor|trailer|dealerFit}`.
- Re-uploading replaces the previous PDF. A remove/clear control resets the URL to `null` on the quote doc.
- PDFs should be retrievable/linkable from the proposal view and included in any generated proposal PDF attachments where applicable.

#### 14.2 Engine Specs + Trailer Specs Buttons
- Step 6 technical utilities row:
  - **Engine Specs** button appears only when a motor is selected. Opens a dialog with full motor specification sheet.
  - **Trailer Specs** button appears only when a trailer is selected. Opens a dialog with full trailer specification sheet.
- **Standard Features** button is the renamed "Features" button — same behavior, updated label.

#### 14.3 Pre-Rig Information on Motor Page
- Step 3 (Motor) displays a Pre-Rig information panel after a motor is selected.
- Sources data from the motor's pre-rig fields (if present). Hidden when no pre-rig data exists.

#### 14.4 NSM Extended Warranty + Service Plan Toggles
- Step 3 (Motor) displays a **Dealer Services** card with two toggles:
  - **NSM Extended Warranty** → saved to `users/{uid}/quotes/{qid}.dealerServices.extendedWarranty`
  - **Service Plan** → saved to `users/{uid}/quotes/{qid}.dealerServices.servicePlan`
- Both default OFF. Toggled state flows into totals and the finalized proposal.

#### 14.5 Yamaha Rebate Auto-Apply
- Step 3 (Motor) displays a **Promotions & Offers** section.
- Currently-active Yamaha promotions matching the selected motor are auto-ticked on load.
- Filtered against each promotion's `startDate` / `endDate` window — expired or not-yet-started promos are not shown or auto-applied.
- User can untick any auto-applied promo to exclude it.
- Applied promotions saved to `users/{uid}/quotes/{qid}.appliedPromotions[]`.
- Combined discount saved to `users/{uid}/quotes/{qid}.promotionDiscount` and deducted from grand total.

#### 14.6 Trailer Factory Options + Notes
- Step 4 (Trailer) gains an **Additional Factory Trailer Notes/Options** section.
- Mirrors the boat-level custom additions: free-form name, price, description inputs plus notes field.

#### 14.7 Trailer Dealer Fit Categories
- Configured on the Highfield module at **Settings → Trailer Dealer Fit Categories** (`modules/{moduleId}.trailerDealerFitCategories[]`).
- Appears as a new block on Step 4 with Master Data Browser-driven selections, analogous to motor dealer fit.

#### 14.8 Admin & Trade-In Section (Step 6 Summary)
- New **Admin & Trade-In** card with subsections:
  - **Trade-In** — captures trade-in details (make/model/year/value, etc.)
  - **Insurance** — insurance preference / provider
  - **Finance** — finance application info
  - **Timing** — desired delivery / timing notes
- Persists to `users/{uid}/quotes/{qid}.adminDetails.{tradeIn|insurance|finance|timing}`.

#### 14.9 HP Badge Fix (Multi-Engine Configs)
- Motor cards and hero cards now render HP correctly for multi-engine configurations.
- Expected format: `2 × 300 HP` for a twin 300 HP setup, `3 × 425 HP` for triple-425 etc.
- Previous buggy output `2 HP` is the regression to watch for.

---

### 15. FIRESTORE COLLECTIONS & FIELDS (v1.3)

Reference for QA, engineering, and data verification. New or changed fields in v1.3 are flagged.

**Module-level (Highfield boat module)**
- `modules/{moduleId}.moduleDealerFitCategories[]` — boat dealer fit category names
- `modules/{moduleId}.motorDealerFitCategories[]` — motor dealer fit category names (lives on the boat module — dealer fit is configured in the context of the boat being quoted)
- `modules/{moduleId}.trailerDealerFitCategories[]` — **NEW v1.3** — trailer dealer fit category names

**Quote document (`users/{uid}/quotes/{quoteId}`)**
- `appliedPromotions[]` — **NEW v1.3** — array of applied promotion objects/IDs
- `promotionDiscount` — **NEW v1.3** — total discount applied across promotions
- `dealerServices.extendedWarranty` — **NEW v1.3** — boolean for NSM Extended Warranty toggle
- `dealerServices.servicePlan` — **NEW v1.3** — boolean for Service Plan toggle
- `adminDetails.tradeIn` — **NEW v1.3** — trade-in details object
- `adminDetails.insurance` — **NEW v1.3** — insurance details object
- `adminDetails.finance` — **NEW v1.3** — finance details object
- `adminDetails.timing` — **NEW v1.3** — timing details object
- `sectionPdfUrls.boat` — **NEW v1.3** — download URL for uploaded boat-section PDF
- `sectionPdfUrls.motor` — **NEW v1.3** — download URL for uploaded motor-section PDF
- `sectionPdfUrls.trailer` — **NEW v1.3** — download URL for uploaded trailer-section PDF
- `sectionPdfUrls.dealerFit` — **NEW v1.3** — download URL for uploaded dealer-fit-section PDF

**Firebase Storage**
- `quotes/{quoteId}/section-pdfs/{section}.pdf` — **NEW v1.3** — section PDF attachments, one object per section (`boat`, `motor`, `trailer`, `dealerFit`)

---

## Part 6: Firestore & Data

You'll occasionally need to verify that data saved correctly. Firebase Console
is your friend.

### Firebase Project

- Project ID: `studio-2290360004-3b963`
- Console: https://console.firebase.google.com/project/studio-2290360004-3b963/firestore
- Ask Asaf for read-only access

### Key Collections for QA

| Collection | What it stores | When to check |
|------------|---------------|---------------|
| `modules/{moduleId}` | Module config, dealer fit category arrays | After adding/removing categories in Settings |
| `modules/{moduleId}/promotions/{id}` | Promotion definitions | After creating/editing a promo |
| `organisations/{orgId}/dealerFitSelections/{id}` | Dealer fit items saved by this org | After "Add Selection" in the Master Data Browser |
| `users/{uid}/quotes/{quoteId}` | Saved customer quotes | After finalizing a quote as a Proposal |
| `inventory/{itemId}` | Stock items | After finalizing as Stock, or editing stock details |
| `delivered-deals/{dealId}` | Completed deals | After marking stock as Delivered |
| `customers/{customerId}` | Customer records (org-scoped) | After creating a customer |
| `data-warehouse/{vendorId}/...` | Master product data (read-only to most users) | To verify vendor imports |

### What to Verify After Finalizing a Quote

Navigate to `users/{user.uid}/quotes/{quoteId}` in Firestore Console. Check:

- `totalPriceExclGst` — matches the UI's displayed total
- `priceLevelUsed` — matches the price level selected in the quote builder
- `variant.sellPriceExclGst` — price at the level used, not default retail
- `motor.sellPriceExclGst` — same
- `appliedPromotions[]` — correct promotions present
- `dealerServices.{extendedWarranty, servicePlan}` — booleans match toggles
- `adminDetails.{tradeIn, insurance, finance, timing}` — populated if filled
- `sectionPdfUrls.{boat, motor, trailer, dealerFit}` — URLs present if PDFs attached

---

## Part 7: Release Process

### Branch Model

- `claude/app-overview-wKiZ1` — **DEV**. Every push auto-deploys to the dev URL.
- `main` — **PRODUCTION**. Every push auto-deploys to the production URL.
- `claude/v1.X-release` — **feature branches**. Merged into dev first, then main.

### Who Does What

- **Developer (Claude / Asaf)**: Writes code, pushes to dev, asks you to test
- **QA (you)**: Runs automated tests + manual verification on dev
- **Decision**: Does it merge to main?
  - All Playwright tests pass
  - Your manual test plan passes
  - No Critical or Major bugs open
- **Asaf**: Handles the main merge, Firestore rules deployment, production monitoring

### Firestore Rules

These are in `firestore.rules` at the repo root. **They are NOT auto-deployed.**
Asaf must paste them into Firebase Console → Firestore → Rules → Publish.
If a release touches Firestore rules, make sure you confirm with Asaf that they
were deployed before doing production testing.

---

## Part 8: Per-Release Workflow

Every release gets its own folder in `testing/v1.X/`. When a new release
starts (Asaf will tell you), create the folder and these four files:

### `testing/v1.X/test-plan.md`

- What's in this release (summarise the release notes)
- Risk areas — what might break, what you'll focus on
- Test approach — manual first, then automated, or vice versa
- Sign-off criteria — when is this release "ready"?

### `testing/v1.X/test-cases.md`

Use `testing/shared/test-case-template.md` as the format. Write one entry per
test case. Number them `TC-vX.Y-01`, `TC-vX.Y-02`, etc.

### `testing/v1.X/test-results.md`

Running log of what you've run and the outcome. One row per test case with:

- Test ID
- Run date
- Pass / Fail / Blocked / Skipped
- Notes / link to bug if failed

### `testing/v1.X/bugs-found.md`

One entry per bug discovered during testing, in the bug-report-template format.
Mark each with Status: Open / Fixed / Won't Fix.

---

## Part 9: Checklists

### Every-Deploy Smoke Test (5 min)

Run this after every deploy to dev or main:

- [ ] Login works (no errors, redirects to dashboard)
- [ ] Dashboard shows module cards + Recent Proposals
- [ ] Click Highfield module → all 5 tabs clickable (Dashboard, Catalog, Stock Management, Pricing, Settings)
- [ ] Click any recent proposal → loads without "SOMETHING WENT WRONG"
- [ ] Start a quote: Highfield → Catalog → any range → any model → reach Step 1

If any of these fail, stop and investigate. Something fundamental is broken.

### Pre-Main-Push Regression (30 min)

Run before merging dev to main:

- [ ] `npm run test:e2e` passes (all 46 tests)
- [ ] Full quote flow works: all 6 steps, finalize as Proposal, finalize as Stock
- [ ] Pricing Workspace: Inc GST values are whole dollars, GP% calculates
- [ ] Stock Management: all 7 sub-tabs load, column order is Model first
- [ ] Stock detail panel: location dropdown works, MiniProposalView renders
- [ ] Yamaha Catalog: motor cards show names not Firestore IDs, multi-engine "N × M HP"
- [ ] Settings: 4 dealer fit category cards, can add/remove a category
- [ ] Yamaha Settings: shows only Yamaha's own categories
- [ ] Change a model photo in Highfield → verify it appears in catalog grid
- [ ] Open proposals of several different ages → no crashes

### New Feature Review Checklist

For each newly-shipped feature:

- [ ] Matches the behaviour described in release notes
- [ ] Works on desktop viewport (~1440px)
- [ ] Works on mobile viewport (~375px) — use browser DevTools device mode
- [ ] Saves correctly to Firestore (verify doc fields)
- [ ] Displays correctly in proposal view + PDF
- [ ] Doesn't break existing flows (do a smoke pass)
- [ ] Empty states handled (what happens if the data isn't there?)
- [ ] Error states handled (what happens if Firestore is slow / offline?)

---

## Part 10: Bug Reporting

### Severity Levels

| Severity | Criteria | Example |
|----------|----------|---------|
| **Critical** | Blocks core business function, no workaround | Can't log in; can't save a quote; all proposals crash |
| **Major** | Significant feature broken, workaround exists | Price level selector doesn't change motor price (can edit manually) |
| **Minor** | Small feature broken or missing, minor impact | A field doesn't save; a badge is the wrong colour |
| **Cosmetic** | Visual only, no functional impact | Misalignment; typo; slightly wrong shade |

### Where to File Bugs

- Add to `testing/v1.X/bugs-found.md` in the current release folder
- Use the template at `testing/shared/bug-report-template.md`
- For Critical bugs, also notify Asaf immediately (Slack/text)
- Once a bug is fixed, update the status and note the fix commit

### Writing the Title

Good titles:
- "Photo change on CL340 doesn't appear in catalog grid after save"
- "Proposal view crashes with 'orgQuoteList is not defined'"

Bad titles:
- "Photos broken"
- "Something wrong with proposals"

---

## Part 11: Glossary

| Term | Definition |
|------|------------|
| **Act Sell** | Actual Sell price column in Master Price File data — the primary sell price for dealer fit items |
| **Act CTD** | Actual Cost To Dealer column in MPF — the cost price |
| **BMT** | Boat/Motor/Trailer — a full package quote |
| **Catalog module** | Default module type — a boat brand with pricing, quoting, stock |
| **Dealer Fit** | Accessories/services added at the dealer stage (electronics, canvas, rigging) |
| **Factory Options** | Options configurable at the boat factory (consoles, seats, trim, colour) |
| **GST** | Australian Goods and Services Tax (10%); Inc GST values are rounded UP to whole dollars |
| **Hull** | The boat itself (vs. motor or trailer) |
| **Master Data Browser** | Dialog for searching MPF data and adding items as dealer fit selections |
| **Master Price File (MPF)** | Supplier parts/accessories price lists imported as data |
| **Module** | An organisation's access point to a vendor with its own pricing and settings |
| **Motor Brand module** | Module type for Yamaha, Honda, etc. — motor catalog with pricing and promotions |
| **MPF** | See Master Price File |
| **NSM** | Northside Marine — our primary client |
| **NSM Retail** | Yamaha's retail pricing column used for BMT packages |
| **Pre-Rig** | Rigging kit that comes with a motor installation |
| **Price Level** | Pricing tier: hull_cash, hull_trade, hull_subdealer, hull_commercial, hull_boating_alliance |
| **Promotion** | Vendor rebate (e.g., Yamaha's $500 off promo) that auto-applies within its date range |
| **Prop Comes Standard** | Optional toggle — user ticks if the motor's standard propeller is included |
| **Range** | A series within a vendor's lineup (Classic, Sport, Patrol for Highfield) |
| **SKU** | Stock Keeping Unit — a specific material + colour variant of a model, with a price |
| **Sub-dealer** | A smaller org that belongs to a parent dealer (inherits stock/pricing) |
| **Trade Price** | Price level for Yamaha motors when sold to trade dealers / sub-dealers |
| **Variant** | Same as SKU |

---

**End of Handbook.** Welcome aboard.
