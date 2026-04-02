# HelmLogic — Session Handover Document
> Give this file to a new Claude session along with the CLAUDE.md file.
> Updated: 2026-03-31 (after v1.0.0 release to main)

---

## What Is HelmLogic?

HelmLogic is a marine dealer management SaaS platform. It lets boat brands (vendors) distribute boat data to dealerships (organisations), who can then build quotes, manage inventory, run pricing, distribute sub-dealer price lists, and manage stock logistics. Think of it like a CRM + quoting + pricing + stock management tool for the marine industry.

**Primary client in app**: Northside Marine (orgId: `AcFZVEFA5UDJG2hyetWT`) — a Highfield Boats dealer.

---

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Firebase — Firestore (DB), Auth, Storage
- **Deployment**: Firebase App Hosting (`studio--studio-2290360004-3b963.us-central1.hosted.app`)
- **Firebase Project**: `studio-2290360004-3b963`
- **Dev Branch**: `claude/app-overview-wKiZ1` — always push here for deployment
- **Main Branch**: `main` — production, merge from dev when ready
- **Map Library**: Leaflet + OpenStreetMap (no API key needed, replaced Google Maps)

---

## Firestore Data Hierarchy

```
data-warehouse/{vendorId}/
  ranges/{rangeId}/
    models/{modelId}/
      variants/{variantId}      <- SKU: material + color + sellPriceExclGst

modules/{moduleId}              <- Org's access point to a vendor
  Fields: stockLocations[], stockVisibleToSubDealers, subDealerVisibleColumns[],
          moduleDealerFitCategories[], brandCaptainUserId, brandCaptainUserName,
          moduleManagerUserId, moduleManagerUserName

organisations/{orgId}/
  modelOverrides/{modelId}      <- Org-specific pricing overrides
  dealerFitSelections/
  exchangeRates/{currencyCode}
  priceLists/{priceListId}      <- Sub-dealer price lists
  priceLevelDefinitions/
  productPrices/

users/{userId}/
  quotes/{quoteId}/
    service_items/{itemId}
  notifications/{notifId}
  routes/{routeId}

inventory/{itemId}              <- Stock items (In Stock / On Order)
  Fields: name, stockNumber, label, status, location, soldBy, model, colour,
          serialNumber, material, notes, dateIntoStock, photoUrls[],
          pdfAttachments[], organisationId, moduleId, modelId, rangeId,
          coverImageUrl, variantImageUrl

delivered-deals/{dealId}        <- Delivered/sold boats
  Fields: all inventory fields + consignmentWith, poOrDealNumber, customerNotes,
          deliveryDate, etaSoldDate, motor, motorSerialNumber, trailer,
          invoiced, depositPaid, paidInFull, packageDetails, invoicedAmount,
          isHullOnly, warrantyRegistered, sourceInventoryId

holdRequests/{requestId}        <- Sub-dealer hold requests
  Fields: inventoryItemId, moduleId, inventorySnapshot{}, requestingOrganisationId,
          requestingOrganisationName, requestedByUserId, parentOrganisationId,
          customerId, customerName, status (pending/accepted/rejected),
          resolvedByUserId, rejectionReason, createdAt

customers/{customerId}          <- Customer records (org-scoped)
  Fields: name, email, phone, company, address, notes, organisationId,
          createdByUserId, createdByUserName
```

---

## Key IDs (Hard-Coded References)

| Thing | ID |
|---|---|
| Highfield vendor | `LafOLpLb6QIFE856TiD4` |
| Highfield module | `M1Yf3R9igpJDxJnOVr6f` |
| Northside Marine org | `AcFZVEFA5UDJG2hyetWT` |
| Range — Classic | `qo7IePnRzJxjrYyLWhTn` |
| Range — Roll-Up | `EqcKQ51svI1I2Q5poFdl` |
| Range — Ultra-Light | `QsGZuVwutEr5yyMkp97j` |
| Range — Sport | `nQ2LE50z9Tbf2uss0Ote` |
| Range — Adventure | `sEzdrM2fZsrOKA3ACrJp` |
| Range — Patrol | `vfXxDuMpChteKncb7LnG` |
| Range — Coaster | `coaster` |

---

## Pricing Architecture

### Data Flow: Pricing Manager → Quotes
```
Pricing Workspace edits → organisations/{orgId}/pricingStrategies/{vendorId}
    (stores: itemValues with all cost components + price levels)
    ↓
Publish Prices (manual action, publishes ALL levels at once)
    ↓
Writes to data-warehouse variants:
    - sellPriceExclGst (from hull_cash / org shortCode column)
    - priceLevels: { hull_cash, hull_trade, hull_subdealer, ... }
    - activePriceLevel: 'hull_cash'
    ↓
Quote Builder reads sellPriceExclGst OR priceLevels[selectedLevel]
    - Default level: hull_cash (org's shortCode sell price)
    - Sub-dealers: use module's subDealerDefaultPriceLevel
    - Price level selector dropdown in quote builder
    ↓
Finalize saves ALL prices as snapshot (prices locked at save time)
```

### Price Levels (hardcoded)
- `hull_cash` — Cash Price (displayed as "{ORG_SHORTCODE} SELL PRICE")
- `hull_trade` — Trade Price
- `hull_subdealer` — Sub-Dealer Price
- `hull_subdealer_excl` — Sub-Dealer Excl Price
- `hull_aus_sailing` — AUS Sailing Price

### Quote Price Locking
- `buildQuotePayload()` snapshots ALL `sellPriceExclGst` values at save time
- Proposal view reads from saved quote data, NOT live variants
- Pricing changes don't affect existing quotes
- `priceLevelUsed` saved on every finalized quote for audit trail

---

## Module Types

- `catalog` (default) — boat brand catalog with pricing, quoting, stock management
- `used-boats` — placeholder module with cover image, coming-soon cards
- `website-listings` — placeholder module with cover image, coming-soon cards

Non-catalog modules have `mainVendorId: null` — code must check before creating Firestore doc refs.

---

## Module Page Architecture (Critical — Most Complex File)

`/src/app/(app)/modules/[id]/page.tsx` — The central module workspace. ~1300 lines.

### Structure:
1. **Non-catalog module early return** — if `moduleType !== 'catalog'`, renders placeholder view with cover image
2. **Sub-dealer early return** — if `isSubDealer`, renders Dashboard, Stock Management, Quotes (if enabled), Price List tabs
3. **Parent org view** — full tabs: Dashboard, Catalog, Stock Management, Pricing, Settings

### Sub-dealer view:
- Dashboard: stats + parent stock card + own stock card + price list access + info panel
- Stock Management: `StockManagementWorkspace` with `isSubDealer=true`, `readOnly=true`
- Price List: `PriceListViewer` showing shared price lists

### Parent org Stock Management tab:
- Renders `StockManagementWorkspace` which has sub-tabs:
  - Stock Boats (filtered to In Stock)
  - On Order (filtered to On Order)
  - Delivered Deals
  - Hold Requests (accept/reject dashboard)
  - Map View (Leaflet)
  - Assignments (sub-dealer stock distribution)

### Pricing tab:
- Sub-tabs: Pricing Matrix (`HighfieldPricingWorkspace`) + Price Lists (`PriceListManager`)

### Settings tab:
- `OrganisationModuleConfig` — full module settings
- `StockLocationManager` — locations + sub-dealer sharing
- `ModuleDealerFitManager` — per-module categories
- `ModuleRoleAssignment` — Brand Captain + Module Manager

### Key variables:
- `isSubDealer = !!currentMemberOrg?.parentOrganisationId`
- `userPermissions` computed from `userProfile.organisationRole` + `organisation.permissions`
- `isAdmin` = HelmLogic Admin role
- `activeTab` state controls main tabs
- `dashboardStockCounts` from inventory query

---

## Permissions System

Defined in `manage-organisation-page.tsx`:
```
can_access_module, can_access_pricing_manager, can_create_quotes,
can_edit_boat_data, can_view_subdealers, can_access_price_book,
can_access_settings, can_manage_stock, can_view_stock
```

Stored as `organisations/{orgId}.permissions.{roleId}.{permissionKey}: boolean`
User's role: `users/{userId}.organisationRole` (role ID string)

---

## Agent Team Setup

- `.claude/agents/scrum-master.md` — Task coordinator
- `.claude/agents/developer.md` — Code builder (spawned with worktree isolation)
- `.claude/agents/test-lead.md` — Code reviewer
- `.claude/settings.json` — Agent teams enabled + permissions

### Workflow:
1. User gives task to Scrum Master (main Claude session)
2. Scrum Master breaks down into developer tasks
3. Developers spawned in parallel with `isolation: "worktree"`
4. Test Lead reviews merged work
5. Push to dev (`claude/app-overview-wKiZ1`) for deployment
6. Push to main for production release

---

## Firestore Security Rules

Rules must be **manually deployed** — paste into Firebase Console > Firestore > Rules.
Current rules file: `/firestore.rules`

Key collections and access:
- `modules` — read/write for all signed-in users
- `inventory`, `vessels`, `delivered-deals`, `holdRequests`, `customers` — read/write signed-in
- `organisations` — read signed-in, write admin or org member
- `users` — owner, admin, or same-org member

---

## Style Guide (UI Conventions)

- Font sizes: `text-[9px]` for labels, `text-[10px]` for small uppercase, `text-xs` for body
- Labels: `uppercase tracking-widest font-black text-slate-400`
- Buttons: `rounded-xl` for small, `rounded-2xl` for medium
- Borders: `border-2` (not `border`)
- Dialogs: `rounded-3xl border-4 shadow-2xl`
- Tables: `rounded-2xl border-2 border-slate-100` container
- Status badges: green (In Stock/Delivered), blue (On Order/Pending), orange (Sold)
- Material badges: red (PVC), grey (HYP)
- Toasts: `toast({ title })` success, `toast({ variant: 'destructive', title })` error
- Always `console.error(error)` in catch blocks before toasts

---

## Common Gotchas & Lessons

| Situation | Rule |
|---|---|
| Firestore `orderBy('field')` | Silently excludes docs without that field. Use unordered queries for models/variants. |
| Firestore rules not working | Rules must be manually deployed. App Hosting only deploys code. |
| `useMemo` for Firestore refs | Must use `useMemoFirebase` not `useMemo` — prevents infinite re-render loops. |
| Vendor ID in data-warehouse | Always use `LafOLpLb6QIFE856TiD4`, never `highfield` (slug). |
| `updateDoc` with `undefined` | Firestore throws. Always use `\|\| null` or `\|\| ''` fallbacks. |
| Radix Tabs with two contexts | Use a SINGLE `<Tabs>` wrapping both `<TabsList>` and `<TabsContent>`. Two separate `<Tabs>` causes empty content. |
| TabsContent with absolute positioning | Use `absolute inset-0` with `data-[state=inactive]:hidden` for proper tab panel sizing. |
| Firestore `in` query limit | Max 30 elements. Slice arrays before using `where('field', 'in', arr)`. |
| Sub-dealer stock visibility | Use `filterOrgId="all-with-parent"` to show parent + own stock. |
| Stock table `readOnly` | Controlled by `!isAdmin && !userPermissions.can_manage_stock`. Hides checkboxes, edit, delete, assign buttons. |
| Import duplicates | Use multi-field fingerprinting (stockNumber + serialNumber + model+colour+label combo). |
| Worktree merges can lose code | Always diff against original before taking worktree version in conflict resolution. |

---

## Git Workflow

- **Dev branch**: `claude/app-overview-wKiZ1` — auto-deploys via Firebase App Hosting
- **Main branch**: `main` — production, merge from dev
- **Feature branches**: `claude/setup-agent-teams-NJq6l` etc
- Push: `git push -u origin <branch>` with retry on 403
- Always create new commits, never amend
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`
