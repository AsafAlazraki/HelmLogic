# HelmLogic — Release Notes v1.1.0
> Release Date: 2026-04-01
> Branch: claude/app-overview-wKiZ1 → main
> 22 commits since v1.0.0

---

## Pricing System Overhaul

### Universal Publish
- Publish now writes ALL price levels to catalog in one action (no level selector)
- Each variant stores `priceLevels` object with all 5 levels (Cash, Trade, Sub-Dealer, Sub-Dealer Excl, AUS Sailing)
- Primary `sellPriceExclGst` set from Cash Price (org's shortCode column)
- Stale pricing warning banner when strategy updated after last publish
- "Never published" confusing banner removed

### Price Level Selector in Quotes
- Quote builder has dropdown to switch between price levels
- Totals update live when switching levels
- Default: Cash Price (hull_cash) — the org's shortCode sell price column
- Sub-dealers auto-use their assigned price level
- `priceLevelUsed` saved on every finalized quote for audit trail

### Pricing Manager UX
- Export and Global Update now work in Focus Mode (z-index fix)
- All Sell AUD columns labelled with "(EXCL. GST)" and "(INCL. GST)" explicitly
- Dropdown z-index elevated above focus mode overlay

---

## Quote → Stock Boat Flow

### Finalize as Stock
- Generates proposal PDF and stores in Firebase Storage
- Saves full `quotePayload` with all configuration snapshotted
- `isLocked: true` flag prevents config editing after save
- `isFromQuote: true` identifies stock items created from quotes
- Flattens key fields (model, colour, material) for stock table display
- Copies variant/cover images to stock item photos
- `canSaveAsStock` permission gate — disabled with tooltip when no permission

### Stock Detail Panel (Quote Items)
- "Quote Configuration" section showing: variant, factory options, motor, trailer, dealer fit with prices
- "Locked Configuration" badge for frozen items
- Customer details: name, email, phone, company
- Dealer audit info: price level used, quote number, created by, date, discount
- Total incl + excl GST
- "View Proposal" link to original proposal page
- "Download PDF" for stored proposal file

### Price Locking
- All prices snapshotted at finalization time (confirmed working)
- Proposals read from saved quote data, not live variants
- Pricing changes don't affect existing quotes

---

## Sub-Dealer Quoting

### Module Settings
- Sub-Dealer Quoting toggle (Enabled/Disabled) in module settings
- Default Price Level dropdown for sub-dealers (Cash, Trade, Sub-Dealer, etc.)
- Stored as `subDealerQuotingEnabled` and `subDealerDefaultPriceLevel` on module doc

### Sub-Dealer Quotes Tab
- "Quotes" tab appears for sub-dealers when quoting is enabled
- Quote list with "New Quote" button
- Auto-applies sub-dealer's assigned price level
- Same quote builder experience as parent org

---

## Placeholder Module Types

### Used Boats & Website Listings
- New `moduleType` field: "used-boats", "website-listings", "catalog" (default)
- Non-catalog modules render a simpler view with cover image upload
- Coming-soon cards for future functionality
- Cover image stored in Firebase Storage on module document
- Same admin toggle and sub-dealer rules as catalog modules

### Seed Script
- `scripts/seed-placeholder-modules.ts` creates Used Boats, Website Listings modules + Master Price File vendor
- Auto-assigns to Northside Marine organisation

---

## Admin Improvements

### Organisation Editor — Modules Tab
- New "Modules" tab for assigning module access to organisations
- Toggleable cards for each module
- Updates `enabledModuleSubscriptions` array

### Add Module Page
- Proper padding, max-width container
- Rounded inputs/selects matching app conventions
- Improved spacing and card styling

### Proposal PDF Images
- Factory option thumbnails shown next to line items
- Trailer images shown on proposals
- Dealer fit item images shown
- Motor accessory images shown

---

## Files Changed (Key)
- `src/components/highfield-pricing-workspace.tsx` — Universal publish, GST labels, focus mode fix
- `src/components/highfield-quote-flow.tsx` — Price level selector, default to hull_cash
- `src/components/finalize-quote-dialog.tsx` — PDF storage, locked config, permission gate
- `src/components/stock-item-detail.tsx` — Customer, audit, proposal actions
- `src/components/stock-location-manager.tsx` — Sub-dealer quoting toggle
- `src/components/manage-organisation-page.tsx` — Modules tab
- `src/components/proposal-pdf.tsx` — Option/trailer/dealer fit images
- `src/app/(app)/modules/[id]/page.tsx` — Module types, sub-dealer quotes tab
- `src/app/(app)/modules/add/page.tsx` — Module type selector + UI fix
- `scripts/seed-placeholder-modules.ts` — New seed script

---

## Bug Fixes

### Used Boats / Website Listings Module Crash
- Module page crashed with `Cannot read properties of null (reading 'indexOf')` when `mainVendorId` is null
- Fixed by checking `mainVendorId` exists before creating Firestore doc ref

### Add Module Page
- Module Type dropdown added (Catalog, Used Boats, Website Listings)
- Main Vendor field optional for non-catalog modules
- Proper padding, max-width container, consistent label styling

### Pricing Manager
- Sell AUD columns now labelled "(EXCL. GST)" and "(INCL. GST)" explicitly
- Export and Global Update dialogs work in Focus Mode (z-index fix)
- Removed confusing "never published" banner
