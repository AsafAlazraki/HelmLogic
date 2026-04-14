# HelmLogic v1.3 — QA Testing Handbook

> This document is the single source of truth for QA testing HelmLogic.
> Give this entire file as context to any QA tester or cowork agent.

---

## Environment & Credentials

- **Dev URL**: https://dev--studio-2290360004-3b963.asia-southeast1.hosted.app/
- **Test User**: Bill Hull (billh@nsmarine.com.au / Bill2026!)
- **Role**: Managing Director, Northside Marine
- **Organisation**: Northside Marine (orgId: `AcFZVEFA5UDJG2hyetWT`)

### Login Flow
1. Navigate to the dev URL — redirects to `/login`
2. Email input: placeholder "name@example.com"
3. Password input: type="password"
4. Click "Login" button
5. Should redirect to dashboard after successful auth

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

**End of QA Testing Handbook**
