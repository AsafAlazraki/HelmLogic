# HelmLogic AI Evolution Context

This file serves as the persistent memory and reasoning log for the HelmLogic development agents. It is updated after every significant change to ensure continuity and logic transfer between sessions.

## Project DNA
- **Framework**: Next.js (App Router)
- **Database/Backend**: Firebase Firestore & Storage
- **UI Library**: Radix UI + Tailwind CSS (shadcn/ui)
- **Map**: Leaflet + OpenStreetMap (no API key)
- **Core Entity**: "Data Warehouse" (Vendor-specific hardware, specs, and configurations)
- **Stock Management**: Full logistics system with inventory, delivered deals, hold requests

## Architectural Logic & Philosophy

### 1. Data Integrity (The "Inconsistency Guard" Pattern)
The Data Warehouse often contains partial rows or missing fields. Always implement robust fallbacks. Never assume a field exists.

### 2. Robust Firestore Payloads (Critical)
Firestore `setDoc()` and `addDoc()` calls fail if ANY field contains `undefined`. Always use `|| null`, `|| ''`, `|| 0` fallbacks.

### 3. Stock Management Architecture
- **inventory/{itemId}**: Single collection for both In Stock and On Order items (differentiated by `status` field)
- **delivered-deals/{dealId}**: Separate collection for completed deals
- **holdRequests/{requestId}**: Sub-dealer → parent org workflow
- **customers/{customerId}**: Org-scoped customer records
- Stock assignment via `organisationId` field changes
- Sub-dealer visibility via `stockVisibleToSubDealers` + `subDealerVisibleColumns` on module doc

### 4. Module Page Architecture
The module page (`/src/app/(app)/modules/[id]/page.tsx`) is the most complex file (~1200 lines). It has:
- Sub-dealer early return with its own tabbed view
- Parent org view with Dashboard, Catalog, Stock Management, Pricing, Settings
- Stock Management uses `StockManagementWorkspace` with 6 sub-tabs
- Pricing has sub-tabs: Pricing Matrix + Price Lists
- Settings has: OrgModuleConfig, StockLocationManager, DealerFitManager, RoleAssignment

### 5. Radix Tabs Gotcha
MUST use a SINGLE `<Tabs>` component wrapping both `<TabsList>` and `<TabsContent>`. Two separate `<Tabs>` creates separate contexts causing empty content. Use `absolute inset-0` positioning for tab panels.

### 6. Agent Team Development
- Spawn developer agents with `isolation: "worktree"` for parallel work
- Always diff against original before resolving merge conflicts
- Worktree-based agents can cause merge conflicts — resolve by keeping HEAD and cherry-picking specific changes
- Check that imported components exist before pushing (placeholder stubs if needed)

## Recent Evolution (Session: March 31, 2026 — v1.0.0 Release)

### Major Features Built:
1. **Complete Stock Management System** — spreadsheet table, CRUD, photos, PDFs, import/export, map, assignments
2. **Delivered Deals** — separate table with 25 columns, move-to-delivered workflow, export/import
3. **Hold Request System** — sub-dealer requests, customer association, Brand Captain notifications, accept/reject
4. **Sub-Dealer Experience** — separate dashboard, parent stock visibility, own stock management
5. **Module Settings** — locations, visibility, dealer fit categories, role assignments
6. **Permissions** — can_manage_stock, can_view_stock added to role permissions table
7. **Agent Team Infrastructure** — .claude/agents/ definitions, admin visualization page

### Key Lessons Learned:
- Radix Tabs MUST be single context (not two separate `<Tabs>`)
- Worktree merges can silently drop code — always verify
- Firestore rules don't auto-deploy — must paste in console
- `readOnly` prop gates all CRUD UI — controlled by permissions
- Import duplicate checking needs multi-field fingerprinting
- Sub-dealer `filterOrgId="all-with-parent"` shows parent + own stock
- Universal publish writes ALL price levels — no selector
- Quote prices are locked at save time — proposals read from saved data
- `priceLevelUsed` on every finalized quote for audit trail
- Default price level is `hull_cash` (org's shortCode column)
- Module `moduleType` field controls rendering: "catalog" (default) vs "used-boats" vs "website-listings"

## Recent Evolution (Session: April 1-2, 2026 — v1.1.0)

### Features Built:
1. **Pricing System Overhaul** — universal publish (all levels at once), price level selector in quotes, GST labels on all Sell AUD columns
2. **Quote → Stock Boat** — PDF storage in Firebase Storage, locked config (`isLocked`), customer/audit info on stock detail, proposal link
3. **Sub-Dealer Quoting** — toggle + price level assignment in module settings, quotes tab for sub-dealers
4. **Placeholder Module Types** — Used Boats, Website Listings with cover image upload, module type selector on Add Module page
5. **Admin** — Modules tab in org editor for assigning module access, Add Module page UI fix
6. **Proposal Images** — option/trailer/dealer fit thumbnails on PDF
7. **Dashboard** — module cards show coverImageUrl when no vendor logo
8. **Focus Mode Fix** — export dropdown and global update dialog work in pricing manager focus mode

### Key Lessons:
- Modules with `mainVendorId: null` crash Firestore `doc()` — always check before creating ref
- Sell AUD columns need explicit "(EXCL. GST)" and "(INCL. GST)" labels
- Universal publish is better UX than asking users to choose a price level
- Default price level should be `hull_cash` (org's shortCode column)
- `coverImageUrl` on module doc is separate from vendor `logoUrl` — dashboard needs to check both
- Quote prices ARE locked at save time — `buildQuotePayload()` snapshots everything

## How to Proceed (For Future Agents)
- **Read SESSION_HANDOVER.md** first for complete context
- **Check CLAUDE.md** for workflow rules
- **The module page is fragile** — always read fully before editing, never take worktree version blindly
- **Test with Bill Hull** (billh@nsmarine.com.au) — parent org user at Northside Marine
- **Test sub-dealers** via organisations with `parentOrganisationId` set
- **Firestore rules**: always provide full ruleset for user to paste in Firebase Console
- **Update this file** after significant changes
