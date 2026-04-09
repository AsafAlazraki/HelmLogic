# HelmLogic — Release Notes v1.2.0
> Release Date: 2026-04-10
> Branch: claude/app-overview-wKiZ1 → main
> Major release since v1.1.0

### Release Stats
- **87 commits** merged to production
- **65 files** changed
- **4,423 lines** of new application code (net ~3,465 after deletions)
- **30+ QA test cases** — all passing
- **Static analysis clean** — 688 icon usages verified across 113 files, zero undefined variable references

---

## Yamaha Motor Module

### Motor Catalog Workspace
- New `YamahaMotorWorkspace` component with Catalog, Pricing Manager, Promotions, and Settings tabs
- Motor card grid grouped by HP range (2.5-25, 30-75, 90-150, 175-250, 300+)
- Search by model name, filter by HP range, sort by HP/price/name
- Motor detail Sheet panel showing full specs, image, accessories by category, and dealer fit options with Master Data Browser integration
- Detects motor-brand modules by `moduleType` or vendor `vendorType === 'Motor Brand'`

### Motor Specs on Proposals
- Proposal view shows motor image, brand logo, and full specs table (HP, Shaft, Control, Starting, Tilt & Trim, Fuel Tank, Prop, Warranty)
- Motor accessories listed individually with prices
- PDF proposal includes motor specs grid and larger motor image (60x60)
- Finalize dialog snapshots motor spec fields (hpRating, shaftLength, control, etc.)

### Motor Step UX Overhaul
- Hero card display when a motor is selected — full-width card with image, specs badges, and price
- Motor grid hides after selection to reduce visual clutter
- "Choose Another Motor" button to re-open the grid and change selection

### Prop Comes Standard Toggle
- Optional green toggle on any motor — user ticks it if the motor's prop is included
- Default OFF — user opts in when applicable
- Auto-turns OFF if user selects a different propeller from dealer fit or accessories
- State tracked in quote flow for accurate proposal display

### Motor Dealer Fit
- `motorDealerFitCategories` field on boat module — configurable per-boat-module, not per-motor-module
- Motor dealer fit items shown in quote step 3 with blue-themed category headers
- Dealer fit options accessible from inside the motor detail side panel (same Master Data Browser as Highfield)
- `DealerFitOptions` component merges categories from THREE sources: global categories, module-level categories, and motor dealer fit categories

### Yamaha Settings Tab
- Full settings: associated vendors (editable), dealer fit categories, role assignment (Brand Captain / Module Manager)

### Promotions & Rebates System
- Full promotions management: create, edit, toggle active/inactive, delete
- Promotion types: Fixed Amount, Per-HP, Percentage, Category Discount
- Applies to: Motor, Rigging, Propeller, All Accessories, Total
- Image upload with preview (Firebase Storage)
- PDF upload with download link
- Quote display toggles: show on quote, show image, show PDF
- Audit changelog: tracks created/edited/activated/deactivated with user + timestamp
- Date range support (optional start/end dates)
- Active/Inactive filter tabs

---

## Master Price File Module

### In-App Excel Import
- No scripts or CLI needed — upload Excel files directly in the browser
- Each sheet in the Excel file becomes a separate dataset tab
- Parses and uploads to Firestore in batches of 500
- "Import Excel File" button creates new datasets
- "Replace Data" button updates existing datasets

### Editable Data Tables
- Pricing manager-style tables: sticky row numbers, sticky first column with shadow
- Inline cell editing (click to edit, blur to save)
- Auto-detect numeric fields for $ formatting
- Image column detection (imageLink, Image Link, imageUrl) with thumbnail display
- Search across all fields
- Export to Excel (.xlsx) or CSV
- Add/delete rows
- Dataset tabs for each imported sheet

### Dealer Fit Integration
- Master Data Browser completely rewritten — single search bar, card results, one-click add
- No vendor/dataset dropdowns — searches across ALL MPF datasets at once
- Motor Brand vendors filtered out of dealer fit
- Result cards show image, name, code, source dataset, price
- Right panel for staged items with remove
- Dealer fit selections preserve imageUrl through finalize to proposal
- "Clear All" button removes all dealer fit selections at once
- Removed duplicate dealer fit categories card (single CRUD card via ModuleDealerFitManager)
- Edit associated vendors on existing modules (was read-only)

---

## Enhanced Stock Creation

### Finalize Dialog Improvements
- Location picker dropdown (from module stock locations)
- Stock number input (auto-generated if empty)
- Status selector: Pending, On Order, In Stock
- Customer picker required for sold statuses (In Stock - Sold, On Order - Sold)
- Navigate to stock management tab after saving

### New Statuses
- Pending (yellow badge)
- On Order (blue badge)
- In Stock (green badge)
- In Stock - Sold (purple badge)
- On Order - Sold (orange badge)
- Updated across: stock-list badges, stock-item-form, workspace filters, delivered deals

### Wide Detail Panel
- 900px width for quote-origin items (was 480px)
- Two-column layout: left = detail/photos/PDFs, right = mini proposal view
- MiniProposalView shows full config with images inline
- Customer details section (name, email, phone, company)
- Dealer audit info (price level, quote number, created by, date, discount)
- "View Proposal" link + "Download PDF" button
- "Generate PDF" button when PDF URL is missing (on-demand regeneration)

### Console-Seat Auto-Pairing
- Selecting console with `associatedSeatId` auto-selects paired seat
- Paired seat locked (can't toggle off while console selected)
- Switching consoles swaps seats
- Lock icon + "Paired with" badge on auto-selected seats

---

## Module Management

### Module Types
- `catalog` (default) — boat brand with pricing, quoting, stock
- `motor-brand` — motor catalog with accessories, pricing, promotions
- `master-price-file` — editable data tables with import/export
- `used-boats` — placeholder with cover image
- `website-listings` — placeholder with cover image

### Admin Features
- Delete modules from Admin > Modules page (trash icon on hover)
- Rename modules (pencil icon → dialog)
- Module type selector on Add Module page
- Modules tab in org editor for assigning module access

### Cover Images
- Non-catalog modules support cover image upload
- Dashboard module cards show `coverImageUrl` when no vendor logo

---

## PDF & Proposal Improvements

### PDF Generation
- Root cause fixed: `ProposalPDFDocument` needed `financials` prop
- New shared utility for computing financials
- Blob size validation + URL validation for stored PDFs
- On-demand PDF regeneration from stock detail panel

### Proposal Images
- Factory option thumbnails on PDF
- Trailer images on PDF
- Dealer fit item images on PDF (with imageUrl from MPF)
- Motor accessories images on PDF

### Org-Wide Proposal View
- Proposal view searches ALL org members' quotes, not just the logged-in user's
- Enables managers to view any proposal created by team members

---

## Image Fallback System

- All model/motor/range cards use `onError` fallback — shows placeholder icon instead of broken image icons
- Applies to: model cards, range cards, motor browser cards, proposal images
- Prevents visual clutter when external CDN images fail to load
- Uses native `<img>` tags (not Next.js `<Image>`) for all external URLs

---

## Code Quality

- Stale promotion amount fields cleared on type change
- `organisationId` validated before stock write
- Filtered empty states in stock-list and delivered-deals
- Select-all checkbox uses filtered results, not total
- All filters reset on view change in workspace
- PDF filename uses `finalStockNumber`
- Catalog image replacement fixed (`shouldDirty: true` on all setValue calls)

---

## Infrastructure

### Firestore Rules Updates
- `modules` write set to `isSignedIn()`
- `modules/{moduleId}/promotions/{promoId}` subcollection added
- `organisations/{orgId}/dealerFitSelections/{selectionId}` subcollection added

### Seed Scripts
- `scripts/seed-mpf-data.ts` — Firebase Admin SDK script for bulk data seeding
- `scripts/seed-placeholder-modules.ts` — creates Used Boats, Website Listings, Master Price File vendor
- `scripts/fix-classic-cover-images.py` — patches Classic range cover image URLs in Firestore

---

## Release Checklist

- [x] All QA test cases passing — full surface test (30+ cases, ALL PASS)
- [x] Build passes (`npx next build` — zero errors)
- [x] Static analysis clean — icon imports verified, no undefined variable references
- [x] Image rendering verified (native img for external CDNs + onError fallback)
- [x] Motor UX verified: hero card, Prop Comes Standard toggle, dealer fit in motor detail panel
- [x] Firestore rules deployed
- [x] Merged `claude/app-overview-wKiZ1` → `main`
- [ ] Verify production deployment
- [ ] Smoke test on production (login, dashboard, proposal view, catalog images, quote builder)

---

## Files Changed (Key New Components)
- `src/components/yamaha-motor-workspace.tsx` — Motor catalog + pricing + promotions + settings
- `src/components/module-promotions.tsx` — Promotions management
- `src/components/master-price-file-workspace.tsx` — Editable data tables
- `src/components/proposal-view.tsx` — Org-wide quote lookup
- `src/components/dealer-fit-options.tsx` — Three-source category merge
- `src/components/highfield-quote-flow.tsx` — Motor UX overhaul + dealer fit integration
- `src/lib/quote-financials.ts` — Shared financials computation
