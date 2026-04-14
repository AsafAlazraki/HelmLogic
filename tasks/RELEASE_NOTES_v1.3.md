# HelmLogic — Release Notes v1.3.0
> Release Date: TBD (pending QA)
> Branch: claude/v1.3-release → main
> Major release since v1.2.1

### Release Stats
- **13 client requirements** addressed from April 4 feedback
- **9 feature commits** + **1 customer fix commit**
- Features span quote builder, stock management, module settings

### Source of Requirements
Client (Northside Marine) feedback received April 4, 2026 — 12 feature requests + mobile responsiveness check. Customer feedback on dev deployment added photo save bug, stock column order, pending tab, and location change UX.

---

## Quote Builder Enhancements

### Label Changes
- **"Features" button** → **"Standard Features"** (Technical Utilities)
- **"Custom Tactical Additions"** → **"Additional Factory Boat Notes/Options"** (Step 2)

### Engine Specs + Trailer Specs Buttons
- New **Engine Specs** button (Gauge icon) in Technical Utilities — appears when a motor is selected
- New **Trailer Specs** button (Truck icon) — appears when a trailer is selected
- Each opens a dialog showing the relevant specs table
- Engine specs: HP Rating, Shaft Length, Control, Starting, Tilt & Trim, Fuel Tank, Prop, Warranty, Cylinders/Displacement, Engine Colour
- Trailer specs: image, name, price, options list

### Pre-Rig Information
- Shown on Step 3 (Motor) after motor selection, before Prop Comes Standard
- Displays `Installation` field from motor data
- Lists any standard rigging accessories included with the motor
- Slate-themed informational card (non-interactive)
- Only appears if data exists

### NSM Extended Warranty + Service Plan
- New "Dealer Services" section on Step 3 (Motor)
- Two toggle cards:
  - **NSM 6 Year Extended Warranty** (Star icon)
  - **Direct Debit Service Plan** (Wrench icon)
- Blue theme, optional opt-in
- Saved on quote payload as `dealerServices.{extendedWarranty, servicePlan}`

### Yamaha Rebate Auto-Apply
- Active promotions auto-ticked on Step 3
- Fetches from both boat module (`modules/{boatModuleId}/promotions`) and motor vendor module (`modules/{motorModuleId}/promotions`)
- Filters by `isActive === true` AND date range (startDate/endDate)
- Auto turn off when end date passes
- Shows promotion name, description, discount badge, date range, image (if enabled), PDF link (if enabled)
- Supports 4 discount types: fixed-amount, per-hp, percentage, category-discount
- Bottom price bar shows strikethrough original + green "SAVE $X" line
- Also works for Hulls and Trailers

### Trailer Enhancements
- **Additional Factory Trailer Notes/Options** — custom input section on Step 4 (name, price, description)
- **Trailer Dealer Fit** section on Step 4 (amber theme) showing items from `trailerDealerFitCategories`
- New `trailerDealerFitCategories[]` field on module document
- Settings tab has a Trailer Dealer Fit Categories management card

### Admin & Trade-In Section
- New card on Step 6 (Summary) with:
  - **Trade-In Vehicle**: description + value
  - **Insurance Quote**: checkbox + notes
  - **Finance Quote**: checkbox + notes
  - **Timing & Delivery**: date + notes
- Saved on quote payload as `adminDetails.{tradeIn, insurance, finance, timing}`

### PDF Quote Upload per Section
- Attach supplier PDF quotes per section (Boat, Motor, Trailer, Dealer Fit)
- Paperclip icon button on each Step 6 summary card
- Filename shown as green pill badge with remove X
- On finalize, PDFs uploaded to Firebase Storage at `quotes/{quoteId}/section-pdfs/{section}.pdf`
- URLs saved as `sectionPdfUrls` on the quote document

---

## Stock Management Improvements

### Column Order
- New column order: **Model → Colour → Stock Number** → Status → Location → Date into Stock → Days in Stock → Sold By → Label → Serial Number → Material → Notes
- Model column styled bold/semibold for emphasis
- Matches customer workflow preference

### Pending Sub-Tab
- New **Pending** sub-tab (Clock icon) alongside Stock Boats and On Order
- Filters inventory to `status = 'Pending'`
- Shows pre-stock items awaiting processing

### Location Change UX
- Location field in stock detail panel is now an **interactive dropdown**
- Users can change location directly from the detail panel
- Uses the module's configured stock locations
- Read-only when viewing as sub-dealer

---

## Module Settings

### Trailer Dealer Fit Categories
- New section in Highfield Settings tab: "Trailer Dealer Fit Categories"
- Add/edit/delete categories (e.g., Spare Wheel, Hold Down Straps, Registration)
- `ModuleDealerFitManager` reused with `fieldName="trailerDealerFitCategories"`
- Categories used to filter dealer fit selections shown in quote Step 4

### DealerFitOptions — Four Category Sources
- Component now merges categories from FOUR sources:
  1. Global categories (`dealerFitCategories` collection)
  2. Module-level boat categories (`moduleDealerFitCategories`)
  3. Module-level motor categories (`motorDealerFitCategories`)
  4. Module-level trailer categories (`trailerDealerFitCategories`)
- Synthetic ID prefixes: `module-`, `motor-`, `trailer-`

---

## Bug Fixes (Customer Feedback)

### Photo Save Not Persisting in Catalog Grid
- **Bug**: User changed main photo on Highfield CL340 — "Update Config" toast showed but catalog grid kept showing old photo
- **Root Cause**: `ModelsGrid` component read only from master `data-warehouse/{vendor}/ranges/{range}/models`, not merging with `organisations/{orgId}/modelOverrides`. Saved changes went to override but grid never picked them up.
- **Fix**: ModelsGrid now loads overrides and merges with master data before rendering. Saved changes reflect immediately.

### HP Badge Wrong for Multi-Engine Motors
- **Bug**: Twin-engine Yamaha motors (e.g., "2 × 300") showed "2 HP" instead of "300 HP"
- **Root Cause**: `parseFloat("2 × 300")` returns `2`
- **Fix**: `getMotorHp` now parses multi-engine format correctly. New `getMotorHpDisplay` shows "2 × 300 HP" on badges, "90 HP" for singles.

---

## Firestore Collections (v1.3 Additions)

### Module fields
- `modules/{moduleId}.trailerDealerFitCategories[]` — trailer dealer fit category names

### Quote document fields
- `users/{uid}/quotes/{qid}.appliedPromotions[]` — applied promotions snapshot
- `users/{uid}/quotes/{qid}.promotionDiscount` — total discount amount
- `users/{uid}/quotes/{qid}.finalPriceExclGst` — price after promotions
- `users/{uid}/quotes/{qid}.dealerServices.extendedWarranty` — boolean
- `users/{uid}/quotes/{qid}.dealerServices.servicePlan` — boolean
- `users/{uid}/quotes/{qid}.adminDetails.tradeIn.{description, value}`
- `users/{uid}/quotes/{qid}.adminDetails.insurance.{requested, notes}`
- `users/{uid}/quotes/{qid}.adminDetails.finance.{requested, notes}`
- `users/{uid}/quotes/{qid}.adminDetails.timing.{estimatedDeliveryDate, notes}`
- `users/{uid}/quotes/{qid}.sectionPdfUrls.{boat, motor, trailer, dealerFit}` — Firebase Storage URLs
- `users/{uid}/quotes/{qid}.trailer.customOptions[]` — custom trailer notes/options

### Firebase Storage
- `quotes/{quoteId}/section-pdfs/{section}.pdf` — per-section attached PDFs

---

## Files Changed (Key Components)
- `src/components/highfield-quote-flow.tsx` — 12 of 13 features touch this (~740 new lines)
- `src/components/finalize-quote-dialog.tsx` — all new payload fields
- `src/components/stock-list.tsx` — column reorder, location dropdown
- `src/components/stock-management-workspace.tsx` — pending sub-tab
- `src/components/stock-item-detail.tsx` — interactive location dropdown
- `src/components/dealer-fit-options.tsx` — four-source category merge
- `src/components/yamaha-motor-workspace.tsx` — multi-engine HP parsing
- `src/app/(app)/modules/[id]/page.tsx` — trailer DF settings, modelOverrides merge in catalog grid
