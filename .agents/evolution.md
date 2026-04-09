# HelmLogic AI Evolution Context

This file serves as the persistent memory and reasoning log for the HelmLogic development agents. It is updated after every significant change to ensure continuity and logic transfer between sessions.

## Project DNA
- **Framework**: Next.js (App Router)
- **Database/Backend**: Firebase Firestore & Storage
- **UI Library**: Radix UI + Tailwind CSS (shadcn/ui)
- **Map**: Leaflet + OpenStreetMap (no API key)
- **Core Entities**: Data Warehouse, Modules, Organisations, Inventory, Quotes, Promotions
- **Skills Library**: 1,356 antigravity skills installed at `~/.claude/skills/`

## Architectural Logic & Philosophy

### 1. Data Integrity (The "Inconsistency Guard" Pattern)
The Data Warehouse often contains partial rows or missing fields. Always implement robust fallbacks. Never assume a field exists.

### 2. Robust Firestore Payloads (Critical)
Firestore `setDoc()` and `addDoc()` calls fail if ANY field contains `undefined`. Always use `|| null`, `|| ''`, `|| 0` fallbacks.

### 3. Module Type System
Modules have a `moduleType` field that controls rendering:
- `catalog` (default) — boat brand with full pricing, quoting, stock management
- `motor-brand` — motor catalog with accessories, pricing, promotions (detected by `vendorType === 'Motor Brand'` OR `moduleType === 'motor-brand'`)
- `master-price-file` — editable data tables with Excel import/export
- `used-boats` / `website-listings` — placeholder modules with cover image

Non-catalog modules have `mainVendorId: null` — ALWAYS check before creating Firestore doc refs.

### 4. Stock Management Architecture
- `inventory/{itemId}`: Single collection for In Stock, On Order, Pending, and Sold items (differentiated by `status`)
- `delivered-deals/{dealId}`: Separate collection for completed deals
- `holdRequests/{requestId}`: Sub-dealer → parent org workflow
- `customers/{customerId}`: Org-scoped customer records
- Status values: Pending, On Order, In Stock, In Stock - Sold, On Order - Sold
- Sold statuses require customer attachment

### 5. Pricing Architecture
- Pricing workspace calculates costs → freight → margins → final prices
- Publish writes ALL price levels to variants: `sellPriceExclGst` (from hull_cash) + `priceLevels` object
- Quote builder reads `priceLevels[selectedLevel]` with fallback to `sellPriceExclGst`
- Default price level: `hull_cash` (org's shortCode column)
- Prices are LOCKED at quote save time — proposals read from saved data

### 6. Promotions System
- `modules/{moduleId}/promotions/{promoId}` — per-module promotions/rebates
- Types: fixed-amount, per-hp, percentage, category-discount
- Image + PDF attachments with quote display toggles
- Active/inactive with audit changelog
- Currently used in Yamaha motor workspace

### 7. Master Price File
- Vendor in data-warehouse with datasets containing supplier price lists
- In-app Excel import: each sheet becomes a dataset
- Editable tables with inline cell editing
- Image column auto-detection
- Linked to Highfield dealer fit options via Master Data Browser

### 8. Module Page Architecture (Critical — Most Complex File ~1400 lines)
`/src/app/(app)/modules/[id]/page.tsx` has multiple early returns:
1. Non-catalog module (master-price-file) → MasterPriceFileWorkspace
2. Motor brand module → YamahaMotorWorkspace  
3. Placeholder modules (used-boats, website-listings) → placeholder view
4. Sub-dealer → separate tabbed view
5. Parent org → full tabs (Dashboard, Catalog, Stock, Pricing, Settings)

### 9. Radix Tabs Gotcha
MUST use a SINGLE `<Tabs>` component wrapping both `<TabsList>` and `<TabsContent>`. Use `absolute inset-0` positioning for tab panels with `data-[state=inactive]:hidden`.

### 10. Agent Team Development
- Spawn developer agents with `isolation: "worktree"` for parallel work
- LFS causes worktree creation failures — use `git config lfs.fetchexclude "*"` to skip
- Always diff against original before resolving merge conflicts
- Check imported components exist before pushing (placeholder stubs if needed)
- Build verify (`npm run build`) before every push to dev/main

## Session History

### Session: March 31, 2026 — v1.0.0 Release
Complete stock management system, delivered deals, hold requests, sub-dealer experience, permissions, agent team infrastructure.

### Session: April 1, 2026 — v1.1.0 Release
Pricing overhaul (universal publish, price level selector), quote-to-stock with PDF, sub-dealer quoting, placeholder module types, proposal images.

### Session: April 2-4, 2026 — v1.2.0 Development
- Enhanced stock creation (location, status, customer for sold)
- New statuses (Pending, In Stock - Sold, On Order - Sold)
- Console-seat auto-pairing in quote builder
- Wide stock detail panel with mini proposal view
- PDF generation fix (missing financials prop)
- Master Price File module with in-app Excel import, editable tables, multi-dataset tabs
- Yamaha motor workspace (catalog, pricing with import/export, promotions)
- Motor specs on proposals/PDF
- Promotions system with images, PDFs, audit log, quote toggles
- Module rename/delete, module types (catalog, motor-brand, master-price-file, used-boats, website-listings)
- Dealer fit: simplified data browser (search all, one-click add), removed duplicate categories card, Clear All
- Associated vendors editable on existing modules
- Code audit: fixed stale promo fields, filtered empty states, select-all bugs, validation
- Catalog image replacement fix
- 1,356 antigravity skills installed
- Data browser: motor brand vendors filtered out of dealer fit

### Session: April 9, 2026 — Motor UX Overhaul & Dealer Fit
- Motor step 3 UX redesign: hero card on selection, grid hides, "Choose Another Motor" button to re-select
- Prop Comes Standard toggle (green, optional, default OFF — user opts in per motor) — auto-OFF when propeller selected from dealer fit
- Motor dealer fit categories (`motorDealerFitCategories`) stored per-boat-module, not per-motor-module — architectural decision for quote context
- Motor dealer fit shown in step 3 with blue-themed category headers
- `ModuleDealerFitManager` made configurable with `fieldName` prop for reuse across standard and motor dealer fit
- Yamaha motor card names fixed to use MODEL field
- Yamaha Settings tab now renders full settings (associated vendors, dealer fit categories, role assignment)

### Session: April 9, 2026 — v1.2.0 QA & Release Prep
- Full QA pass: 15 test cases, 12 PASS / 2 FAIL / 1 SKIP
- **FIXED TC-09**: Proposal view crash — `orgQuoteList is not defined` (stale variable refs from refactor)
- **FIXED TC-03**: Classic range broken images — switched remaining Next.js `<Image>` to native `<img>` for external CDN images
- v1.3 backlog documented (12 client requirements on separate branch `claude/v1.3-dev`)
- Playwright e2e tests set up but impractical for deployed site testing from CLI environment
- Release documentation finalized
- All tests now passing — ready for Friday main push pending Asaf approval

### Session: April 9, 2026 — Dealer Fit Gap Fix & Documentation Audit
- `DealerFitOptions` component updated to merge categories from three sources: global collection + module-level + motor-level
- Synthetic category IDs (`module-*`, `motor-*`) for module-level categories, matched by name for selections
- Confirmed `propComesStandard` is opt-in (default OFF), auto-OFF on propeller selection — not auto-enabled
- Image onError fallback pattern: Ship placeholder icon from Lucide replaces broken image icons across cards
- CL380 family data fix applied via `scripts/update-cl380-specs.py`
- Comprehensive v1.2 documentation audit across all four doc files
- **FIXED**: Missing `Layers` Lucide import in `dealer-fit-options.tsx` — crashed all dealer fit saves with ReferenceError
- **FIXED**: Duplicate category dropdown text ("RiggingRigging") — hardcoded SelectItems overlapped with `initialCategory` prop
- **FIXED**: Motor options crash — `config.type` undefined caused `.replace()` error
- Dealer fit options added inside motor detail side panel (same Master Data Browser as Highfield)
- Full surface QA test (30+ cases) — ALL PASS
- Static analysis: 688 icon usages verified across 113 files, zero undefined variable references
- **v1.2.0 shipped to production** — 87 commits, 65 files, 4,423 lines of new code

## Key Lessons Learned
- `mainVendorId: null` crashes Firestore `doc()` — always check
- Sell AUD columns need "(EXCL. GST)" and "(INCL. GST)" labels
- Universal publish is better UX than asking users to choose
- Default price level should be `hull_cash` (org's shortCode column)
- `coverImageUrl` on module doc is separate from vendor `logoUrl`
- Quote prices ARE locked at save time via `buildQuotePayload()`
- `ProposalPDFDocument` needs `financials` prop — use `buildQuoteFinancials()`
- Removing JSX elements must remove ENTIRE element (opening + closing tags)
- `setValue` in react-hook-form needs `{ shouldDirty: true }` to prevent reset
- LFS blocks worktree creation — disable smudge filter
- Firestore `in` queries max 30 elements — slice arrays
- Sub-dealer `filterOrgId="all-with-parent"` shows parent + own stock
- `readOnly` prop gates all CRUD UI — controlled by permissions
- Import duplicate checking needs multi-field fingerprinting
- Select-all should operate on FILTERED results, not total
- Reset all filters when switching workspace views
- Master Data Browser: `isAggregating` state must be cleared when switching away from Global Master List
- Motor Brand vendors must be excluded from dealer fit vendor list
- MasterPriceFileWorkspace is reusable — Yamaha pricing tab renders it pointed at Yamaha vendor
- Per-module dealer fit categories (ModuleDealerFitManager) is the single source of truth — org-level category toggling was removed
- Next.js `<Image>` blocks external CDN images (Cloudflare anti-hotlinking) — ALWAYS use native `<img>` for external URLs
- After refactoring variable names, search codebase for ALL old references — stale refs cause ReferenceErrors at runtime
- Manual QA (cowork agents) more effective than Playwright for deployed site testing when env can't reach the site
- Motor dealer fit categories belong on the BOAT module, not the motor module — dealer fit is configured in the context of the boat being quoted
- `ModuleDealerFitManager` should accept a `fieldName` prop for reuse — don't duplicate the component for different category fields
- `DealerFitOptions` must merge categories from THREE sources (global + module + motor) — missing any source causes categories to not appear for selection creation
- `propComesStandard` is opt-in (default OFF), NOT auto-enabled — user explicitly toggles when the motor's prop is included
- Image onError fallback: use Lucide `Ship` icon as placeholder for broken external images across all card components
- After refactoring, always search for ALL old variable references — stale refs (like `orgQuoteList`) cause ReferenceErrors at runtime

## How to Proceed (For Future Agents)
- **Read tasks/SESSION_HANDOVER.md** first for complete technical context
- **Check CLAUDE.md** for workflow rules
- **The module page is fragile** (~1400 lines) — always read fully before editing
- **Test with Bill Hull** (billh@nsmarine.com.au) — parent org user, role ID `bfffa6bd-6f7b-4822-a008-8e7214012f3f`
- **Test sub-dealers** via organisations with `parentOrganisationId` set
- **Firestore rules**: always provide full ruleset for user to paste in Firebase Console
- **Build verify** before every push: `npm run build`
- **Update this file** after significant changes
- **Use antigravity skills** for code review and quality checks
